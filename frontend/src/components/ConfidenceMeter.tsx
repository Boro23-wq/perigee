type Confidence = "low" | "medium" | "high" | null;

const LEVEL: Record<Exclude<Confidence, null>, number> = { low: 1, medium: 2, high: 3 };

// Deliberately not red/alarming — "low" here means "a photo can't reveal
// exact portion size or hidden oils/butter," not "this estimate is wrong."
// A graduated neutral-to-accent scale reads as "rougher estimate" rather
// than "error," which is what this value actually represents.
const COLOR: Record<Exclude<Confidence, null>, string> = {
  low: "bg-muted-2",
  medium: "bg-accent-soft",
  high: "bg-accent",
};

const LABEL: Record<Exclude<Confidence, null>, string> = {
  low: "Rough estimate — check portion size",
  medium: "Estimate — check portion size",
  high: "Confident estimate",
};

export function ConfidenceMeter({
  confidence,
  showLabel = false,
}: {
  confidence: Confidence;
  showLabel?: boolean;
}) {
  const level = confidence ? LEVEL[confidence] : 0;
  const color = confidence ? COLOR[confidence] : "bg-border";
  const label = confidence ? LABEL[confidence] : "Unknown estimate";

  return (
    <span className="inline-flex items-center gap-1.5" aria-label={label} title={label}>
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`h-2.5 w-1.5 rounded-sm ${bar <= level ? color : "bg-border"}`}
          />
        ))}
      </span>
      {showLabel && <span className="text-[11px] text-muted">{label}</span>}
    </span>
  );
}
