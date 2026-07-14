export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full bg-accent"
      />
      Trellis
    </span>
  );
}
