import { Database } from 'bun:sqlite';
import * as sqliteVec from 'sqlite-vec';
import { existsSync } from 'node:fs';
import { EMBEDDING_DIMENSIONS } from '../constants/providers';
import { serializeVector } from '../utils/vectors';
import { log, error } from '../utils/logger';

/**
 * Merge multiple vector databases into one
 * Usage: bun run merge-db <source1> <source2> [...sourceN] <target>
 *
 * Example: bun run merge-db _vector.db vector.db merged_vector.db
 */

interface DocumentRow {
  id: number;
  filename: string;
  content: string;
  chunk_text: string;
  embedding: Uint8Array;
  chunk_index: number;
  chunk_size: number;
  hypothetical_questions: string | null;
  question_embeddings: Uint8Array | null;
  chunk_metadata: string | null;
  created_at: number;
}

function openDatabase(path: string): Database {
  const db = new Database(path);

  // Load sqlite-vec extension
  try {
    sqliteVec.load(db);
  } catch (err) {
    error(`Warning: Could not load sqlite-vec for ${path}:`, err);
  }

  return db;
}

function createTargetDatabase(path: string): Database {
  // On macOS, configure custom SQLite before creating database
  if (process.platform === 'darwin') {
    // Choose the correct path based on architecture
    // Apple Silicon (arm64) uses /opt/homebrew, Intel (x86_64) uses /usr/local
    const homebrewPath = process.arch === 'arm64'
      ? '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib'
      : '/usr/local/opt/sqlite/lib/libsqlite3.dylib';
    
    if (existsSync(homebrewPath)) {
      try {
        Database.setCustomSQLite(homebrewPath);
      } catch {
        // Use system SQLite
      }
    }
  }

  const db = new Database(path, { create: true });

  // Load sqlite-vec extension
  sqliteVec.load(db);

  // Create documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      content TEXT NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding BLOB NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      chunk_size INTEGER DEFAULT 0,
      hypothetical_questions TEXT,
      question_embeddings BLOB,
      chunk_metadata TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  // Create vec0 virtual table for indexed vector search
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(
      document_id INTEGER PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    )
  `);

  // Create indexes
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_filename ON documents(filename)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_chunk_index ON documents(chunk_index)
  `);

  return db;
}

function getDocuments(db: Database): DocumentRow[] {
  const stmt = db.prepare(`
    SELECT id, filename, content, chunk_text, embedding, chunk_index, chunk_size, 
           hypothetical_questions, question_embeddings, chunk_metadata, created_at
    FROM documents
  `);

  return stmt.all() as DocumentRow[];
}

function insertDocument(db: Database, doc: DocumentRow): number {
  const stmt = db.prepare(`
    INSERT INTO documents (filename, content, chunk_text, embedding, chunk_index, chunk_size, 
                          hypothetical_questions, question_embeddings, chunk_metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    doc.filename,
    doc.content,
    doc.chunk_text,
    doc.embedding,
    doc.chunk_index,
    doc.chunk_size,
    doc.hypothetical_questions,
    doc.question_embeddings,
    doc.chunk_metadata,
    doc.created_at
  );

  const documentId = result.lastInsertRowid as number;

  // Also insert into vec_embeddings virtual table
  // Convert embedding Uint8Array to Float32Array for vec0
  const embeddingVector = new Float32Array(
    doc.embedding.buffer,
    doc.embedding.byteOffset,
    doc.embedding.byteLength / 4
  );
  const embeddingBlob = new Uint8Array(embeddingVector.buffer);

  const vecStmt = db.prepare(`
    INSERT INTO vec_embeddings (document_id, embedding)
    VALUES (?, ?)
  `);

  vecStmt.run(documentId, embeddingBlob);

  return documentId;
}

async function main() {
  log('=== Vector Database Merge Script ===\n');

  const args = process.argv.slice(2);

  if (args.length < 3) {
    error('Error: Not enough arguments');
    log(
      '\nUsage: bun run merge-db <source1> <source2> [...sourceN] <target>'
    );
    log('\nExample:');
    log('  bun run merge-db _vector.db vector.db merged_vector.db');
    log(
      '\nThis will merge _vector.db and vector.db into merged_vector.db'
    );
    process.exit(1);
  }

  const sourcePaths = args.slice(0, -1);
  const targetPath = args[args.length - 1]!;

  log('Source databases:');
  sourcePaths.forEach((path, i) => log(`  ${i + 1}. ${path}`));
  log(`\nTarget database: ${targetPath}\n`);

  // Check if target already exists
  const targetExists = await Bun.file(targetPath).exists();
  if (targetExists) {
    error(`Error: Target database "${targetPath}" already exists.`);
    log('Please delete it first or choose a different name.');
    process.exit(1);
  }

  // Start timer
  const startTime = performance.now();

  // Initialize target database
  log('Initializing target database...');
  const targetDb = createTargetDatabase(targetPath);

  // Track statistics
  let totalDocuments = 0;
  const documentsBySource: number[] = [];
  const duplicates = new Set<string>();

  // Process each source database
  for (let i = 0; i < sourcePaths.length; i++) {
    const sourcePath = sourcePaths[i]!;
    log(`\nProcessing ${sourcePath}...`);

    try {
      const sourceDb = openDatabase(sourcePath);
      const documents = getDocuments(sourceDb);

      log(`  Found ${documents.length} documents`);

      let inserted = 0;
      let skipped = 0;

      for (const doc of documents) {
        // Create a unique key for deduplication (filename + chunk_index)
        const key = `${doc.filename}:${doc.chunk_index}`;

        if (duplicates.has(key)) {
          skipped++;
          continue;
        }

        try {
          insertDocument(targetDb, doc);
          duplicates.add(key);
          inserted++;
        } catch (err) {
          error(`  Error inserting document ${doc.id}:`, err);
        }
      }

      log(`  Inserted: ${inserted}`);
      if (skipped > 0) {
        log(`  Skipped (duplicates): ${skipped}`);
      }

      documentsBySource.push(inserted);
      totalDocuments += inserted;

      sourceDb.close();
    } catch (err) {
      error(`  Error processing ${sourcePath}:`, err);
    }
  }

  targetDb.close();

  // Calculate elapsed time
  const endTime = performance.now();
  const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);

  // Print summary
  log('\n=== Merge Summary ===');
  log(`Total documents merged: ${totalDocuments}`);
  log(`Time elapsed: ${elapsedSeconds}s`);

  log('\nDocuments by source:');
  sourcePaths.forEach((path, i) => {
    log(`  ${path}: ${documentsBySource[i]}`);
  });

  log(`\n✓ Merge complete! New database: ${targetPath}`);
}

main().catch(err => {
  error('Fatal error:', err);
  process.exit(1);
});
