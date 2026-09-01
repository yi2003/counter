"use client";

import { useRouter } from "next/navigation";
import { clampPct, progressColor } from "@/lib/progress";
import type { CounterSummary } from "@/lib/types";
import { CopyIcon } from "@/components/CounterCard";

/**
 * Sub-counter card inside a counter's detail page:
 * tap the card to open it, "+1" for a quick check-in, "⧉" to duplicate it.
 */
export default function SubCounterCard({
  sub,
  busy,
  dupBusy,
  onQuickAdd,
  onDuplicate,
}: {
  sub: CounterSummary;
  busy: boolean;
  dupBusy?: boolean;
  onQuickAdd: () => void;
  onDuplicate?: () => void;
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
      <div className="sub-actions">
        <button
          className="btn btn-sm btn-primary sub-add"
          onClick={onQuickAdd}
          disabled={busy || done}
          aria-label={`Quick check-in for ${sub.name}`}
          title={done ? "Target reached" : "Quick check-in (+1)"}
        >
          {busy ? <span className="spinner" /> : "+1"}
        </button>
        {onDuplicate && (
          <button
            className="sub-copy"
            onClick={onDuplicate}
            disabled={dupBusy}
            aria-label={`Duplicate ${sub.name}`}
            title="Duplicate this sub-counter (zeroed, same target)"
          >
            {dupBusy ? <span className="spinner" /> : <CopyIcon size={15} />}
          </button>
        )}
      </div>
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
