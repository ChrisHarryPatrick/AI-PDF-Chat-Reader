export const BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

/* ------------ fallback: fetch-based reader (POST /api/chat) ------------ */
async function openChatStreamFetch(
  message: string,
  onEvent: (p: { event: string; data: any }) => void
): Promise<() => void> {
  const ctrl = new AbortController();
  const resp = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message }),
    signal: ctrl.signal,
    keepalive: true,
  });
  if (!resp.ok || !resp.body) {
    onEvent({ event: "error", data: { error: `Chat failed: ${resp.status}` } });
    return () => ctrl.abort();
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const lines = chunk.split(/\r?\n/);
          let event = "message";
          let dataRaw = "";
          for (const ln of lines) {
            if (ln.startsWith("event:")) event = ln.slice(6).trim();
            if (ln.startsWith("data:")) dataRaw += ln.slice(5).trim();
          }
          if (!dataRaw) continue;
          try { onEvent({ event, data: JSON.parse(dataRaw) }); }
          catch { onEvent({ event, data: dataRaw }); }
        }
      }
      onEvent({ event: "done", data: {} });
    } catch {
      onEvent({ event: "error", data: { error: "Fetch failed" } });
    }
  })();
  return () => ctrl.abort();
}

/* ------------ primary: EventSource with auto-fallback ------------ */
export function openChatStream(
  message: string,
  onEvent: (p: { event: string; data: any }) => void
): () => void {
  let canceled = false;
  let cancelFetch: null | (() => void) = null;

  const url = `${BASE}/api/chat?message=${encodeURIComponent(message)}`;
  const es = new EventSource(url);

  const parse = (e: MessageEvent) => {
    try { onEvent({ event: (e as any).type || "message", data: JSON.parse(e.data) }); }
    catch { onEvent({ event: (e as any).type || "message", data: e.data }); }
  };

  es.addEventListener("sources", parse);
  es.addEventListener("delta",   parse);
  es.addEventListener("ping",    () => {});                // ignore heartbeats
  es.addEventListener("done",    () => { if (!canceled) onEvent({ event:"done", data:{} }); es.close(); });

  es.onerror = async () => {
    // On *any* ES error, fall back to fetch stream
    es.close();
    if (!canceled && !cancelFetch) {
      try {
        cancelFetch = await openChatStreamFetch(message, onEvent);
      } catch {
        onEvent({ event: "error", data: { error: "Stream error" } });
      }
    }
  };

  return () => {
    canceled = true;
    es.close();
    if (cancelFetch) cancelFetch();
  };
}

/* ------------ upload PDFs ------------ */
export async function uploadPdfs(files: File[]) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch(`${BASE}/api/ingest`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
