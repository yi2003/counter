import { blobEnabled } from "./blob";
import { getStore } from "./store";
import type { AppState, CounterSummary } from "./types";

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
      coverImage: m.coverImage,
      createdAt: m.createdAt,
      parentId: m.parentId ?? null,
      used: await store.getUsed(userId, m.id),
    })),
  );
  return { counters, storage: store.mode, blob: blobEnabled() };
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
  const history = await store.getHistory(userId, id);
  return { project: meta, used, history, storage: store.mode, blob: blobEnabled() };
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
