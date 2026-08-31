/** Shared progress-color logic: Blue → Orange → Red as usage approaches the limit. */

export function progressColor(pct: number): string {
  return pct < 70 ? "var(--primary)" : pct <= 90 ? "var(--warning)" : "var(--danger)";
}

export function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct));
}
