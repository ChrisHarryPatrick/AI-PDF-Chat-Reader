"use client";
import { useRef, useState } from "react";
import { openChatStream, uploadPdfs } from "@/lib/api";

type SourceRef = { filename: string; pageNumber: number };
type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
};

export default function Page() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const sel = Array.from(e.target.files || []);
    if (!sel.length) return;
    if (sel.some((f) => f.type !== "application/pdf"))
      return alert("PDFs only");
    if (sel.length + files.length > 5) return alert("Max 5 files");
    setFiles((f) => [...f, ...sel]);
    try {
      const r = await uploadPdfs(sel);
      alert(`Indexed ${r.chunks ?? r.added ?? "?"} chunks`);
    } catch (e: any) {
      alert(`Ingest failed: ${e.message || e}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;

    const userIndex = messages.length;
    const assistantIndex = userIndex + 1;
    setMessages((m) => [
      ...m,
      { role: "user", content: q },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setBusy(true);

    const cancel = openChatStream(q, ({ event, data }) => {
      if (event === "sources") {
        setMessages((m) =>
          m.map((msg, i) =>
            i === assistantIndex ? { ...msg, sources: data.sources || [] } : msg
          )
        );
      } else if (event === "delta") {
        setMessages((m) =>
          m.map((msg, i) =>
            i === assistantIndex
              ? { ...msg, content: msg.content + (data.text || "") }
              : msg
          )
        );
      } else if (event === "error") {
        setMessages((m) =>
          m.map((msg, i) =>
            i === assistantIndex ? { ...msg, content: `⚠️ ${data.error}` } : msg
          )
        );
        setBusy(false);
      } else if (event === "done") {
        setBusy(false);
      }
    });

    // If you want a manual cancel on route change, call: cancel();
  }

  return (
    <main className="container">
      <header className="header">
        <h1>AI PDF Reader</h1>
        <p>Upload PDFs → Ask → Get cited answers</p>
      </header>

      <section className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p className="muted">
              Upload a PDF and try: <kbd>What is this document about?</kbd>
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <article
            key={i}
            className={m.role === "user" ? "bubble user" : "bubble bot"}
          >
            <div className="content">
              {m.content || (m.role === "assistant" ? "Thinking…" : "")}
            </div>
            {m.role === "assistant" && m.sources && m.sources.length > 0 && (
              <details className="sources">
                <summary>View sources ({m.sources.length})</summary>
                <ul>
                  {m.sources.map((s, idx) => (
                    <li key={idx}>
                      {s.filename} — Page {s.pageNumber}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </section>

      <footer className="composer">
        {files.length > 0 && (
          <div className="files">
            {files.map((f, i) => (
              <div className="file" key={i}>
                <div className="dot" />{" "}
                <span className="fname" title={f.name}>
                  {f.name}
                </span>
                <button
                  className="link"
                  onClick={() => setFiles((ff) => ff.filter((x) => x !== f))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="row">
          <input
            type="file"
            ref={fileRef}
            onChange={handleUpload}
            accept=".pdf"
            multiple
            hidden
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="btn"
          >
            Attach
          </button>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Thinking…" : "Ask about your PDFs"}
          />
          <button
            className="btn primary"
            type="submit"
            disabled={!input.trim() || busy}
          >
            Send
          </button>
        </form>
      </footer>
    </main>
  );
}
