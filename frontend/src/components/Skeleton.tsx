import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} style={style} />;
}
