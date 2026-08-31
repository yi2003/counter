import { blobConnected } from "./blob";
import { getStore } from "./store";
import type { AppState, CheckinRecord, CounterMeta, CounterSummary } from "./types";

/**
 * Rewrites stored image URLs for the client:
 * - local dev files (/api/uploads/...) pass through
 * - Blob URLs become /api/image?u=... so private images are only readable
 *   through the authenticated proxy, never by raw URL
 */
export function toClientImageUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/api/uploads/")) return raw;
  if (/^https:\/\//.test(raw)) return `/api/image?u=${encodeURIComponent(raw)}`;
  return raw;
}

function withClientImages(meta: CounterMeta): CounterMeta {
  return { ...meta, coverImage: toClientImageUrl(meta.coverImage) };
}

/** Rewrites image refs in records/cover for the client (idb: pass-through). */
export function withClientRecordImages(records: CheckinRecord[]): CheckinRecord[] {
  return records.map((r) => ({
    ...r,
    image: toClientImageUrl(r.image),
    thumb: toClientImageUrl(r.thumb),
  }));
}

/** Home-screen summaries: every counter of ONE user + current used counts. */
export async function listSummaries(
  userId: string,
): Promise<{ counters: CounterSummary[]; storage: "kv" | "local"; blob: boolean }> {
  const store = await getStore();
  const metas = await store.listMetas(userId);
  const counters = await Promise.all(
    metas.map(async (m) => ({
      id: m.id,
      name: m.name,
      total: m.total,
      coverImage: toClientImageUrl(m.coverImage),
      createdAt: m.createdAt,
      parentId: m.parentId ?? null,
      used: await store.getUsed(userId, m.id),
    })),
  );
  return { counters, storage: store.mode, blob: blobConnected() };
}

/** Full state of one of the user's counters, or null when the id is unknown. */
export async function buildCounterState(
  userId: string,
  id: string,
): Promise<AppState | null> {
  const store = await getStore();
  const metas = await store.listMetas(userId);
  const meta = metas.find((m) => m.id === id);
  if (!meta) return null;
  const used = await store.getUsed(userId, id);
  const history = withClientRecordImages(await store.getHistory(userId, id));
  return { project: withClientImages(meta), used, history, storage: store.mode, blob: blobConnected() };
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

/** Wraps a route handler so unexpected errors return readable JSON, not a blind 500. */
export async function withErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // Full stack lands in the platform logs (e.g. Vercel → Deployments → Logs).
    console.error("[api] handler error:", err);
    return jsonError(err instanceof Error ? err.message : "Internal server error", 500);
  }
}
