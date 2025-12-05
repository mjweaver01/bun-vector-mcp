# RAG Application Architecture

## Overview

This is a **Retrieval-Augmented Generation (RAG)** system built with Bun runtime that enables semantic search and AI-powered question answering over document collections. The system ingests documents (PDF, CSV, TXT), converts them into vector embeddings, stores them in a SQLite database with vector search capabilities, and uses an LLM to generate contextually relevant answers.

## Key Technologies

- **Bun Runtime**: Modern JavaScript runtime with built-in SQLite, HTTP server, and fast bundler
- **sqlite-vec**: Vector similarity search extension with HNSW indexing for O(log n) performance
- **AI SDK**: Flexible embedding and LLM provider support (OpenAI-compatible APIs)
- **React**: Frontend UI with streaming response support
- **Model Context Protocol (MCP)**: Integration with Claude Desktop

---

## High-Level System Architecture

```mermaid
graph TB
    subgraph "Entry Points"
        UI[Web UI<br/>React Frontend]
        API[HTTP API<br/>REST Endpoints]
        MCP[MCP Server<br/>Claude Desktop]
    end

    subgraph "Core Services"
        INGEST[Ingestion Service<br/>ingest.ts]
        EMBED[Embeddings Service<br/>embeddings.ts]
        SEARCH[Search Service<br/>search.ts]
        RAG[RAG Service<br/>rag.ts]
        LLM[LLM Service<br/>llm.ts]
        QUESTIONS[Question Generator<br/>questions.ts]
    end

    subgraph "Data Layer"
        DB[(SQLite Database<br/>vector.db)]
        DOCS[Documents Table<br/>Text + Metadata]
        VEC[vec_embeddings Table<br/>Vector Index]
    end

    subgraph "AI Providers"
        AISDK[AI SDK<br/>OpenAI Compatible]
    end

    UI --> API
    MCP --> SEARCH
    MCP --> RAG
    API --> SEARCH
    API --> RAG
    API --> INGEST

    INGEST --> EMBED
    INGEST --> QUESTIONS
    INGEST --> DB

    SEARCH --> EMBED
    SEARCH --> VEC

    RAG --> SEARCH
    RAG --> LLM

    EMBED --> AISDK
    LLM --> AISDK
    QUESTIONS --> AISDK

    DB --> DOCS
    DB --> VEC

    style UI fill:#e1f5ff
    style API fill:#e1f5ff
    style MCP fill:#e1f5ff
    style DB fill:#ffe1f5
    style DOCS fill:#ffe1f5
    style VEC fill:#ffe1f5
    style AISDK fill:#f0e1ff
```

---

## Data Ingestion Pipeline

The ingestion process transforms raw documents into searchable vector embeddings with enhanced metadata.

```mermaid
flowchart TD
    START[Start: Document File] --> TYPE{File Type?}

    TYPE -->|PDF/TXT| EXTRACT[Extract Text<br/>pdf-parse / Bun.file]
    TYPE -->|CSV| PARSECSV[Parse CSV<br/>Detect Schema]

    EXTRACT --> CONTENT[Combined Content]
    PARSECSV --> SCHEMA[Schema Detection<br/>title, content, link, etc.]

    SCHEMA --> THESIS{Has Thesis/<br/>Question Field?}
    THESIS -->|Yes| SINGLE[Single Chunk<br/>Keep values intact]
    THESIS -->|No| COMBINE[Combine Fields<br/>Strip HTML]

    COMBINE --> CONTENT
    CONTENT --> LENGTH{Content ><br/>CHUNK_SIZE?}

    LENGTH -->|No| SINGLE
    LENGTH -->|Yes| SEMANTIC{USE_SEMANTIC_<br/>CHUNKING?}

    SEMANTIC -->|true| SEMCHUNK[Semantic Chunking<br/>Sentence-based splits]
    SEMANTIC -->|false| FIXCHUNK[Fixed-Size Chunks<br/>~1000 chars]

    SEMCHUNK --> NORMALIZE
    FIXCHUNK --> NORMALIZE
    SINGLE --> NORMALIZE

    NORMALIZE[Normalize Text<br/>Lowercase, remove extra spaces]

    NORMALIZE --> CEMBED[Generate Content<br/>Embeddings]
    NORMALIZE --> QGEN[Generate Hypothetical<br/>Questions]

    QGEN --> QEMBED[Generate Question<br/>Embeddings]

    CEMBED --> STORE
    QEMBED --> STORE

    STORE[Store in Database<br/>documents + vec_embeddings]

    STORE --> META[Store Metadata<br/>chunk_index, model_version,<br/>chunking_strategy, etc.]

    META --> END[End: Indexed Document]

    style START fill:#90EE90
    style END fill:#90EE90
    style STORE fill:#FFB6C1
    style CEMBED fill:#DDA0DD
    style QEMBED fill:#DDA0DD
    style QGEN fill:#87CEEB
    style SEMANTIC fill:#FFD700
    style LENGTH fill:#FFD700
```

### Ingestion Details

**File Processing:**

- **PDF**: Extracted using `pdf-parse` library
- **CSV**: Intelligent schema detection for columns (title, content, link, collection, HTML, thesis)
- **TXT**: Direct text reading via `Bun.file`

**Text Chunking Strategies:**

- **Semantic Chunking**: Splits text at sentence boundaries while maintaining context (preferred)
- **Fixed-Size Chunking**: Splits into ~1000 character chunks with overlap
- **CSV Rows**: Each row processed separately; long rows are chunked

**Hypothetical Questions:**

- Generated for each chunk to improve retrieval accuracy
- Uses AI SDK with LLM model
- Example: For a chunk about "vector databases", generates questions like "What is a vector database?" and "How do vector databases work?"
- These questions are embedded and stored alongside content embeddings

**Metadata Storage:**

- `chunk_index`: Position in original document
- `embedding_model`: Model version used (e.g., "Xenova/all-MiniLM-L6-v2")
- `chunking_strategy`: "semantic" or "fixed-size"
- `ingestion_date`: Timestamp
- CSV-specific: All original CSV fields preserved with `csv_` prefix

---

## Search & Retrieval Flow

The search system uses a **hybrid approach** combining content similarity and question matching for superior retrieval accuracy.

```mermaid
flowchart TD
    START[User Query] --> NORMALIZE[Normalize Query<br/>Lowercase, trim spaces]

    NORMALIZE --> EMBED[Generate Query<br/>Embedding]

    EMBED --> VECTOR[Convert to Float32Array]

    VECTOR --> VEC_SEARCH[sqlite-vec KNN Search<br/>MATCH operator with k=2000]

    VEC_SEARCH --> CANDIDATES[Retrieve Top 2000<br/>Candidates by Distance]

    CANDIDATES --> HYBRID[Hybrid Scoring]

    subgraph "Hybrid Scoring Process"
        HYBRID --> CONTENT[Content Similarity<br/>1.0 - distance/2.0]
        HYBRID --> QUESTIONS[Question Similarity<br/>dot product vs all questions]

        CONTENT --> WEIGHT1[× 0.4 weight]
        QUESTIONS --> WEIGHT2[× 0.6 weight]

        WEIGHT1 --> COMBINE[Combined Score]
        WEIGHT2 --> COMBINE
    end

    COMBINE --> SORT[Sort by Score<br/>Descending]

    SORT --> FILTER[Filter by Threshold<br/>default: 0.5]

    FILTER --> DEDUP[Deduplicate<br/>by chunk_text]

    DEDUP --> TOPK[Take Top K Results<br/>default: 5]

    TOPK --> RESULTS[Return Search Results<br/>with similarity scores]

    style START fill:#90EE90
    style RESULTS fill:#90EE90
    style VEC_SEARCH fill:#FFB6C1
    style HYBRID fill:#DDA0DD
    style DEDUP fill:#87CEEB
```

### Search Algorithm Details

**Vector Search (sqlite-vec):**

```sql
SELECT d.id, d.filename, d.chunk_text, d.question_embeddings, v.distance
FROM vec_embeddings v
INNER JOIN documents d ON v.document_id = d.id
WHERE v.embedding MATCH ? AND k = 2000
ORDER BY v.distance
```

**Why k=2000?**

- Higher candidate count ensures good recall after filtering
- Hybrid scoring, threshold filtering, and deduplication reduce final count
- HNSW index makes this efficient (O(log n) instead of O(n))

**Hybrid Scoring Formula:**

```
hybrid_score = (max_question_similarity × 0.6) + (content_similarity × 0.4)
```

**Why 60/40 weighting?**

- Questions are generated specifically to match user queries
- Content similarity alone misses semantic nuances
- This weighting provides best empirical results

**Deduplication:**

- Removes duplicate chunk_text (same content indexed multiple times)
- Keeps highest-scoring occurrence
- Prevents redundant results

---

## RAG Question-Answering Flow

The RAG system retrieves relevant context and uses an LLM to generate accurate, grounded answers.

```mermaid
flowchart TD
    START[User Question] --> VALIDATE[Validate Input<br/>non-empty, topK, threshold]

    VALIDATE --> SEARCH[Search Similar Documents<br/>hybrid vector search]

    SEARCH --> CHECK{Results Found?}

    CHECK -->|No| NOINFO[Return: No Information<br/>Available]
    CHECK -->|Yes| BUILD[Build Context]

    subgraph "Context Building"
        BUILD --> ITERATE[Iterate Search Results]
        ITERATE --> ADD{Within Max<br/>Context Length?}
        ADD -->|Yes| APPEND[Append with Citation<br/>'Source N: filename, chunk X']
        ADD -->|No| STOP[Stop Adding]
        APPEND --> ITERATE
    end

    STOP --> CONTEXT[Final Context String<br/>with --- separators]

    CONTEXT --> PROMPT[Build LLM Prompt<br/>System + Context + Question]

    PROMPT --> MODE{Streaming?}

    MODE -->|Yes| STREAM[Stream LLM Response]
    MODE -->|No| GENERATE[Generate Full Response]

    subgraph "Streaming Response"
        STREAM --> EMIT_SOURCES[Emit: Sources Event]
        EMIT_SOURCES --> EMIT_CHUNKS[Emit: Text Chunks]
        EMIT_CHUNKS --> EMIT_DONE[Emit: Done Event]
    end

    subgraph "Full Response"
        GENERATE --> WAIT[Wait for Complete Answer]
        WAIT --> RETURN[Return with Sources]
    end

    EMIT_DONE --> END
    RETURN --> END
    NOINFO --> END

    END[End: User Receives Answer]

    style START fill:#90EE90
    style END fill:#90EE90
    style SEARCH fill:#FFB6C1
    style PROMPT fill:#DDA0DD
    style STREAM fill:#87CEEB
    style GENERATE fill:#87CEEB
```

### RAG Pipeline Details

**Step 1: Document Retrieval**

- Performs hybrid vector search (see Search Flow above)
- Default: Top 5 most relevant chunks
- Configurable similarity threshold (default: 0.5)

**Step 2: Context Building**

- Maximum context length: ~96,000 characters (configurable)
- Each chunk includes source citation for attribution
- Format:

  ```
  [Source 1: document.pdf, chunk 3]
  <chunk text>

  ---

  [Source 2: another.pdf, chunk 1]
  <chunk text>
  ```

**Step 3: LLM Prompting**

- **System Prompt**: Instructs LLM to answer based on provided context
- **Context**: Retrieved document chunks with citations
- **User Question**: Original question

Default System Prompt:

```
You are a helpful AI assistant. Answer the question based on the context provided.
Be concise, accurate, and cite sources when possible. If the context doesn't
contain enough information, say so.
```

**Step 4: Answer Generation**

_Non-Streaming Mode:_

- Waits for complete LLM response
- Returns answer + sources + timing info

_Streaming Mode (SSE):_

1. `sources` event: Relevant documents with similarity scores
2. `chunk` events: Text tokens as they're generated
3. `done` event: Completion timestamp

---

## Database Schema

The system uses SQLite with the sqlite-vec extension for efficient vector storage and retrieval.

```mermaid
erDiagram
    DOCUMENTS ||--|| VEC_EMBEDDINGS : "1:1 relationship"

    DOCUMENTS {
        integer id PK
        text filename
        text content "Full original text"
        text chunk_text "Individual chunk"
        blob embedding "Content embedding (serialized)"
        integer chunk_index "Position in document"
        integer chunk_size "Character count"
        text hypothetical_questions "JSON array"
        blob question_embeddings "Serialized vectors"
        text chunk_metadata "JSON metadata"
        integer created_at "Unix timestamp"
    }

    VEC_EMBEDDINGS {
        integer document_id PK
        float_array embedding "Vector for HNSW index"
    }
```

### Schema Details

**documents Table:**

- Main storage for document chunks and metadata
- `embedding`: Serialized Float32Array as BLOB for JavaScript processing
- `question_embeddings`: Multiple vectors for hypothetical questions
- `chunk_metadata`: JSON with chunking strategy, model version, custom fields

**vec_embeddings Virtual Table:**

- Uses sqlite-vec's `vec0` virtual table type
- Automatically maintains HNSW index for fast KNN search
- Dimension count: 768 (default for nomic-embed-text, configurable)
- Enables `MATCH` operator for indexed search

**Indexes:**

- `idx_filename`: Fast lookup by document name
- `idx_chunk_index`: Fast ordering within documents
- HNSW vector index: Automatic in vec_embeddings

---

## API Endpoints

### HTTP API (Bun.serve)

The application exposes a REST API via Bun's built-in HTTP server:

| Endpoint      | Method | Description                           |
| ------------- | ------ | ------------------------------------- |
| `/`           | GET    | API information and document count    |
| `/ui`         | GET    | Web UI (React frontend)               |
| `/health`     | GET    | Health check with database status     |
| `/search`     | POST   | Semantic search for similar documents |
| `/ask`        | POST   | Ask a question (RAG, full response)   |
| `/ask/stream` | POST   | Ask a question (RAG, streaming SSE)   |

**Example `/search` Request:**

```json
{
  "query": "What is vector search?",
  "topK": 5,
  "similarityThreshold": 0.5
}
```

**Example `/ask` Request:**

```json
{
  "question": "How do embeddings work?",
  "topK": 5,
  "maxAnswerLength": 800,
  "systemPrompt": "Be concise and technical."
}
```

### MCP Server

The MCP (Model Context Protocol) server enables Claude Desktop integration:

**Available Tools:**

- `vector_search`: Search the vector database
- `vector_ask`: Ask questions with RAG
- `vector_status`: Get database status

Usage in Claude Desktop:

```json
{
  "mcpServers": {
    "bun-vector": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/bun-vector-mcp"
    }
  }
}
```

---

## Configuration

### Provider Type

The system uses **AI SDK** with OpenAI-compatible APIs:

```typescript
EMBEDDING_MODEL = 'text-embedding-nomic-embed-text-v1.5';
LLM_MODEL = 'qwen3-1.7b';
AI_BASE_URL = 'http://localhost:1234/v1';
AI_API_KEY = 'lm-studio';
```

**Benefits:**

- Fast inference
- No local model downloads
- Higher quality embeddings and generation
- Flexible model selection
- Works with LMStudio, OpenAI, or any compatible API

### RAG Parameters

**Chunking:**

- `CHUNK_SIZE`: 1200 characters
- `CHUNK_OVERLAP`: 400 characters
- `MIN_CHUNK_SIZE`: 50 characters
- `USE_SEMANTIC_CHUNKING`: true

**Search:**

- `DEFAULT_TOP_K`: 5 results
- `SIMILARITY_THRESHOLD`: 0.6 (60% similarity)
- `QUESTION_WEIGHT`: 0.6
- `CONTENT_WEIGHT`: 0.4

**Context Assembly:**

- `MAX_CONTEXT_LENGTH`: 48,000 characters (CHUNK_SIZE × 40)

**Generation:**

- `MAX_ANSWER_TOKENS`: 6000 (CHUNK_SIZE × 5)
- `GENERATION_TEMPERATURE`: 0.3

---

## Performance Characteristics

### Search Performance

**Vector Index (sqlite-vec):**

- Algorithm: HNSW (Hierarchical Navigable Small World)
- Time Complexity: O(log n) for KNN search
- Space Complexity: ~1.5x embedding size (index overhead)

**Typical Search Times:**

- 10K documents: 10-30ms
- 100K documents: 20-50ms
- 1M documents: 40-100ms

_Note: Times vary based on hardware, embedding dimensions, and k value_

### Ingestion Performance

**Bottlenecks:**

1. PDF text extraction: ~1-5 seconds per document
2. Embedding generation: ~50ms per chunk (with batching)
3. Question generation: ~200ms per chunk

**Optimization Strategies:**

- Batch embedding generation (10 chunks at once)
- Caching for duplicate texts
- Parallel processing where possible

---

## Frontend Architecture

The web UI is built with React and uses Server-Sent Events (SSE) for streaming responses.

### Component Structure

```
App.tsx
├── QueryInput.tsx       # Search/ask mode switcher, input fields
├── ResponseDisplay.tsx  # Shows results/answers
├── SourcesList.tsx      # Displays source documents
└── ThemeToggle.tsx      # Dark/light mode switch
```

### Streaming Implementation

```typescript
// Client-side (useQuery hook)
const eventSource = new EventSource('/ask/stream', {
  method: 'POST',
  body: JSON.stringify({ question }),
});

eventSource.addEventListener('message', e => {
  const event = JSON.parse(e.data);

  if (event.type === 'sources') {
    setSources(event.sources);
  } else if (event.type === 'chunk') {
    setAnswer(prev => prev + event.text);
  } else if (event.type === 'done') {
    setIsLoading(false);
  }
});
```

---

## Deployment

### Running the Application

**Development (with HMR):**

```bash
bun --watch src/index.ts
```

**Production:**

```bash
bun src/index.ts
```

**Ingest Files:**

```bash
bun src/scripts/feed-files.ts [source-directory]
```

**Ingest Sitemap:**

```bash
bun src/scripts/feed-sitemap.ts <sitemap-url>
```

**MCP Server:**

```bash
bun run mcp
```

### Environment Variables

```bash
# Provider configuration
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
LLM_MODEL=qwen3-1.7b
AI_BASE_URL=http://localhost:1234/v1
AI_API_KEY=lm-studio

# Database
DB_PATH=./vector.db

# MCP Mode
MCP_MODE=true                  # For MCP server only
```

---

## System Requirements

**For AI SDK:**

- Stable internet connection (for cloud APIs) or local LMStudio server
- API access (OpenAI, Anthropic, or compatible)
- Minimal local resources

**General:**

- Bun runtime (latest version)
- SQLite with extension support
- Node.js 18+ (for some dependencies)

---

## Key Design Decisions

### Why Hybrid Search?

Pure content similarity misses semantic nuances. By generating and embedding hypothetical questions, we capture the **intent** behind each chunk. This dramatically improves retrieval for natural language queries.

**Example:**

- Chunk: "Vector databases store embeddings as arrays of floating-point numbers."
- Generated Question: "How are embeddings stored in vector databases?"
- User Query: "embedding storage format"

The user query matches the question better than the raw content, leading to better retrieval.

### Why sqlite-vec?

- **Integrated**: No separate vector database service
- **Fast**: HNSW indexing provides near-instant search
- **Simple**: Single SQLite file for entire application state
- **Proven**: SQLite is battle-tested and reliable
- **Portable**: Database file can be copied/backed up easily

### Why Bun?

- **Fast**: Faster than Node.js for most operations
- **Integrated**: Built-in SQLite, HTTP server, bundler
- **Modern**: Native TypeScript support, top-level await
- **Simple**: Less configuration and tooling needed
- **HTML Imports**: Serve React directly from HTML without separate build step

---

## Future Enhancements

### Potential Improvements

1. **Multi-Vector Search**: Store multiple embeddings per chunk (different aspects)
2. **Re-ranking**: Use cross-encoder models to re-rank search results
3. **Query Expansion**: Automatically generate query variations
4. **Feedback Loop**: Learn from user interactions to improve retrieval
5. **Document Updates**: Handle document versioning and updates
6. **Access Control**: Add user authentication and document permissions
7. **Analytics**: Track popular queries and document usage
8. **Export**: Generate reports and summaries from document collection

### Scalability Considerations

**Current Limits:**

- Single SQLite file (~1TB theoretical max)
- In-memory embeddings during ingestion
- Single-threaded search (sqlite-vec limitation)

**For Large Scale:**

- Consider PostgreSQL with pgvector extension
- Implement distributed search (e.g., Qdrant, Weaviate)
- Add caching layer (Redis) for frequent queries
- Use message queue for async ingestion

---

## Troubleshooting

### Common Issues

**sqlite-vec extension not loading:**

- Solution: Install Homebrew SQLite: `brew install sqlite`
- Verify: Check logs for "Using Homebrew SQLite"

**Out of memory during ingestion:**

- Solution: Process files in smaller batches
- Reduce `CHUNK_SIZE` or use fixed-size chunking

**Slow search performance:**

- Check document count (may need database optimization)
- Reduce `topK` or increase `SIMILARITY_THRESHOLD`
- Ensure vec_embeddings index is built

**Poor answer quality:**

- Increase `topK` for more context
- Lower `SIMILARITY_THRESHOLD` to get more results
- Adjust system prompt for better instructions
- Try different embedding model (larger dimensions)

---

## Conclusion

This RAG system demonstrates a production-ready architecture for semantic search and question answering. By combining modern web technologies (Bun, React) with advanced AI techniques (embeddings, hybrid search, LLMs), it provides a powerful and flexible platform for working with document collections.

The modular design allows easy customization of embedding models, LLM providers, chunking strategies, and search algorithms, making it adaptable to a wide range of use cases from personal knowledge bases to enterprise documentation systems.
