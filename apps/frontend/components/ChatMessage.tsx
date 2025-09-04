export function ChatMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: role === "user" ? "flex-end" : "flex-start",
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 720,
          background: role === "user" ? "#111" : "#fff",
          color: role === "user" ? "#fff" : "inherit",
        }}
      >
        <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre>
      </div>
    </div>
  );
}
