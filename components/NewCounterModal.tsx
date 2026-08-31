"use client";

import { useEffect, useState } from "react";
import { IconClose } from "./icons";

export default function NewCounterModal({
  busy,
  onClose,
  onCreate,
  parentId,
  parentName,
}: {
  busy: boolean;
  onClose: () => void;
  onCreate: (name: string, total: number) => void;
  parentId?: string;
  parentName?: string;
}) {
  const [name, setName] = useState("");
  const [total, setTotal] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const isSub = Boolean(parentId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  function submit() {
    const t = Number(total);
    if (!name.trim()) {
      setError("Name cannot be empty");
      return;
    }
    if (!Number.isInteger(t) || t < 1 || t > 1_000_000) {
      setError("Total must be a whole number between 1 and 1,000,000");
      return;
    }
    onCreate(name.trim(), t);
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal modal-narrow" role="dialog" aria-modal="true" aria-label="New counter">
        <div className="modal-head">
          <h3>
            {isSub
              ? `New sub-counter${parentName ? ` in “${parentName}”` : ""}`
              : "New counter"}
          </h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>
            <IconClose />
          </button>
        </div>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder={isSub ? "e.g. Push-ups" : "e.g. Inhaler, Daily Water…"}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field-label">Total target count</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000000}
            step={1}
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? <span className="spinner" /> : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
