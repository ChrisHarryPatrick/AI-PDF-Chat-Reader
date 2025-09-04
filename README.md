# AI PDF Chat Reader (Local RAG, Free to Run)

A privacy-preserving PDF Q\&A app you can run entirely on your laptop.
Frontend is Next.js/React with live token streaming; backend is Express/TypeScript using LangChain, HNSWLib (persistent vector store), nomic-embed-text embeddings, and a local LLM (Mistral 7B via Ollama).
Supports multi-PDF upload, page-level citations, and a whole-document “summarize” mode.

---

## Features

* 100% local**: runs with Ollama (no API keys or cloud costs).
* RAG pipeline: PDF → pages → chunking (\~1000 chars, 200 overlap) → HNSWLib index.
* Grounded answers: page-level citations like `File p.Page`.
* Whole-doc summary:  saves a small corpus snapshot for each PDF and uses it when the question is “summarize/overview”.
* Robust streaming: EventSource (GET `/api/chat`) with automatic fallback to fetch-SSE (POST) plus heartbeats.
* Multi-PDF ingest: up to 5 files, max 50 MB each (configurable).
* Accessible UI: responsive, keyboard-friendly, clean layout.

---

## Tech Stack

* Frontend: Next.js 14, React, Tailwind (vanilla CSS optional), SSE streaming.
* Backend: Node/Express + TypeScript, LangChain.
* Vector store: `@langchain/community` HNSWLib (persists under `.vector_store/`).
* Embeddings: nomic-embed-text (Ollama).
* LLM: mistral:7b-instruct (Ollama).


---

## Prerequisites

* Node.js ≥ 18 (v20+ recommended).
* Ollama ≥ 0.11.x installed: [https://ollama.com](https://ollama.com)
* Pull models:


  ollama pull mistral:7b-instruct
  ollama pull nomic-embed-text

* Start Ollama and keep it running:


  ollama serve

---

## Getting Started

### 1) Install dependencies (npm only)


npm install --legacy-peer-deps


### 2) Configure environment

**apps/backend/.env**


OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_LLM=mistral:7b-instruct
OLLAMA_EMBED=nomic-embed-text
VS_DIR=.vector_store


**apps/frontend/.env**


NEXT_PUBLIC_BACKEND_URL=http://localhost:4000


### 3) Run the app (dev)


npm run dev


This starts:

* Backend on **[http://localhost:4000](http://localhost:4000)**
* Frontend on **[http://localhost:3000](http://localhost:3000)**

### 4) Ingest PDFs

* **From the UI**: Click **Attach** → choose one or more PDFs → you’ll see “Indexed N chunks”.
* **From the CLI** (handles spaces in paths):

  ```bash
  curl -F 'files=@"/absolute/path/Your File.pdf";type=application/pdf' \
       http://localhost:4000/api/ingest
  ```

### 5) Ask questions

* In the UI, type: **“What is this document about?”** or **“Summarize the PDF”**.
* You’ll see live tokens and **View sources** with page numbers.

---

## How It Works

1. **Ingest** (`apps/backend/src/ingest.ts`)

   * Extracts text per page (`pdfToPages`).
   * Splits into overlapping chunks.
   * **Upserts** into **HNSWLib** (`.vector_store/`).
   * Writes a *corpus snapshot* for each PDF:
     `.vector_store/corpus/<filename>.json` → used for whole-doc summaries.

2. **Answering** (`apps/backend/src/rag.ts`)

   * Detects summarize/overview intent (e.g., “summarize”, “tl;dr”).
   * **Summarize intent** → builds context from the *entire* corpus snapshot (trimmed to \~15k chars).
   * **Otherwise** → similarity search (k=6) over HNSW; de-dupes citations.
   * Strict system prompt: never invent sources; answer “I don’t know…” if context is insufficient.

3. **Streaming**

   * GET **`/api/chat?message=...`** → SSE with `sources`, `delta`, `done` events (and `ping` heartbeats).
   * Frontend auto-falls back to POST **`/api/chat`** (fetch-SSE reader) if EventSource drops.

---

## API Reference

* `GET /health` → `{ ok: true }`

* `POST /api/ingest`
  Multipart form:

  * field: `files` (one or more PDFs)
    Response: `{ ok: true, chunks: <number> }`

* `GET /api/chat?message=...`
  **SSE** stream with events:

  * `sources` → `{ sources: [{ filename, pageNumber }, ...] }`
  * `delta`   → `{ text: "<token>" }` (repeated)
  * `done`    → `{}`
  * (heartbeats) `ping` → `{}`

* `POST /api/chat`
  Body: `{ "message": "your question" }`
  Returns the same SSE event stream over the HTTP body.

---

## Project Structure

```
apps/
  backend/
    src/
      server.ts         # express app, /api/ingest, /api/chat (GET+POST SSE)
      ingest.ts         # PDF → pages → chunks → HNSW index + corpus snapshot
      rag.ts            # retrieval/summarize logic, prompt + chain
      providers.ts      # ChatOllama + OllamaEmbeddings (env-configurable)
      chunk.ts, utils.ts
    .env
    .vector_store/      # HNSW index + corpus snapshots (created at runtime)

  frontend/
    app/page.tsx        # simple chat UI, live streaming + sources
    lib/api.ts          # EventSource + fetch-SSE fallback
    styles/globals.css  # neat, accessible UI
    .env
```

---

## Change Models (optional)

Use a different model pulled in Ollama and update **apps/backend/.env**:

```
OLLAMA_LLM=llama3.1:8b-instruct   # example
OLLAMA_EMBED=nomic-embed-text
```

Restart `npm run dev`.
Check model availability:

```bash
ollama list
```

---

## Troubleshooting

* **“Ingest failed: fetch failed” (UI alert)**
  Ollama not running or wrong host. Start `ollama serve`.
  Test embeddings:

  ```bash
  curl -s http://127.0.0.1:11434/api/embeddings \
    -H "Content-Type: application/json" \
    -d '{"model":"nomic-embed-text","prompt":"hello"}'
  ```

  If error → `ollama pull nomic-embed-text`.

* **macOS crash / “Not allowed to attach to process”**
  Enable **Privacy & Security → Developer Tools** for Terminal/iTerm/VS Code, restart terminal, then `ollama serve`.

* **`model not found` in backend logs**
  Pull it: `ollama pull mistral:7b-instruct` (or whatever you configured).

* **No answers / wrong summary**
  Re-ingest after updating code:

  ```bash
  rm -rf apps/backend/.vector_store .vector_store
  npm run dev
  # re-upload PDFs
  ```

* **`.vector_store/args.json` missing**
  Index hasn’t been created yet. Ingest at least one PDF.

* **CORS / SSE drops**
  GET `/api/chat` sets `Access-Control-Allow-Origin: *` and `X-Accel-Buffering: no`.
  Frontend auto-falls back to POST stream if EventSource fails.

---

## Production Notes (quick)

* Reverse proxy should **not buffer** SSE:

  * Nginx: `proxy_buffering off;`
  * Cloudflare: enable “no buffering” / “bypass cache”.
* Serve Next.js behind the same domain as the API to avoid CORS, or keep the permissive CORS header on SSE.
* Persistent storage: mount/backup `.vector_store/`.

---

## Security & Privacy

* All processing happens locally; PDFs are not uploaded to third-party services.
* No API keys are required. Review and harden server CORS before exposing beyond localhost.

---

## Scripts

* `npm run dev` — start backend + frontend in dev.
* (optional) add your own `build`/`start` scripts per deployment style.

---




