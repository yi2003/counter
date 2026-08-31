"use client";

import Link from "next/link";
import { clampPct, progressColor } from "@/lib/progress";
import type { CounterSummary } from "@/lib/types";

/** Home-screen card for a top-level counter. */
export default function CounterCard({ counter }: { counter: CounterSummary }) {
  const pct = counter.total > 0 ? (counter.used / counter.total) * 100 : 0;
  const done = counter.used >= counter.total;

  return (
    <Link href={`/c/${counter.id}`} className="counter-card">
      <MiniRing used={counter.used} total={counter.total} />
      <span className="counter-name">{counter.name}</span>
      <span className="counter-nums">
        {counter.used} / {counter.total}
      </span>
      {done && <span className="counter-done">🎉 Target reached</span>}
    </Link>
  );
}

export function MiniRing({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const clamped = clampPct(pct);
  const R = 30;
  const CIRC = 2 * Math.PI * R;
  const color = progressColor(pct);

  return (
    <svg
      viewBox="0 0 72 72"
      className="mini-ring"
      role="img"
      aria-label={`Progress: ${used} of ${total}, ${Math.round(pct)}%`}
    >
      <circle cx="36" cy="36" r={R} className="mini-ring-track" />
      <circle
        cx="36"
        cy="36"
        r={R}
        className="mini-ring-value"
        style={{
          stroke: color,
          strokeDasharray: CIRC,
          strokeDashoffset: CIRC * (1 - clamped / 100),
        }}
      />
      <text x="36" y="41" textAnchor="middle" className="mini-ring-text" style={{ fill: color }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}
