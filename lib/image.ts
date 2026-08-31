"use client";

/**
 * Client-side image compression (canvas re-encode to JPEG — zip won't help JPEGs).
 * Per check-in we prepare TWO files:
 *  - view:  longest side ≤ 800px, quality 60%  → full-size preview (per requirements)
 *  - thumb: longest side ≤ 240px, quality 50%  → history list thumbnails (tiny download)
 * The cover image keeps using compressImage() (800px / 60%).
 */

const VIEW_MAX = 800;
const VIEW_QUALITY = 0.6;
const THUMB_MAX = 240;
const THUMB_QUALITY = 0.5;

export interface PreparedImages {
  view: File;
  thumb: File;
}

export async function prepareCheckinImages(file: File): Promise<PreparedImages> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  const img = await loadImage(await readAsDataURL(file));
  const base = baseName(file.name) || "photo";
  const [view, thumb] = await Promise.all([
    renderToJpeg(img, VIEW_MAX, VIEW_QUALITY, `${base}.jpg`),
    renderToJpeg(img, THUMB_MAX, THUMB_QUALITY, `${base}.thumb.jpg`),
  ]);
  return { view, thumb };
}

export async function compressImage(
  file: File,
  maxWidth = VIEW_MAX,
  quality = VIEW_QUALITY,
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file");
  }
  const img = await loadImage(await readAsDataURL(file));
  return renderToJpeg(img, maxWidth, quality, `${baseName(file.name) || "photo"}.jpg`);
}

async function renderToJpeg(
  img: HTMLImageElement,
  maxSide: number,
  quality: number,
  name: string,
): Promise<File> {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported on this device");
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("Image compression failed");
  return new File([blob], name, { type: "image/jpeg" });
}

function baseName(name: string): string {
  return (name || "").replace(/\.[^.]+$/, "");
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the selected file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the selected image"));
    img.src = src;
  });
}
