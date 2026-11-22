"use client";

import { useEffect, useRef, useState } from "react";
import { prepareCheckinImages, type PreparedImages } from "@/lib/image";
import { errMsg } from "@/lib/client";
import type { CheckinRecord } from "@/lib/types";
import { IconCamera, IconClose, IconImage, IconTrash } from "./icons";

export default function EditHistoryModal({
  record,
  index,
  total,
  onClose,
  onSave,
  onDelete,
  busy,
}: {
  record: CheckinRecord;
  index: number;
  total: number;
  onClose: () => void;
  onSave: (recordId: string, note: string, timestamp: string, images: PreparedImages | null) => void;
  onDelete: (recordId: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState(record.note || "");
  const [timestamp, setTimestamp] = useState(() => {
    const d = new Date(record.timestamp);
    // Format for datetime-local input: YYYY-MM-DDTHH:MM
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });
  const [images, setImages] = useState<PreparedImages | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(record.image || null);
  const [imageChanged, setImageChanged] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !processing && !showDeleteConfirm) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy, processing, showDeleteConfirm]);

  async function pick(raw: File | null) {
    if (!raw) return;
    setProcessing(true);
    setError(null);
    try {
      const prepared = await prepareCheckinImages(raw);
      setImages(prepared);
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(prepared.view));
      setImageChanged(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setProcessing(false);
    }
  }

  function removeImage() {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setImages(null);
    setPreviewUrl(null);
    setImageChanged(true);
  }

  function submit() {
    if (busy || processing) return;
    // Convert datetime-local back to ISO string
    const isoTimestamp = new Date(timestamp).toISOString();
    onSave(record.id, note, isoTimestamp, imageChanged ? images : null);
  }

  if (showDeleteConfirm) {
    return (
      <div
        className="overlay"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) setShowDeleteConfirm(false);
        }}
      >
        <div className="modal modal-narrow" role="dialog" aria-modal="true">
          <div className="modal-head">
            <h3>Delete check-in?</h3>
            <button
              className="icon-btn"
              onClick={() => setShowDeleteConfirm(false)}
              aria-label="Close"
              disabled={busy}
            >
              <IconClose />
            </button>
          </div>
          <p>
            This permanently deletes check-in #{total - index}
            {record.note ? ` ("${record.note}")` : ""} and decreases the counter by 1. This cannot
            be undone.
          </p>
          <div className="modal-foot">
            <button
              className="btn btn-ghost"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="btn btn-ghost danger-text"
              onClick={() => onDelete(record.id)}
              disabled={busy}
            >
              {busy ? <span className="spinner spinner-dark" /> : "Delete check-in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !processing) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Edit check-in">
        <div className="modal-head">
          <h3>Edit Check-in #{total - index}</h3>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={busy || processing}
          >
            <IconClose />
          </button>
        </div>

        <label className="field">
          <span className="field-label">Note</span>
          <textarea
            className="note-input"
            placeholder="Add a note (optional)"
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy || processing}
          />
        </label>

        <label className="field">
          <span className="field-label">Date and time</span>
          <input
            type="datetime-local"
            className="datetime-input"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            disabled={busy || processing}
          />
        </label>

        <div className="field">
          <span className="field-label">Photo proof (optional)</span>
          {previewUrl ? (
            <div className="attach-preview">
              <img src={previewUrl} alt="Check-in proof" />
              <button
                className="remove-btn"
                onClick={removeImage}
                aria-label="Remove image"
                disabled={busy || processing}
              >
                <IconClose size={14} />
              </button>
            </div>
          ) : (
            <div className="attach-row">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => cameraRef.current?.click()}
                disabled={busy || processing}
              >
                <IconCamera /> Take photo
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => galleryRef.current?.click()}
                disabled={busy || processing}
              >
                <IconImage /> Choose image
              </button>
            </div>
          )}
        </div>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {error && <p className="form-error">{error}</p>}

        <div className="danger-zone" style={{ marginTop: "16px" }}>
          <span className="field-label">Delete this check-in</span>
          <button
            className="btn btn-ghost danger-text btn-sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={busy || processing}
          >
            <IconTrash /> Delete check-in
          </button>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy || processing}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || processing}>
            {busy || processing ? <span className="spinner" /> : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
