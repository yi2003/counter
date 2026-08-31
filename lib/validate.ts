/** Input sanitization shared by API routes. */

export function cleanNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 500);
  return s || null;
}

export function cleanImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 4096);
  // The client may echo back the proxy URL we served (/api/image?u=<raw>).
  // Unwrap it so the RAW blob URL is what gets stored.
  const proxied = /^\/api\/image\?u=([^&]+)$/.exec(s);
  if (proxied) {
    try {
      const raw = decodeURIComponent(proxied[1]);
      if (raw.startsWith("https://")) return raw.slice(0, 2048);
    } catch {
      // malformed encoding → reject below
    }
    return null;
  }
  if (s.startsWith("https://") || s.startsWith("/api/uploads/")) return s.slice(0, 2048);
  return null;
}

export function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 100);
  return s || null;
}

export function cleanTotal(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  if (v < 1 || v > 1_000_000) return null;
  return v;
}
