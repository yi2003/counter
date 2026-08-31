"use client";

import { useEffect, useRef, useState } from "react";
import { errMsg, uploadFile } from "@/lib/client";
import { compressImage } from "@/lib/image";
import type { CounterMeta } from "@/lib/types";
import { IconClose, IconImage, IconTrash } from "./icons";

export default function SettingsModal({
  project,
  saving,
  deleting,
  onClose,
  onSave,
  onDelete,
}: {
  project: CounterMeta;
  saving: boolean;
  deleting: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; total: number; coverImage: string | null }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [total, setTotal] = useState(String(project.total));
  // `cover` holds the value we SAVE (raw blob url / idb: ref);
  // `coverPreview` is always a renderable URL for the <img>.
  const [cover, setCover] = useState<string | null>(project.coverImage ?? null);
  const [coverPreview, setCoverPreview] = useState<string | null>(project.coverImage ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const locked = saving || uploading || deleting;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !locked) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, locked]);

  async function pickCover(raw: File | null) {
    if (!raw) return;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(raw);
      const { url } = await uploadFile(compressed);
      setCover(url); // store the storage reference, not a display URL
      setCoverPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return URL.createObjectURL(compressed);
      });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const t = Number(total);
    if (!name.trim()) {
      setError("Project name cannot be empty");
      return;
    }
    if (!Number.isInteger(t) || t < 1 || t > 1_000_000) {
      setError("Total must be a whole number between 1 and 1,000,000");
      return;
    }
    onSave({ name: name.trim(), total: t, coverImage: cover });
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Counter settings">
        <div className="modal-head">
          <h3>Counter Settings</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={locked}>
            <IconClose />
          </button>
        </div>

        <label className="field">
          <span className="field-label">Counter name</span>
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="My Counter"
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
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
            disabled={locked}
          />
        </label>

        <div className="field">
          <span className="field-label">Cover image (optional)</span>
          {cover ? (
            <div className="cover-edit">
              <img src={coverPreview ?? cover} alt="Cover preview" />
              <button
                className="btn btn-ghost danger-text btn-sm"
                onClick={() => {
                  if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
                  setCover(null);
                  setCoverPreview(null);
                }}
                disabled={locked}
              >
                <IconTrash /> Remove cover
              </button>
            </div>
          ) : (
            <button
              className="btn btn-ghost"
              onClick={() => fileRef.current?.click()}
              disabled={locked}
            >
              {uploading ? <span className="spinner spinner-dark" /> : <IconImage />} Upload cover
              image
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void pickCover(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="danger-zone">
          <span className="field-label">Danger zone</span>
          <button
            className="btn btn-ghost danger-text btn-sm"
            onClick={onDelete}
            disabled={locked}
            title="Delete this counter and all its data"
          >
            {deleting ? <span className="spinner spinner-dark" /> : <IconTrash />} Delete this
            counter
          </button>
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={locked}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={locked}>
            {saving ? <span className="spinner" /> : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
