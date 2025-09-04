export function ExamplePrompts({ onPick }: { onPick: (s: string) => void }) {
  const items = ["What is this document about?", "Summarize the key points."];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        maxWidth: 560,
      }}
    >
      {items.map((t, i) => (
        <div
          key={i}
          className="card"
          onClick={() => onPick(t)}
          style={{ cursor: "pointer", textAlign: "center" }}
        >
          {t}
        </div>
      ))}
    </div>
  );
}
