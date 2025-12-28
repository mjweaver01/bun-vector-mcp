# Vector MCP Server with Bun

A type-safe vector database built with Bun, using SQLite for storage and hybrid question-based embeddings for superior semantic search.

## Features

- 🚀 Built with Bun for maximum performance
- 📊 SQLite-based storage using `bun:sqlite`
- 🤖 AI SDK integration with support for multiple providers
- 🧠 Hybrid Question-Based RAG using Hypothetical Question Embedding (HQE)
- 📄 PDF, text, CSV, and code file support
- 🌐 Sitemap-based web content ingestion
- 🔍 Advanced semantic search via weighted hybrid similarity
- 🛡️ Fully type-safe with TypeScript
- 🌐 REST API for searching and asking questions

## Installation

```bash
bun install
```

### SQLite Setup (Apple Silicon)

If you're on an Apple Silicon Mac and encounter SQLite errors, you need ARM64 Homebrew:

```bash
# 1. Install ARM64 Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Add to PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc

# 3. Install ARM64 SQLite
/opt/homebrew/bin/brew install sqlite

# 4. Verify it's ARM64
file /opt/homebrew/opt/sqlite/lib/libsqlite3.dylib
```

### For Sitemap Ingestion (Optional)

If you plan to use the sitemap ingestion feature, install Playwright browsers:

```bash
bunx playwright install chromium
```

This downloads a real Chromium browser that bypasses bot detection when scraping websites.

## Configuration

This project uses **AI SDK** for embeddings and LLM functionality. You can use LMStudio, OpenAI, or any OpenAI-compatible API.

### LMStudio Setup (Recommended for Local)

1. Download and install [LMStudio](https://lmstudio.ai/)
2. Load your preferred embedding model and LLM in LMStudio
3. Start the LMStudio server (default: `http://localhost:1234`)
4. Create a `.env` file (optional, defaults work with LMStudio):

```bash
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:1234/v1
AI_API_KEY=lm-studio

# Model names (must match models loaded in LMStudio)
LLM_MODEL=llama-3.2-3b-instruct
EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
```

### OpenAI or Other Cloud Providers

```bash
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-openai-api-key
LLM_MODEL=gpt-4.1-mini
EMBEDDING_MODEL=text-embedding-3-small
```

## MCP Integration

This vector database can be used as an MCP (Model Context Protocol) server with Claude Desktop or other MCP clients.

### Setup with Claude Desktop

1. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mw-vector": {
      "command": "bun",
      "args": ["mcp.ts"],
      "cwd": "PUBLIC_ENDPOINT"
    }
  }
}
```

1. Restart Claude Desktop

2. Use the following tools in Claude:
   - `vector_search` - Search for similar content
   - `vector_ask` - Ask questions and get AI-generated answers (RAG)
   - `vector_status` - Check database status

## Usage

### 1. Feed Documents

#### Option A: Local Files

Place your PDF, text, CSV, or code files in the `./source` directory, then run:

```bash
bun run feed
```

Or specify a custom directory:

```bash
bun scripts/feed-files.ts /path/to/your/documents
```

#### Option B: Website Sitemap

Ingest content from a website using its sitemap:

```bash
bun run feed-sitemap https://docs.example.com/sitemap.xml
```

This will:

- Parse the sitemap (handles nested sitemap indexes)
- Launch a real Chrome browser (via Playwright)
- Visit each URL and extract rendered content
- Process content through the same RAG pipeline

**Note:** This uses Playwright browser automation to bypass bot detection (Cloudflare, etc.). The first time you run it, make sure you've installed the browser: `bunx playwright install chromium`

#### What Happens During Ingestion

The ingestion process will:

- Extract text from all supported files (PDF, TXT, CSV, code files, or web pages)
- Split content into chunks (with overlap)
- Generate hypothetical questions per chunk using LLM
- Generate embeddings for content AND questions using your configured embedding model
- Store everything in the SQLite database

### 2. Start the API Server

```bash
bun start
```

Or with hot reload during development:

```bash
bun run dev
```

The server will start on `http://localhost:1738`

### 3. Search or Ask Questions

#### Search for Similar Documents

```bash
curl -X POST http://localhost:1738/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your search query", "topK": 5}'
```

#### Ask Questions (RAG with LLM)

```bash
curl -X POST http://localhost:1738/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the conjugate method?"}'
```

## API Endpoints

### `GET /`

Health check and API information

### `GET /health`

Server health status and document count

### `POST /search`

Search for similar documents

## How It Works

### Hybrid Question-Based Vector Search

This system uses an advanced **Hypothetical Question Embedding (HQE)** approach:

1. **Ingestion**:
   - Documents are parsed and split into overlapping chunks
   - For each chunk, an LLM generates 5 hypothetical questions the chunk would answer
   - Both the content AND the questions are embedded
   - All embeddings stored in SQLite with metadata

2. **Search**:
   - Query text is embedded using the same model
   - **Hybrid scoring**: Similarity computed against both question embeddings (60% weight) and content embeddings (40% weight)
   - This matches user queries more accurately since queries are naturally question-like

3. **Results**: Top-K most similar chunks returned based on weighted hybrid score

**Why this works better:** User queries like "How should I train?" align more closely with embedded questions like "What are effective training methods?" than with raw content chunks about training methodologies.

### RAG (Retrieval-Augmented Generation)

1. **Retrieval**: The question is first used to search for the most relevant document chunks (hybrid vector search)
2. **Context**: Relevant chunks are combined to form context for the LLM
3. **Generation**: A local LLM generates an answer based on the question and retrieved context
4. **Response**: The answer is returned along with source citations

## Technical Details

### Configuration

- **Provider**: AI SDK (LMStudio/OpenAI/etc)
- **Embedding Model**: Configurable via environment variable (default: nomic-embed-text)
- **Embedding Dimensions**: 768 (default for nomic-embed-text)
- **Chunk Size**: 1200 characters with 400 character overlap
- **Questions Per Chunk**: 5 (configurable in `src/constants/rag.ts`)
- **Hybrid Search Weights**: 60% question similarity, 40% content similarity
- **Similarity Metric**: Cosine similarity
- **Database**: SQLite via `bun:sqlite`

## Performance

- **LMStudio**: Ensure models are loaded before running
- **Cloud providers**: API rate limits and costs may apply
- **Can use more powerful models for better results**

## License

MIT
