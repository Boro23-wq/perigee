type Confidence = "low" | "medium" | "high" | null;

const LEVEL: Record<Exclude<Confidence, null>, number> = { low: 1, medium: 2, high: 3 };
const COLOR: Record<Exclude<Confidence, null>, string> = {
  low: "bg-danger",
  medium: "bg-muted-2",
  high: "bg-accent",
};

export function ConfidenceMeter({ confidence }: { confidence: Confidence }) {
  const level = confidence ? LEVEL[confidence] : 0;
  const color = confidence ? COLOR[confidence] : "bg-border";

  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${confidence ?? "unknown"} confidence`}
      title={`${confidence ?? "unknown"} confidence`}
    >
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={`h-2.5 w-1.5 rounded-sm ${bar <= level ? color : "bg-border"}`}
        />
      ))}
    </span>
  );
}
