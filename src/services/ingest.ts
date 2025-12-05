import type { Database } from 'bun:sqlite';
import { insertDocument } from '../db/schema';
import { generateEmbeddings, getEmbeddingModelVersion } from './embeddings';
import { generateQuestions, initializeQuestionGenerator } from './questions';
import type { IngestResult } from '../types/index';
import { CHUNK_SIZE, USE_SEMANTIC_CHUNKING } from '../constants/rag';
import { IngestionError } from '../utils/errors';
import { parseCSV, detectCSVSchema } from '../utils/csvs';
import { CODE_FILE_EXTENSIONS, ingestCodeFile } from '../utils/code';
import {
  extractTextFromFile,
  semanticChunking,
  chunkText,
  normalizeForEmbedding,
  stripHtml,
} from '../utils/text';
import { extractAllUrls } from '../utils/sitemap';
import { extractMainContent, isValidUrl, normalizeUrl } from '../utils/web';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * Ingest a CSV file, processing each row as a separate document
 */
export async function ingestCSV(
  db: Database,
  filePath: string
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;

  try {
    console.log(`Processing CSV: ${filename}`);

    // Read and parse CSV file
    const file = Bun.file(filePath);
    const content = await file.text();
    const rows = parseCSV(content);

    if (rows.length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No rows found in CSV file',
      };
    }

    console.log(`  Found ${rows.length} rows to process`);

    // Detect CSV schema from column names
    const columns = Object.keys(rows[0] || {});
    const schema = detectCSVSchema(columns);

    if (!schema.detected) {
      console.log(
        '  Warning: No standard columns detected, will use all columns'
      );
    } else {
      console.log('  Detected schema mapping:');
      if (schema.title) console.log(`    - Title: ${schema.title}`);
      if (schema.content) console.log(`    - Content: ${schema.content}`);
      if (schema.link) console.log(`    - Link: ${schema.link}`);
      if (schema.collection)
        console.log(`    - Collection: ${schema.collection}`);
      if (schema.html) console.log(`    - HTML: ${schema.html}`);
      if (schema.thesis) console.log(`    - Thesis: ${schema.thesis}`);
    }

    // Initialize question generator
    if (!schema.thesis) {
      console.log('  Initializing question generator...');
      await initializeQuestionGenerator();
    }

    // Get embedding model version
    const modelVersion = getEmbeddingModelVersion();

    let processedCount = 0;

    // Process each row
    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]!;
      console.log(`  Processing row ${rowIdx + 1}/${rows.length}...`);

      // Extract and combine main content fields using detected schema
      const title = schema.title ? row[schema.title] || '' : '';
      const contentField = schema.content ? row[schema.content] || '' : '';
      const link = schema.link ? row[schema.link] || '' : '';
      const collection = schema.collection ? row[schema.collection] || '' : '';
      const htmlField = schema.html ? row[schema.html] || '' : '';
      const thesisField = schema.thesis ? row[schema.thesis] || '' : '';

      // Strip HTML from content and html fields
      const contentClean = stripHtml(contentField);
      const htmlClean = htmlField ? stripHtml(htmlField) : '';

      // Combine all text content, including stripped HTML if available
      const textParts = [title, contentClean];
      if (htmlClean && htmlClean !== contentClean) {
        textParts.push(htmlClean);
      }
      if (link) textParts.push(link);
      if (collection) textParts.push(collection);

      const combinedText = textParts.filter(s => s.trim()).join('\n\n');

      if (!combinedText.trim()) {
        console.log(`  Skipping empty row ${rowIdx + 1}`);
        continue;
      }

      // Create document identifier using filename and title
      const docIdentifier = title
        ? `${filename} - ${title}`
        : `${filename} - Row ${rowIdx + 1}`;

      // Prepare base metadata from remaining columns
      const baseMetadata: Record<string, any> = {
        source_type: 'csv',
        row_index: rowIdx,
        embedding_model: modelVersion,
        ingestion_date: new Date().toISOString(),
        // Store detected schema mapping for transparency
        schema_mapping: {
          title_column: schema.title || null,
          content_column: schema.content || null,
          link_column: schema.link || null,
          collection_column: schema.collection || null,
          html_column: schema.html || null,
          thesis_column: schema.thesis || null,
        },
      };

      // Store all CSV columns as metadata
      for (const [key, value] of Object.entries(row)) {
        if (value && value.trim()) {
          baseMetadata[`csv_${key.toLowerCase().replace(/\s+/g, '_')}`] = value;
        }
      }

      // If we have a provided question/thesis, keep as single Q&A pair (don't chunk)
      // Otherwise, use semantic or fixed-size chunking based on configuration
      const chunks =
        thesisField && thesisField.trim()
          ? [combinedText] // Keep Q&A pairs intact
          : combinedText.length > CHUNK_SIZE
            ? USE_SEMANTIC_CHUNKING
              ? await semanticChunking(combinedText)
              : chunkText(combinedText)
            : [combinedText];

      if (chunks.length > 1) {
        console.log(
          `  Row ${rowIdx + 1}/${rows.length}: Creating ${chunks.length} chunks`
        );
      }

      // Process each chunk
      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        const chunk = chunks[chunkIdx]!;

        // Generate embeddings for this chunk
        const normalizedChunk = normalizeForEmbedding(chunk);
        const [chunkEmbedding] = await generateEmbeddings([normalizedChunk]);

        // Use thesis/question field OR generate questions
        let questions: string[] = [];
        if (thesisField && thesisField.trim()) {
          // Use the same thesis/question for ALL chunks from this row
          questions = [thesisField.trim()];
        } else {
          // No thesis field - generate questions for this chunk
          console.log(
            `    Generating questions for chunk ${chunkIdx + 1}/${chunks.length}...`
          );
          questions = await generateQuestions(chunk);
        }

        // Generate question embeddings
        let questionEmbeddings: number[][] = [];
        if (questions.length > 0) {
          const normalizedQuestions = questions.map(q =>
            normalizeForEmbedding(q)
          );
          questionEmbeddings = await generateEmbeddings(normalizedQuestions);
        }

        // Create chunk-specific metadata
        const chunkMetadata = {
          ...baseMetadata,
          chunk_index: chunkIdx,
          total_chunks_in_row: chunks.length,
          is_chunked: chunks.length > 1,
        };

        // Insert into database with a unique identifier per chunk
        const chunkDocId =
          chunks.length > 1
            ? `${docIdentifier} [Chunk ${chunkIdx + 1}/${chunks.length}]`
            : docIdentifier;

        insertDocument(
          db,
          chunkDocId,
          combinedText, // Full combined content
          chunk, // Individual chunk text
          chunkEmbedding!,
          chunkIdx,
          chunk.length,
          questions,
          questionEmbeddings,
          chunkMetadata
        );

        processedCount++;
      }
    }

    console.log(
      `✓ Successfully processed CSV: ${filename} (${processedCount} rows)`
    );

    return {
      filename,
      chunks_created: processedCount,
      success: true,
    };
  } catch (error) {
    console.error(`✗ Error processing CSV ${filename}:`, error);
    const err = error instanceof Error ? error : new Error(String(error));
    throw new IngestionError(
      `Failed to ingest CSV file ${filename}: ${err.message}`,
      err
    );
  }
}

export async function ingestFile(
  db: Database,
  filePath: string
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;
  const ext = filePath.toLowerCase().split('.').pop();

  // Route CSV files to dedicated CSV ingestion
  if (ext === 'csv') {
    return await ingestCSV(db, filePath);
  }

  // Route code files to whole-file ingestion (no chunking)
  if (ext && CODE_FILE_EXTENSIONS.has(ext)) {
    return await ingestCodeFile(db, filePath);
  }

  try {
    console.log(`Processing: ${filename}`);

    // Extract text from file
    const content = await extractTextFromFile(filePath);

    if (!content || content.trim().length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No text content found in file',
      };
    }

    // Split into chunks (semantic or fixed-size)
    const chunks =
      content.length > CHUNK_SIZE
        ? USE_SEMANTIC_CHUNKING
          ? await semanticChunking(content)
          : chunkText(content)
        : [content];
    console.log(`  Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No valid chunks created from content',
      };
    }

    // Initialize question generator
    console.log('  Initializing question generator...');
    await initializeQuestionGenerator();

    // Batch process embeddings and questions
    console.log('  Generating embeddings for all chunks...');
    // Normalize chunks for embedding to handle spelling variations
    const normalizedChunks = chunks.map(chunk => normalizeForEmbedding(chunk));
    const contentEmbeddings = await generateEmbeddings(normalizedChunks);

    console.log('  Generating questions for all chunks...');
    const allQuestions: string[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      console.log(`  Generating questions for chunk ${i + 1}/${chunks.length}`);
      const questions = await generateQuestions(chunk);
      allQuestions.push(questions);
    }

    // Batch generate question embeddings
    console.log('  Generating question embeddings...');
    const allQuestionEmbeddings: number[][][] = [];
    for (const questions of allQuestions) {
      if (questions.length > 0) {
        // Normalize questions for embedding to handle spelling variations
        const normalizedQuestions = questions.map(q =>
          normalizeForEmbedding(q)
        );
        const questionEmbeddings =
          await generateEmbeddings(normalizedQuestions);
        allQuestionEmbeddings.push(questionEmbeddings);
      } else {
        allQuestionEmbeddings.push([]);
      }
    }

    // Get embedding model version for metadata
    const modelVersion = getEmbeddingModelVersion();

    // Insert all chunks into database
    console.log('  Inserting chunks into database...');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const contentEmbedding = contentEmbeddings[i]!;
      const questions = allQuestions[i]!;
      const questionEmbeddings = allQuestionEmbeddings[i]!;

      // Create enhanced chunk metadata
      const chunkMetadata = {
        chunk_index: i,
        total_chunks: chunks.length,
        char_start: content.indexOf(chunk),
        char_end: content.indexOf(chunk) + chunk.length,
        embedding_model: modelVersion,
        chunking_strategy: USE_SEMANTIC_CHUNKING ? 'semantic' : 'fixed-size',
        ingestion_date: new Date().toISOString(),
      };

      // Insert document with embeddings and metadata
      insertDocument(
        db,
        filename,
        content,
        chunk,
        contentEmbedding,
        i,
        chunk.length,
        questions,
        questionEmbeddings,
        chunkMetadata
      );
    }

    console.log(`✓ Successfully processed: ${filename}`);

    return {
      filename,
      chunks_created: chunks.length,
      success: true,
    };
  } catch (error) {
    console.error(`✗ Error processing ${filename}:`, error);
    const err = error instanceof Error ? error : new Error(String(error));
    throw new IngestionError(
      `Failed to ingest file ${filename}: ${err.message}`,
      err
    );
  }
}

export async function ingestDirectory(
  db: Database,
  directoryPath: string
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  try {
    // Build glob pattern that includes PDFs, TXTs, CSVs, and all code files
    const codeExtensions = Array.from(CODE_FILE_EXTENSIONS).join(',');
    const globPattern = `**/*.{pdf,txt,csv,${codeExtensions}}`;

    // Read directory contents using Bun's native Glob API
    const files = await Array.fromAsync(
      new Bun.Glob(globPattern).scan({ cwd: directoryPath })
    );

    if (files.length === 0) {
      console.error('No supported files found in directory');
      return results;
    }

    console.log(`Found ${files.length} files to process\n`);

    for (const file of files) {
      const fullPath = `${directoryPath}/${file}`;
      const result = await ingestFile(db, fullPath);
      results.push(result);
    }

    return results;
  } catch (error) {
    console.error('Error reading directory:', error);
    return results;
  }
}

/**
 * Ingest content from a sitemap URL by visiting each page and extracting content
 * Uses Playwright browser automation to bypass bot detection
 */
export async function ingestSitemap(
  db: Database,
  sitemapUrl: string
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n=== Processing Sitemap: ${sitemapUrl} ===\n`);

    // Extract all URLs from sitemap (handles nested sitemaps)
    console.log('Extracting URLs from sitemap...');
    const sitemapUrls = await extractAllUrls(sitemapUrl);

    if (sitemapUrls.length === 0) {
      console.error('No URLs found in sitemap');
      return results;
    }

    console.log(`\nFound ${sitemapUrls.length} URLs to process\n`);

    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({
      headless: true,
    });

    // Create a single page context that we'll reuse
    page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Initialize question generator once
    console.log('Initializing question generator...');
    await initializeQuestionGenerator();

    // Get embedding model version
    const modelVersion = getEmbeddingModelVersion();

    // Process each URL
    for (let i = 0; i < sitemapUrls.length; i++) {
      const sitemapEntry = sitemapUrls[i]!;
      const url = sitemapEntry.loc;

      console.log(`\nProcessing URL ${i + 1}/${sitemapUrls.length}: ${url}`);

      // Validate URL
      if (!isValidUrl(url)) {
        console.log(`  ✗ Skipping invalid URL: ${url}`);
        results.push({
          filename: url,
          chunks_created: 0,
          success: false,
          error: 'Invalid URL',
        });
        continue;
      }

      const normalizedUrl = normalizeUrl(url);

      try {
        // Navigate to the page using Playwright
        console.log('  Loading page...');

        if (!page) {
          throw new Error('Browser page not initialized');
        }

        // Navigate with timeout
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 30000, // 30 second timeout
        });

        // Wait a bit for any dynamic content to load
        await page.waitForTimeout(2000);

        // Extract title
        const pageTitle = await page.title();

        // Remove non-content elements before extracting text
        await page.evaluate(() => {
          // Remove common non-content elements
          const selectorsToRemove = [
            // 'header', //tw has bad html5 tagging
            'footer',
            'nav',
            'aside',
            '[role="navigation"]',
            '[role="banner"]',
            '[role="complementary"]',
            '[role="contentinfo"]',
            // Headers and footers by class/id
            '[class*="header"]',
            '[id*="header"]',
            '[class*="footer"]',
            '[id*="footer"]',
            // Cookie/consent banners
            '[class*="cookie"]',
            '[id*="cookie"]',
            '[class*="consent"]',
            '[id*="consent"]',
            // Social media widgets
            '[class*="social"]',
            '[class*="share"]',
            // Comments sections
            '[class*="comment"]',
            '[id*="comment"]',
            '#disqus_thread',
            // Sidebars
            '[class*="sidebar"]',
            '[id*="sidebar"]',
            // Navigation and menus
            '[class*="menu"]',
            '[class*="navigation"]',
            '[id*="menu"]',
            // Ads and promotional content
            '[class*="ad-"]',
            '[class*="advertisement"]',
            '[id*="ad-"]',
            '[class*="promo"]',
            // Related/recommended content
            '[class*="related"]',
            '[class*="recommended"]',
            // Newsletter signups
            '[class*="newsletter"]',
            '[class*="subscribe"]',
            // Popups and modals
            '[class*="modal"]',
            '[class*="popup"]',
            '[class*="overlay"]',
          ];

          selectorsToRemove.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => el.remove());
            } catch (e) {
              // Selector might not be valid, skip it
            }
          });
        });

        // Get all body text (with unwanted elements already removed)
        const mainText = (await page.innerText('body'))
          .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
          .replace(/[ \t]+/g, ' ') // Multiple spaces to single space
          .replace(/^\s+|\s+$/gm, '') // Trim each line
          .trim();

        // Get meta description if available
        let description = '';
        try {
          const metaDesc = await page.$('meta[name="description"]');
          if (metaDesc) {
            description = (await metaDesc.getAttribute('content')) || '';
          }
        } catch (e) {
          // No description meta tag
        }

        const extracted = {
          text: mainText,
          title: pageTitle || 'Untitled',
          description,
          url: normalizedUrl,
        };

        if (!extracted.text || extracted.text.trim().length === 0) {
          console.log('  ✗ No content extracted from page');
          results.push({
            filename: normalizedUrl,
            chunks_created: 0,
            success: false,
            error: 'No content extracted',
          });
          continue;
        }

        console.log(
          `  Extracted ${extracted.text.length} characters from "${extracted.title}"`
        );

        // Chunk the content
        const chunks =
          extracted.text.length > CHUNK_SIZE
            ? USE_SEMANTIC_CHUNKING
              ? await semanticChunking(extracted.text)
              : chunkText(extracted.text)
            : [extracted.text];

        console.log(`  Created ${chunks.length} chunks`);

        // Process each chunk
        for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
          const chunk = chunks[chunkIdx]!;

          // Generate embeddings for this chunk
          const normalizedChunk = normalizeForEmbedding(chunk);
          const [chunkEmbedding] = await generateEmbeddings([normalizedChunk]);

          // Generate questions for this chunk
          console.log(
            `  Generating questions for chunk ${chunkIdx + 1}/${chunks.length}...`
          );
          const questions = await generateQuestions(chunk);

          // Generate question embeddings
          let questionEmbeddings: number[][] = [];
          if (questions.length > 0) {
            const normalizedQuestions = questions.map(q =>
              normalizeForEmbedding(q)
            );
            questionEmbeddings = await generateEmbeddings(normalizedQuestions);
          }

          // Create chunk-specific metadata
          const chunkMetadata = {
            source_type: 'sitemap',
            source_url: normalizedUrl,
            sitemap_source: sitemapUrl,
            page_title: extracted.title,
            page_description: extracted.description || null,
            chunk_index: chunkIdx,
            total_chunks: chunks.length,
            is_chunked: chunks.length > 1,
            embedding_model: modelVersion,
            chunking_strategy: USE_SEMANTIC_CHUNKING
              ? 'semantic'
              : 'fixed-size',
            ingestion_date: new Date().toISOString(),
            lastmod: sitemapEntry.lastmod || null,
            priority: sitemapEntry.priority || null,
          };

          // Create document identifier
          const docIdentifier =
            chunks.length > 1
              ? `${extracted.title} [Chunk ${chunkIdx + 1}/${chunks.length}]`
              : extracted.title;

          // Insert into database
          insertDocument(
            db,
            docIdentifier,
            extracted.text, // Full page content
            chunk, // Individual chunk
            chunkEmbedding!,
            chunkIdx,
            chunk.length,
            questions,
            questionEmbeddings,
            chunkMetadata
          );
        }

        console.log(
          `  ✓ Successfully processed: ${extracted.title} (${chunks.length} chunks)`
        );

        results.push({
          filename: normalizedUrl,
          chunks_created: chunks.length,
          success: true,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ ${errorMsg}`);
        results.push({
          filename: normalizedUrl,
          chunks_created: 0,
          success: false,
          error: errorMsg,
        });
        // Continue with next URL
      }
    }

    console.log('\n=== Sitemap Ingestion Complete ===');
    const successful = results.filter(r => r.success);
    const totalChunks = successful.reduce(
      (sum, r) => sum + r.chunks_created,
      0
    );
    console.log(
      `Successfully processed: ${successful.length}/${results.length} pages`
    );
    console.log(`Total chunks created: ${totalChunks}`);

    return results;
  } catch (error) {
    console.error('Error processing sitemap:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    throw new IngestionError(
      `Failed to ingest sitemap ${sitemapUrl}: ${err.message}`,
      err
    );
  } finally {
    // Clean up browser resources
    if (page) {
      await page.close().catch(e => console.error('Error closing page:', e));
    }
    if (browser) {
      await browser
        .close()
        .catch(e => console.error('Error closing browser:', e));
    }
  }
}
