"use client";

import { useMemo, useRef, useState } from "react";

export type WeightEntry = {
  date: string;
  weight_lbs: number;
  note: string | null;
  rolling_avg: number;
};

const WIDTH = 600;
const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { linePath, points, yScale, yTicks } = useMemo(() => {
    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;

    if (entries.length === 0) {
      return { linePath: "", points: [], yScale: () => 0, yTicks: [] };
    }

    const weights = entries.flatMap((e) => [e.weight_lbs, e.rolling_avg]);
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    const pad = Math.max((max - min) * 0.15, 2);
    const yMin = min - pad;
    const yMax = max + pad;

    const x = (i: number) =>
      entries.length === 1
        ? PADDING.left + innerW / 2
        : PADDING.left + (i / (entries.length - 1)) * innerW;
    const y = (v: number) =>
      PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

    const pts = entries.map((e, i) => ({
      x: x(i),
      yRolling: y(e.rolling_avg),
      yRaw: y(e.weight_lbs),
      entry: e,
    }));

    const path = pts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.yRolling}`)
      .join(" ");

    return {
      linePath: path,
      points: pts,
      yScale: y,
      yTicks: niceTicks(yMin, yMax),
    };
  }, [entries]);

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - px);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted">
        Log a few weigh-ins to see your trend.
      </div>
    );
  }

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 8}
              y={yScale(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {t}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.yRaw}
            r={3}
            fill="var(--muted)"
            opacity={0.4}
          />
        ))}

        <path
          d={linePath}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].yRolling}
            r={5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}

        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={hovered.x}
              cy={hovered.yRolling}
              r={5}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </>
        )}

        {points.map((p, i) => {
          if (entries.length <= 6 || i % Math.ceil(entries.length / 6) === 0) {
            return (
              <text
                key={i}
                x={p.x}
                y={HEIGHT - PADDING.bottom + 16}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted)"
              >
                {formatDate(p.entry.date)}
              </text>
            );
          }
          return null;
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
          }}
        >
          <p className="font-medium text-foreground">
            {hovered.entry.rolling_avg.toFixed(1)} lbs
          </p>
          <p className="text-muted">
            {formatDate(hovered.entry.date)} · raw {hovered.entry.weight_lbs}
          </p>
        </div>
      )}
    </div>
  );
}
