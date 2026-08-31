"use client";

import { useEffect, useRef, useState } from "react";
import { prepareCheckinImages, type PreparedImages } from "@/lib/image";
import { errMsg } from "@/lib/client";
import { IconCamera, IconClose, IconImage } from "./icons";

export default function CheckinModal({
  onClose,
  onSubmit,
  busy,
}: {
  onClose: () => void;
  onSubmit: (note: string, images: PreparedImages | null) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [images, setImages] = useState<PreparedImages | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Revoke old object URLs whenever the preview changes or the modal unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && !processing) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy, processing]);

  async function pick(raw: File | null) {
    if (!raw) return;
    setProcessing(true);
    setError(null);
    try {
      // Prepares TWO compressed JPEGs: view (≤800px) + thumbnail (≤240px).
      const prepared = await prepareCheckinImages(raw);
      setImages(prepared);
      setPreviewUrl(URL.createObjectURL(prepared.view));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setProcessing(false);
    }
  }

  function removeImage() {
    setImages(null);
    setPreviewUrl(null);
  }

  function submit() {
    if (busy || processing) return;
    onSubmit(note, images);
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !processing) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="New check-in">
        <div className="modal-head">
          <h3>New Check-in</h3>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={busy || processing}
          >
            <IconClose />
          </button>
        </div>

        <textarea
          className="note-input"
          placeholder="Add a note (optional) — e.g. “Took after breakfast”"
          value={note}
          maxLength={500}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy || processing}
        />

        {previewUrl ? (
          <div className="attach-preview">
            <img src={previewUrl} alt="Selected attachment preview" />
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
              className="btn btn-ghost"
              onClick={() => cameraRef.current?.click()}
              disabled={busy || processing}
            >
              <IconCamera /> Take photo
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => galleryRef.current?.click()}
              disabled={busy || processing}
            >
              <IconImage /> Choose image
            </button>
          </div>
        )}

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

        <div className="modal-foot">
          <span className="char-count">{note.length}/500</span>
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={busy || processing}
          >
            {busy || processing ? <span className="spinner" /> : "Save check-in"}
          </button>
        </div>
      </div>
    </div>
  );
}
