"use client";

import { useEffect, useRef } from "react";

const GRID_LINES =
  "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)";

// A dim static grid plus a second accent-colored copy of the same grid,
// revealed only in a small circle around the cursor — reads as a little
// blue torch sliding along the lines. --mx/--my are registered as
// animatable lengths in globals.css so the glow eases toward the cursor
// instead of snapping to it.
export function GridBackground({
  maskEllipse = "70% 55% at 50% 0%",
}: {
  maskEllipse?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const container = containerRef.current;
      const glow = glowRef.current;
      if (!container || !glow) return;
      const rect = container.getBoundingClientRect();
      glow.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      glow.style.setProperty("--my", `${e.clientY - rect.top}px`);
      glow.style.opacity = "0.5";
    }
    function handleLeave() {
      glowRef.current?.style.setProperty("opacity", "0");
    }
    window.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  const mask = `radial-gradient(ellipse ${maskEllipse}, black 0%, transparent 75%)`;

  return (
    <div ref={containerRef} aria-hidden className="pointer-events-none absolute inset-0">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: GRID_LINES,
          backgroundSize: "44px 44px",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
      <div ref={glowRef} className="grid-glow absolute inset-0" />
    </div>
  );
}
