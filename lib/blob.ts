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

  blobTokenSource = found?.key;
  return found?.value;
}

let blobTokenSource: string | undefined;

export function blobEnabled(): boolean {
  return Boolean(blobToken());
}

/**
 * True when a Blob store is reachable at all: either a static read/write
 * token exists, or the project is linked to a store via the newer
 * BLOB_STORE_ID connection model — in that case the SDK authenticates with
 * platform credentials on Vercel (no static token; same as the official
 * docs examples that pass no token at all).
 */
export function blobConnected(): boolean {
  logBlobStatus();
  return Boolean(blobToken() || platformStoreConnected());
}

function cleanStoreId(): string | undefined {
  const raw = process.env.BLOB_STORE_ID?.trim().replace(/^["']+|["']+$/g, "");
  return raw || undefined;
}

function platformStoreConnected(): boolean {
  const storeId = cleanStoreId();
  if (!storeId) return false;
  // Platform (OIDC-based) credentials only exist on Vercel's runtime.
  return Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Credential options for put/get/del. Prefers a static read/write token;
 * otherwise passes the cleaned BLOB_STORE_ID so the SDK authenticates via
 * the platform (OIDC) connection. Cleaning matters: a value pasted with
 * surrounding quotes would otherwise make the SDK look up a store whose id
 * literally starts with a quote ("This store does not exist").
 */
export function credOptions(): { token?: string; storeId?: string } {
  const t = blobToken();
  if (t) return { token: t };
  const sid = platformStoreConnected() ? cleanStoreId() : undefined;
  return sid ? { storeId: sid } : {};
}

let loggedStatus: string | null | undefined;

/** Logs (once) which Blob credential mode the environment provides. */
export function logBlobStatus(): void {
  if (loggedStatus !== undefined) return;
  if (blobToken()) {
    loggedStatus = "static-token";
    console.log(`[blob] using Blob token from env var: ${blobTokenSource}`);
  } else if (platformStoreConnected()) {
    loggedStatus = "connected-store";
    console.log("[blob] using connected store (BLOB_STORE_ID) with platform credentials");
  } else {
    loggedStatus = "none";
    console.warn(
      "[blob] no Blob credentials found — images will use ephemeral local storage. " +
        "Connect a Blob store (Storage tab) or set BLOB_READ_WRITE_TOKEN, then redeploy.",
    );
  }
}

export async function uploadImage(
  file: File,
  opts: { id?: string; prefix?: string } = {},
): Promise<string> {
  // A shared `id` + filename `prefix` ("thumb-" / "") pairs the two files.
  const id = opts.id ?? `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const name = `${opts.prefix ?? ""}${id}${extFor(file)}`;

  if (blobConnected()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`checkins/${name}`, file, {
      access: "private",
      addRandomSuffix: false,
      ...credOptions(),
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
    } else if (blobConnected()) {
      const { del } = await import("@vercel/blob");
      await del(url, credOptions());
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
