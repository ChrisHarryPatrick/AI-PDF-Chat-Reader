import { useCallback, useRef, useState } from "react";
import { openChatStream } from "./api";


export function useEventStream() {
const [text, setText] = useState("");
const [sources, setSources] = useState<{ filename: string; pageNumber: number }[]>([]);
const cancelRef = useRef<null | (() => void)>(null);
const [loading, setLoading] = useState(false);


const ask = useCallback(async (message: string) => {
setLoading(true); setText(""); setSources([]);
const cancel = await openChatStream(message, (evt) => {
const payload = JSON.parse(evt.data);
if (payload.event === "sources") setSources(payload.data.sources || []);
if (payload.event === "delta") setText((t) => t + (payload.data.text || ""));
});
cancelRef.current = cancel as any;
setLoading(false);
}, []);


const cancel = useCallback(() => { cancelRef.current?.(); }, []);


return { text, sources, loading, ask, cancel };
}