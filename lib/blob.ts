import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { baseDataDir } from "./paths";

/**
 * Image storage:
 * - Production: Vercel Blob (requires BLOB_READ_WRITE_TOKEN).
 * - Dev fallback: local files under <dataDir>/uploads served via /api/uploads/[file].
 *   <dataDir> is the project's .data/ locally, or ephemeral /tmp on serverless.
 */

const UPLOAD_DIR = path.join(baseDataDir(), "uploads");

/** Directory the /api/uploads/[file] route serves from. */
export function uploadDir(): string {
  return UPLOAD_DIR;
}

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function uploadImage(
  file: File,
  opts: { id?: string; prefix?: string } = {},
): Promise<string> {
  // A shared `id` + filename `prefix` ("thumb-" / "") pairs the two files.
  const id = opts.id ?? `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const name = `${opts.prefix ?? ""}${id}${extFor(file)}`;

  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`checkins/${name}`, file, {
      access: "public",
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/api/uploads/${name}`;
}

/** Best-effort image cleanup (never throws). */
export async function deleteImage(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    if (url.startsWith("/api/uploads/")) {
      await fs.unlink(path.join(UPLOAD_DIR, path.basename(url)));
    } else if (blobEnabled()) {
      const { del } = await import("@vercel/blob");
      await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    }
  } catch (err) {
    console.warn("[blob] deleteImage failed (ignored):", err);
  }
}

function extFor(file: File): string {
  const byType: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
  };
  if (byType[file.type]) return byType[file.type];
  const m = /\.(jpe?g|png|webp|gif|heic|heif)$/i.exec(file.name || "");
  return m ? `.${m[1].toLowerCase()}` : ".jpg";
}
