import { initializeDatabase, clearDatabase } from '../db/schema';
import { initializeEmbeddings } from '../services/embeddings';
import { ingestDirectory } from '../services/ingest';
import { SOURCE_DIR } from '../constants/dirs';
import { log, error } from '../utils/logger';

async function main() {
  log('=== Vector Database Feed Script ===\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const clearMode = args.includes('--clear');
  const resumeMode = args.includes('--resume');
  
  // Get source directory (first non-flag argument or default)
  const sourceDir = args.find(arg => !arg.startsWith('--')) || SOURCE_DIR;

  // Start timer
  const startTime = performance.now();

  // Initialize database
  const db = initializeDatabase();

  // Handle clear vs resume mode
  if (resumeMode) {
    log('🔄 Resuming ingestion (skipping already processed files)...\n');
  } else if (clearMode) {
    log('🗑️  Clearing existing data...\n');
    clearDatabase(db);
  } else {
    log('ℹ️  Running in default mode (clear database)');
    log('   Use --resume to skip already processed files');
    log('   Use --clear to explicitly clear the database\n');
    clearDatabase(db);
  }

  // Initialize embeddings model
  await initializeEmbeddings();

  log(`Source directory: ${sourceDir}\n`);

  // Ingest all files from directory
  const results = await ingestDirectory(db, sourceDir, resumeMode);

  // Calculate elapsed time
  const endTime = performance.now();
  const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  log('\n=== Ingestion Summary ===');
  log(`Total files processed: ${results.length}`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const skipped = results.filter(r => r.error === 'Already processed (skipped)');

  log(`Successful: ${successful.length}`);
  if (skipped.length > 0) {
    log(`Skipped (already processed): ${skipped.length}`);
  }
  log(`Failed: ${failed.length}`);

  const totalChunks = successful
    .filter(r => r.error !== 'Already processed (skipped)')
    .reduce((sum, r) => sum + r.chunks_created, 0);
  log(`Total chunks created: ${totalChunks}`);
  log(`\nTime elapsed: ${elapsedSeconds}s`);

  if (failed.length > 0 && failed.some(f => f.error !== 'Already processed (skipped)')) {
    log('\nFailed files:');
    failed
      .filter(f => f.error !== 'Already processed (skipped)')
      .forEach(f => {
        log(`  - ${f.filename}: ${f.error}`);
      });
  }

  db.close();
  log('\n✓ Feed complete!');
}

main().catch(err => {
  error('Fatal error:', err);
  process.exit(1);
});
