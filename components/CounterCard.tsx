"use client";

import Link from "next/link";
import { clampPct, progressColor } from "@/lib/progress";
import type { CounterSummary } from "@/lib/types";

/** Home-screen card for a top-level counter. */
export default function CounterCard({
  counter,
  onDuplicate,
}: {
  counter: CounterSummary;
  onDuplicate?: (id: string) => void;
}) {
  const pct = counter.total > 0 ? (counter.used / counter.total) * 100 : 0;
  const done = counter.used >= counter.total;

  return (
    <div className="counter-card-wrap">
      <Link href={`/c/${counter.id}`} className="counter-card">
        <MiniRing used={counter.used} total={counter.total} />
        <span className="counter-name">{counter.name}</span>
        <span className="counter-nums">
          {counter.used} / {counter.total}
        </span>
        {done && <span className="counter-done">🎉 Target reached</span>}
      </Link>
      {onDuplicate && (
        <button
          className="card-copy"
          onClick={() => onDuplicate(counter.id)}
          aria-label={`Duplicate ${counter.name}`}
          title="Duplicate (with all sub-counters, zeroed)"
        >
          <CopyIcon />
        </button>
      )}
    </div>
  );
}

export function CopyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4.5A2.5 2.5 0 0 1 2 12.5v-8A2.5 2.5 0 0 1 4.5 2h8A2.5 2.5 0 0 1 15 4.5V5" />
    </svg>
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
