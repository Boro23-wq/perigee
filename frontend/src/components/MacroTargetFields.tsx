const FIELDS = [
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
] as const;

export type MacroTargetValues = {
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
};

export function MacroTargetFields({
  values,
  onChange,
}: {
  values: MacroTargetValues;
  onChange: (key: keyof MacroTargetValues, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-2">
        Set daily gram targets for whichever macros you want to track — leave any
        blank to skip it. They&apos;ll show as progress bars on your dashboard.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-1.5">
            <label
              htmlFor={`macro-${key}`}
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              {label}
            </label>
            <input
              id={`macro-${key}`}
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              value={values[key]}
              onChange={(e) => onChange(key, e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] outline-none transition-shadow focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
