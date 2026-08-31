"use client";

import type { CheckinRecord } from "@/lib/types";

function timeLabel(ts: string): string {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function HistoryList({
  history,
  onPreview,
}: {
  history: CheckinRecord[];
  onPreview: (url: string) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="history-empty">
        <p>No check-ins yet.</p>
        <p className="muted">Tap “+ Check-in” to record your first one.</p>
      </div>
    );
  }

  return (
    <ul className="history-list">
      {history.map((r, i) => {
        const date = new Date(r.timestamp);
        return (
          <li key={r.id} className={`history-item c${i % 3}`}>
            <div className="history-main">
              <div className="history-top">
                <time dateTime={r.timestamp} title={date.toLocaleString()}>
                  {timeLabel(r.timestamp)}
                </time>
                <span className="history-index">#{history.length - i}</span>
              </div>
              <p className={`history-note${r.note ? "" : " muted"}`}>
                {r.note || "No note"}
              </p>
              <span className="history-fulltime">{date.toLocaleString()}</span>
            </div>
            {r.image && (
              <button
                className="thumb-btn"
                onClick={() => r.image && onPreview(r.image)}
                aria-label="View full-size image"
              >
                {/* List uses the tiny thumbnail; the lightbox loads the view image. */}
                <img src={r.thumb || r.image} alt="Check-in proof" loading="lazy" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
