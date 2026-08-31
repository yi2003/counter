import fsSync from "fs";
import os from "os";
import path from "path";

/**
 * Base directory for the local-fallback storage (used when KV/Blob env vars
 * are absent). DATA_DIR overrides the default candidate list.
 *
 * The project directory is READ-ONLY on serverless platforms (Vercel etc.),
 * so each candidate is probed once and the first writable one wins:
 *   DATA_DIR (if set)  →  <cwd>/.data  →  ephemeral /tmp
 * /tmp is per-instance and non-persistent — the fallback is a dev/preview
 * convenience only; real deployments should configure Vercel KV + Blob.
 */
export function baseDataDir(): string {
  const candidates: string[] = [];
  if (process.env.DATA_DIR) candidates.push(process.env.DATA_DIR);
  candidates.push(path.join(process.cwd(), ".data"));

  for (const dir of candidates) {
    try {
      fsSync.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // Not writable (read-only fs, ENOTDIR, permissions…) — try the next one.
    }
  }

  const tmp = path.join(os.tmpdir(), "checkin-counter");
  try {
    fsSync.mkdirSync(tmp, { recursive: true });
  } catch {
    // Even /tmp failed — return it anyway; storage errors now surface as
    // readable JSON via the API error envelope.
  }
  return tmp;
}
