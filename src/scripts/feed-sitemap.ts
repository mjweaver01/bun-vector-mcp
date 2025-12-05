import { initializeDatabase, getDocumentCount } from '../db/schema';
import { initializeEmbeddings } from '../services/embeddings';
import { ingestSitemap } from '../services/ingest';

/**
 * CLI script for ingesting content from a website sitemap
 * Usage: bun run feed-sitemap <sitemap-url>
 */

async function main() {
  console.log('=== Vector Database Sitemap Ingestion Script ===');
  console.log('Using Playwright browser automation to bypass bot detection\n');

  // Get sitemap URL from command line
  const sitemapUrl = process.argv[2];

  if (!sitemapUrl) {
    console.error('Error: Sitemap URL is required');
    console.log('\nUsage: bun run feed-sitemap <sitemap-url>');
    console.log('\nExample:');
    console.log('  bun run feed-sitemap https://example.com/sitemap.xml');
    console.log('\nNote: This script uses Playwright to run a real browser.');
    console.log(
      'If you get errors, make sure you have installed the browsers:'
    );
    console.log('  bunx playwright install chromium');
    process.exit(1);
  }

  // Validate URL format
  try {
    new URL(sitemapUrl);
  } catch {
    console.error(`Error: Invalid URL format: ${sitemapUrl}`);
    process.exit(1);
  }

  console.log(`Sitemap URL: ${sitemapUrl}\n`);

  // Start timer
  const startTime = performance.now();

  // Initialize database
  const db = initializeDatabase();

  const beforeCount = getDocumentCount(db);
  console.log(`Current document count: ${beforeCount}\n`);

  // Initialize embeddings model
  await initializeEmbeddings();

  // Ingest sitemap
  console.log('Starting sitemap ingestion...\n');
  const results = await ingestSitemap(db, sitemapUrl);

  // Calculate elapsed time
  const endTime = performance.now();
  const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  console.log('\n=== Ingestion Summary ===');
  console.log(`Total pages processed: ${results.length}`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  const totalChunks = successful.reduce((sum, r) => sum + r.chunks_created, 0);
  console.log(`Total chunks created: ${totalChunks}`);

  const afterCount = getDocumentCount(db);
  console.log(
    `New document count: ${afterCount} (+${afterCount - beforeCount})`
  );

  console.log(`\nTime elapsed: ${elapsedSeconds}s`);

  if (failed.length > 0) {
    console.log('\nFailed pages:');

    // Count error types
    const forbiddenErrors = failed.filter(f => f.error?.includes('403')).length;
    const rateLimitErrors = failed.filter(f => f.error?.includes('429')).length;

    if (forbiddenErrors > 0) {
      console.log(
        `\n⚠️  ${forbiddenErrors} page(s) had errors during browser navigation.`
      );
      console.log(
        '   This could be due to timeouts, network errors, or page issues.\n'
      );
    }

    if (rateLimitErrors > 0) {
      console.log(
        `\n⚠️  ${rateLimitErrors} page(s) returned 429 (Rate Limited) errors.`
      );
      console.log('   The site is rate limiting requests.');
      console.log('   Try running the script again later.\n');
    }

    // Show first 10 failed URLs
    const displayCount = Math.min(failed.length, 10);
    failed.slice(0, displayCount).forEach(f => {
      console.log(`  - ${f.filename}`);
      if (f.error) {
        console.log(`    ${f.error}`);
      }
    });

    if (failed.length > displayCount) {
      console.log(`  ... and ${failed.length - displayCount} more`);
    }
  }

  db.close();
  console.log('\n✓ Sitemap ingestion complete!');

  if (successful.length > 0) {
    console.log(
      `✓ Successfully ingested ${successful.length} pages with ${totalChunks} chunks`
    );
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
