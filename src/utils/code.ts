import type { Database } from 'bun:sqlite';
import { insertDocument } from '../db/schema';
import {
  generateEmbeddings,
  getEmbeddingModelVersion,
} from '../services/embeddings';
import {
  generateQuestions,
  initializeQuestionGenerator,
} from '../services/questions';
import type { IngestResult } from '../types/index';
import { IngestionError } from './errors';
import { log, error } from './logger';
import { normalizeForEmbedding } from './text';

// Common code file extensions (ingested as whole files)
export const CODE_FILE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'java',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'cs',
  'go',
  'rs',
  'rb',
  'php',
  'swift',
  'kt',
  'scala',
  'r',
  'sh',
  'bash',
  'zsh',
  'sql',
  'graphql',
  'proto',
  'vue',
  'svelte',
  'html',
  'css',
  'scss',
  'sass',
  'less',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'md',
  'mdx',
  'rst',
  'tex',
]);

/**
 * Check if a file extension is a code file
 */
export function isCodeFile(extension: string): boolean {
  return CODE_FILE_EXTENSIONS.has(extension.toLowerCase());
}

/**
 * Ingest a code file as a complete unit (no chunking)
 */
export async function ingestCodeFile(
  db: Database,
  filePath: string
): Promise<IngestResult> {
  const filename = filePath.split('/').pop() || filePath;

  try {
    log(`Processing code file (whole file): ${filename}`);

    // Read file content directly
    const file = Bun.file(filePath);
    const content = await file.text();

    if (!content || content.trim().length === 0) {
      return {
        filename,
        chunks_created: 0,
        success: false,
        error: 'No content found in file',
      };
    }

    log(`  File size: ${content.length} characters`);

    // Initialize question generator
    log('  Initializing question generator...');
    await initializeQuestionGenerator();

    // Generate embedding for the entire file
    log('  Generating embedding for entire file...');
    const normalizedContent = normalizeForEmbedding(content);
    const [contentEmbedding] = await generateEmbeddings([normalizedContent]);

    // Generate questions for the entire file
    log('  Generating questions for entire file...');
    const questions = await generateQuestions(content);

    // Generate question embeddings
    let questionEmbeddings: number[][] = [];
    if (questions.length > 0) {
      const normalizedQuestions = questions.map(q => normalizeForEmbedding(q));
      questionEmbeddings = await generateEmbeddings(normalizedQuestions);
    }

    // Get embedding model version for metadata
    const modelVersion = getEmbeddingModelVersion();

    // Create metadata for code file
    const metadata = {
      source_type: 'code',
      file_extension: filePath.toLowerCase().split('.').pop() || '',
      embedding_model: modelVersion,
      chunking_strategy: 'whole_file',
      ingestion_date: new Date().toISOString(),
      file_size: content.length,
      is_chunked: false,
    };

    // Insert as single document (no chunking)
    insertDocument(
      db,
      filename,
      content, // Full content
      content, // Chunk is same as full content
      contentEmbedding!,
      0, // Single chunk index
      content.length,
      questions,
      questionEmbeddings,
      metadata
    );

    log(`✓ Successfully processed code file: ${filename}`);

    return {
      filename,
      chunks_created: 1,
      success: true,
    };
  } catch (err) {
    error(`✗ Error processing code file ${filename}:`, err);
    const e = err instanceof Error ? err : new Error(String(err));
    throw new IngestionError(
      `Failed to ingest code file ${filename}: ${e.message}`,
      e
    );
  }
}
