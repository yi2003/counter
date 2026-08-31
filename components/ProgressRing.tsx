"use client";

/**
 * Circular SVG progress ring.
 * Color shifts Blue → Orange → Red as usage approaches the limit:
 * <70% blue, 70–90% orange, >90% red.
 */

const R = 88;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function ProgressRing({
  used,
  total,
  bounce,
}: {
  used: number;
  total: number;
  bounce: boolean;
}) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, pct));
  const color =
    pct < 70 ? "var(--primary)" : pct <= 90 ? "var(--warning)" : "var(--danger)";

  return (
    <div className={`ring-wrap${bounce ? " bounce" : ""}`}>
      <svg
        viewBox="0 0 200 200"
        className="ring"
        role="img"
        aria-label={`Progress: ${used} of ${total}, ${Math.round(pct)}%`}
      >
        <circle cx="100" cy="100" r={R} className="ring-track" />
        <circle
          cx="100"
          cy="100"
          r={R}
          className="ring-value"
          style={{
            stroke: color,
            strokeDasharray: CIRCUMFERENCE,
            strokeDashoffset: CIRCUMFERENCE * (1 - clamped / 100),
          }}
        />
      </svg>
      <div className="ring-center">
        <div className="ring-count">
          {used}
          <span className="ring-total">/ {total}</span>
        </div>
        <div className="ring-pct" style={{ color }}>
          {Math.round(pct)}%
        </div>
      </div>
    </div>
  );
}
