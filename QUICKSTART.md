# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Feed Your Documents

Place PDF or text files in the `./source` folder, then run:

```bash
bun run feed
```

### 2. Start the Server

```bash
bun start
```

### 3. Search Your Data

```bash
curl -X POST http://localhost:1738/search \
  -H "Content-Type: application/json" \
  -d '{"query": "your question here", "topK": 5}'
```

## 📝 Example Usage

Run the included example:

```bash
bun example.ts
```

## 🔧 Available Commands

- `bun run feed` - Ingest documents from ./source folder
- `bun start` - Start the API server
- `bun run dev` - Start with hot reload
- `bun run mcp` - Start MCP server for Claude Desktop
- `bun example.ts` - Run example queries

## 🔍 API Endpoints

- `GET /` - API info
- `GET /health` - Health check
- `POST /search` - Search similar documents

## 🔌 MCP Integration

This database supports MCP; see the example config below:

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

See `MCP-SETUP.md` for detailed instructions.

## 💡 Tips

- First run downloads the embedding model (~80MB)
- Chunks are 500 characters with 100 character overlap
- Similarity scores range from 0 (different) to 1 (identical)
- Results are sorted by similarity (highest first)
