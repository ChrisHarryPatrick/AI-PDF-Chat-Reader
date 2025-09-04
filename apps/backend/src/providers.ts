import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { OllamaEmbeddings } from "@langchain/community/embeddings/ollama";

const OLLAMA_BASE = process.env.OLLAMA_HOST || "http://localhost:11434";
const CHAT_MODEL  = process.env.OLLAMA_LLM   || "mistral:7b-instruct";
const EMBED_MODEL = process.env.OLLAMA_EMBED || "nomic-embed-text";

export function makeChat() {
  return new ChatOllama({
    model: CHAT_MODEL,
    temperature: 0.2,
    streaming: true,
    baseUrl: OLLAMA_BASE,
  });
}

export function makeEmbeddings() {
  return new OllamaEmbeddings({
    model: EMBED_MODEL,
    baseUrl: OLLAMA_BASE,
  });
}
