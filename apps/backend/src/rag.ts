import fs from "node:fs";
import path from "node:path";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";
import { HNSWLib } from "@langchain/community/vectorstores/hnswlib";
import { makeChat, makeEmbeddings } from "./providers.js";

const SYSTEM = `You are a helpful assistant.
Use ONLY the provided context. If the context is empty or insufficient, reply exactly:
"I don't know based on the provided files."
Always include citations like (File p.Page). Never invent a citation.`;

// crude intent check for whole-doc tasks
const isSummarizeIntent = (q: string) =>
  /\b(summariz(e|e this|e the|e the pdf)|what is this document about|overview|abstract|tl;dr)\b/i.test(
    q
  );

type SourceRef = { filename: string; pageNumber: number };

function uniqueSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const k = `${s.filename}#${s.pageNumber}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function resolveVSDir() {
  return path.resolve(process.cwd(), process.env.VS_DIR || ".vector_store");
}

/**
 * Builds an answering chain and returns:
 *  - chain: Runnable that accepts { question, context } and streams a string
 *  - sources: list of { filename, pageNumber } used to form the context
 *  - context: the actual string passed to the model
 */
export async function retrieveAndAnswer(question: string): Promise<{
  chain: RunnableSequence<{ question: string; context: string }, string>;
  sources: SourceRef[];
  context: string;
}> {
  const VS_DIR = resolveVSDir();

  // Prompt → model → string
  const model = makeChat();
  const chain = RunnableSequence.from([
    (io: { question: string; context: string }) => ({
      input: `${SYSTEM}

Question: ${io.question}

Context:
${io.context}

Answer with citations.`,
    }),
    model,
    new StringOutputParser(),
  ]);

  // Load vector store
  const store = await HNSWLib.load(VS_DIR, makeEmbeddings());

  // If it's a “summarize/overview” style request → build context from corpus snapshot
  if (isSummarizeIntent(question)) {
    const { context, sources } = loadCorpusContext(VS_DIR, 15000);
    return { chain, context, sources };
  }

  // Standard similarity retrieval
  const results = await store.similaritySearchWithScore(question, 6);
  if (!results.length) {
    // fallback to corpus if retrieval is empty
    const { context, sources } = loadCorpusContext(VS_DIR, 15000);
    return { chain, context, sources };
  }

  const context = results.map(([doc]) => String(doc.pageContent)).join("\n\n");
  const sources = uniqueSources(
    results.map(([doc]) => ({
      filename: (doc.metadata?.filename as string) || "File",
      pageNumber: Number(doc.metadata?.pageNumber ?? 1),
    }))
  );

  return { chain, context, sources };
}

/** Load a trimmed whole-document context from saved corpus snapshots */
function loadCorpusContext(
  vsDir: string,
  maxChars = 15000
): { context: string; sources: SourceRef[] } {
  const corpusDir = path.join(vsDir, "corpus");
  const sources: SourceRef[] = [];
  let context = "";

  if (!fs.existsSync(corpusDir)) return { context, sources };

  const files = fs.readdirSync(corpusDir).filter((f) => f.toLowerCase().endsWith(".json"));

  outer: for (const f of files) {
    const filename = f.replace(/\.json$/i, "");
    const arr: Array<{ pageNumber: number; text: string }> = JSON.parse(
      fs.readFileSync(path.join(corpusDir, f), "utf8")
    );
    for (const p of arr) {
      const prefix = `\n\n[${filename} p.${p.pageNumber}] `;
      context += prefix + (p.text || "");
      sources.push({ filename, pageNumber: p.pageNumber });
      if (context.length >= maxChars) break outer;
    }
  }

  return { context, sources: uniqueSources(sources) };
}
