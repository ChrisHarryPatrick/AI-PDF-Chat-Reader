import "dotenv/config";
import express from "express";
import cors from "cors";
import formidable from "formidable";
import fs from "node:fs";
import { ingestBuffer } from "./ingest.js";
import { retrieveAndAnswer } from "./rag.js";


const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/ingest", async (req, res) => {
  const form = formidable({ multiples: true, maxFileSize: 50 * 1024 * 1024 }); // bump to 50MB
  form.parse(req, async (err, _fields, files) => {
    if (err) return res.status(400).json({ error: String(err) });

    const f = files.files as any;
    const all = Array.isArray(f) ? f : f ? [f] : [];
    if (all.length === 0) return res.status(400).json({ error: "No files" });
    if (all.length > 5) return res.status(400).json({ error: "Too many files (max 5)" });

    try {
      let total = 0;
      for (const file of all) {
        // Read the buffer first, then validate by signature
        const buf = fs.readFileSync(String(file.filepath));
        const isPdf = buf.slice(0, 5).toString() === "%PDF-";
        const looksPdf =
          isPdf ||
          (file.originalFilename?.toLowerCase().endsWith(".pdf") ?? false);

        if (!looksPdf) {
          return res.status(400).json({
            error: `Not a PDF (got mimetype: ${file.mimetype || "unknown"})`,
          });
        }

        const { added } = await ingestBuffer(
          file.originalFilename || "file.pdf",
          buf
        );
        total += added;
      }
      res.json({ ok: true, chunks: total });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
});



app.post("/api/chat", async (req, res) => {
  const { message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*"); 
  res.setHeader("X-Accel-Buffering", "no");   
  // immediately flush headers so browsers treat it as a stream
  // (flushHeaders exists on Node’s http.ServerResponse; safe to optional-chain)
  // @ts-ignore
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Keep the connection alive to avoid proxies/timeouts
  const heartbeat = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 15000);

  // If client disconnects, stop work
  req.on("close", () => {
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  });

  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const VS_DIR = path.resolve(process.cwd(), process.env.VS_DIR || ".vector_store");
    const hasIndex =
      fs.existsSync(path.join(VS_DIR, "args.json")) &&
      fs.existsSync(path.join(VS_DIR, "docstore.json"));

    if (!hasIndex) {
      send("error", { error: "No index found. Please upload PDFs first (Ingest)." });
      clearInterval(heartbeat);
      return res.end();
    }

    // NOTE: retrieveAndAnswer must return { chain, sources, context }
    const { chain, sources, context } = await retrieveAndAnswer(message);

    send("sources", { sources });

    const stream = await chain.stream({ question: message, context });

    for await (const chunk of stream) {
      // chunk is a string token for ChatOllama + StringOutputParser
      send("delta", { text: chunk });
    }

    send("done", {});
    clearInterval(heartbeat);
    res.end();
  } catch (e: any) {
    send("error", { error: e?.message || String(e) });
    clearInterval(heartbeat);
    res.end();
  }
});

// --- add this in server.ts (below your POST /api/chat) ---
app.get("/api/chat", async (req, res) => {
  const message = String(req.query.message ?? "");
  if (!message) return res.status(400).json({ error: "Missing message" });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    try { res.end(); } catch {}
  });

  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const VS_DIR = path.resolve(process.cwd(), process.env.VS_DIR || ".vector_store");
    const hasIndex =
      fs.existsSync(path.join(VS_DIR, "args.json")) &&
      fs.existsSync(path.join(VS_DIR, "docstore.json"));

    if (!hasIndex) {
      send("error", { error: "No index found. Please upload PDFs first (Ingest)." });
      clearInterval(heartbeat);
      return res.end();
    }

    // retrieveAndAnswer must return { chain, sources, context }
    const { chain, sources, context } = await retrieveAndAnswer(message);

    send("sources", { sources });

    const stream = await chain.stream({ question: message, context });
    for await (const chunk of stream) send("delta", { text: chunk });

    send("done", {});
    clearInterval(heartbeat);
    res.end();
  } catch (e: any) {
    send("error", { error: e?.message || String(e) });
    clearInterval(heartbeat);
    res.end();
  }
});




const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`Backend listening on :${port}`));