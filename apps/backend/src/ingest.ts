import fs from "node:fs";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { makeEmbeddings } from "./providers.js";
import { env } from "./utils.js";
import { pdfToPages } from "./chunk.js";

type IngestResult = { added: number; mode: "create" | "append" };

function resolveVSDir() {
  // absolute path so CWD doesn’t matter
  return path.resolve(process.cwd(), env("VS_DIR", ".vector_store"));
}

function hasIndexFiles(vsDir: string) {
  return (
    fs.existsSync(path.join(vsDir, "args.json")) &&
    fs.existsSync(path.join(vsDir, "docstore.json"))
  );
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]+/gi, "_");
}

/**
 * Ingest a single PDF buffer:
 *  - extracts text per page
 *  - splits to chunks
 *  - upserts into HNSWLib vector store
 *  - writes a compact corpus snapshot for whole-doc tasks (summarize/outline)
 */
export async function ingestBuffer(filename: string, buf: Buffer): Promise<IngestResult> {
  const VS_DIR = resolveVSDir();
  fs.mkdirSync(VS_DIR, { recursive: true });

  // 1) PDF → pages
  const pages = await pdfToPages(buf); // [{ pageNumber, text }]

  // 2) Save corpus snapshot (for summarize/overview)
  const corpusDir = path.join(VS_DIR, "corpus");
  fs.mkdirSync(corpusDir, { recursive: true });
  fs.writeFileSync(
    path.join(corpusDir, `${safeName(filename)}.json`),
    JSON.stringify(pages),
    "utf8"
  );

  // 3) Pages → chunks → Documents
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const docs: Document[] = [];
  for (const p of pages) {
    const pieces = await splitter.splitText(p.text || "");
    for (const t of pieces) {
      docs.push(
        new Document({
          pageContent: t,
          metadata: { filename, pageNumber: p.pageNumber },
        })
      );
    }
  }

  // 4) Upsert into HNSW store
  const embeddings = makeEmbeddings();

  if (hasIndexFiles(VS_DIR)) {
    const store = await HNSWLib.load(VS_DIR, embeddings);
    await store.addDocuments(docs);
    await store.save(VS_DIR);
    return { added: docs.length, mode: "append" };
  } else {
    const store = await HNSWLib.fromDocuments(docs, embeddings);
    await store.save(VS_DIR);
    return { added: docs.length, mode: "create" };
  }
}
