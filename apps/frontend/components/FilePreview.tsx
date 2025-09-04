export function FilePreview({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  return (
    <div
      className="card"
      style={{ display: "flex", gap: 8, alignItems: "center" }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "#e91e63",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {file.name}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>PDF</div>
      </div>
      <button onClick={onRemove}>Remove</button>
    </div>
  );
}
