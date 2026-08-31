"use client";

import { useRouter } from "next/navigation";
import { clampPct, progressColor } from "@/lib/progress";
import type { CounterSummary } from "@/lib/types";

/**
 * Sub-counter card inside a counter's detail page:
 * tap the card to open it, or use "+1" for a quick check-in without a note.
 */
export default function SubCounterCard({
  sub,
  busy,
  onQuickAdd,
}: {
  sub: CounterSummary;
  busy: boolean;
  onQuickAdd: () => void;
}) {
  const router = useRouter();
  const pct = sub.total > 0 ? (sub.used / sub.total) * 100 : 0;
  const done = sub.used >= sub.total;

  return (
    <div className="counter-card sub-card">
      <button className="sub-main" onClick={() => router.push(`/c/${sub.id}`)}>
        <MiniBar pct={pct} />
        <span className="counter-name">{sub.name}</span>
        <span className="counter-nums">
          {sub.used} / {sub.total}
          {done ? " 🎉" : ""}
        </span>
      </button>
      <button
        className="btn btn-sm btn-primary sub-add"
        onClick={onQuickAdd}
        disabled={busy || done}
        aria-label={`Quick check-in for ${sub.name}`}
        title={done ? "Target reached" : "Quick check-in (+1)"}
      >
        {busy ? <span className="spinner" /> : "+1"}
      </button>
    </div>
  );
}

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="mini-bar" aria-hidden>
      <div
        className="mini-bar-fill"
        style={{ width: `${clampPct(pct)}%`, background: progressColor(pct) }}
      />
    </div>
  );
}
