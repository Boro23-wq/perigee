import type { CSSProperties } from "react";

export function PerigeeMark({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/mark.png"
      alt=""
      aria-hidden
      className={className}
      style={{ aspectRatio: "8 / 7", objectFit: "contain", ...style }}
    />
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold tracking-tight ${className}`}>
      <PerigeeMark className="h-5 w-auto shrink-0" />
      Perigee
    </span>
  );
}
