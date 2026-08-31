import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { baseDataDir } from "./paths";

/**
 * Image storage:
 * - Production: Vercel Blob as PRIVATE objects (requires BLOB_READ_WRITE_TOKEN).
 *   Reads go through /api/image (authenticated proxy) — raw URLs are never public.
 * - Dev fallback: local files under <dataDir>/uploads served via /api/uploads/[file].
 *   <dataDir> is the project's .data/ locally, or ephemeral /tmp on serverless.
 */

const UPLOAD_DIR = path.join(baseDataDir(), "uploads");

/** Directory the /api/uploads/[file] route serves from. */
export function uploadDir(): string {
  return UPLOAD_DIR;
}

/**
 * Finds the Blob read/write token in the environment.
 * Order: standard name (BLOB_READ_WRITE_TOKEN), then prefixed names some
 * Vercel storage integrations inject (e.g. "cc_BLOB_READ_WRITE_TOKEN"),
 * then any variable whose VALUE is a Blob token — tokens always start with
 * "vercel_blob_rw_", so the variable name does not matter.
 * Values are trimmed and stripped of surrounding quotes, so pasting the
 * .env-style line (TOKEN="vercel_blob_rw_...") also works.
 */
let loggedSource: string | null | undefined;

export function blobToken(): string | undefined {
  const clean = (v: string | undefined): string | undefined => {
    const t = v?.trim().replace(/^["']+|["']+$/g, "");
    return t && t.startsWith("vercel_blob_rw_") ? t : undefined;
  };

  const keys = Object.keys(process.env).sort();
  let found: { key: string; value: string } | undefined;

  const exact = clean(process.env.BLOB_READ_WRITE_TOKEN);
  if (exact) found = { key: "BLOB_READ_WRITE_TOKEN", value: exact };

  if (!found) {
    for (const key of keys) {
      if (!key.endsWith("_BLOB_READ_WRITE_TOKEN")) continue;
      const v = clean(process.env[key]);
      if (v) {
        found = { key, value: v };
        break;
      }
    }
  }

  if (!found) {
    for (const key of keys) {
      if (key === "BLOB_READ_WRITE_TOKEN") continue;
      const v = clean(process.env[key]);
      if (v) {
        found = { key, value: v };
        break;
      }
    }
  }

  if (loggedSource === undefined) {
    loggedSource = found?.key ?? null;
    if (loggedSource) {
      console.log(`[blob] using Blob token from env var: ${loggedSource}`);
    } else {
      console.warn(
        "[blob] no Blob token found in environment — images will use ephemeral local storage. " +
          "Set BLOB_READ_WRITE_TOKEN in Vercel (Settings → Environment Variables) and redeploy.",
      );
    }
  }

  return found?.value;
}

export function blobEnabled(): boolean {
  return Boolean(blobToken());
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
      access: "private",
      addRandomSuffix: false,
      token: blobToken(),
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
      await del(url, { token: blobToken() });
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
