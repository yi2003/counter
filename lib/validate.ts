/** Input sanitization shared by API routes. */

export function cleanNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 500);
  return s || null;
}

export function cleanImageUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, 2048);
  if (s.startsWith("https://") || s.startsWith("/api/uploads/")) return s;
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
