"use client";

import { useEffect } from "react";
import { IconClose } from "./icons";

export default function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="lightbox"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full-size image preview"
    >
      <img src={url} alt="Check-in proof, full size" onClick={(e) => e.stopPropagation()} />
      <button className="lightbox-close" onClick={onClose} aria-label="Close preview">
        <IconClose size={22} />
      </button>
    </div>
  );
}
