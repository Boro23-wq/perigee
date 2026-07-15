const KNOWN_TYPES = ["breakfast", "lunch", "dinner", "snack", "drink"];

export function MealTypeBadge({ type }: { type: string }) {
  const key = KNOWN_TYPES.includes(type) ? type : "snack";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{
        backgroundColor: `var(--badge-${key}-bg)`,
        color: `var(--badge-${key}-fg)`,
      }}
    >
      {type}
    </span>
  );
}
