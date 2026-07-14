import type { CSSProperties } from "react";

export function PerigeeMark({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 120"
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        fill="none"
        stroke="#2f8fff"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M28 102 L28 32 C28 18 40 9 56 11" />
        <path d="M28 55 C28 68 38 76 50 78 C62 80 68 74 68 64 L68 38" />
      </g>
      <circle cx="70" cy="15" r="8" fill="#2f8fff" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold tracking-tight ${className}`}>
      <PerigeeMark className="h-5 w-auto shrink-0" style={{ aspectRatio: "100 / 120" }} />
      Perigee
    </span>
  );
}
