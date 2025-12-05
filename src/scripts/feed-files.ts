import { initializeDatabase, clearDatabase } from '../db/schema';
import { initializeEmbeddings } from '../services/embeddings';
import { ingestDirectory } from '../services/ingest';
import { SOURCE_DIR } from '../constants/dirs';

async function main() {
  console.log('=== Vector Database Feed Script ===\n');

  // Start timer
  const startTime = performance.now();

  // Initialize database
  const db = initializeDatabase();

  // Clear existing data
  clearDatabase(db);

  // Initialize embeddings model
  await initializeEmbeddings();

  // Get source directory from command line or use default
  const sourceDir = process.argv[2] || SOURCE_DIR;
  console.log(`Source directory: ${sourceDir}\n`);

  // Ingest all files from directory
  const results = await ingestDirectory(db, sourceDir);

  // Calculate elapsed time
  const endTime = performance.now();
  const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  console.log('\n=== Ingestion Summary ===');
  console.log(`Total files processed: ${results.length}`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  const totalChunks = successful.reduce((sum, r) => sum + r.chunks_created, 0);
  console.log(`Total chunks created: ${totalChunks}`);
  console.log(`\nTime elapsed: ${elapsedSeconds}s`);

  if (failed.length > 0) {
    console.log('\nFailed files:');
    failed.forEach(f => {
      console.log(`  - ${f.filename}: ${f.error}`);
    });
  }

  db.close();
  console.log('\n✓ Feed complete!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
