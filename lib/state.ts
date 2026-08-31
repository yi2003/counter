import { getStore } from "./store";
import type { AppState, CounterMeta, CounterSummary } from "./types";

/** Home-screen summaries: every counter's config + current used count. */
export async function listSummaries(): Promise<{
  counters: CounterSummary[];
  storage: "kv" | "local";
}> {
  const store = await getStore();
  const metas = await store.listMetas();
  const counters = await Promise.all(
    metas.map(async (m) => ({
      id: m.id,
      name: m.name,
      total: m.total,
      coverImage: m.coverImage,
      createdAt: m.createdAt,
      parentId: m.parentId ?? null,
      used: await store.getUsed(m.id),
    })),
  );
  return { counters, storage: store.mode };
}

/** Full state of one counter, or null when the id is unknown. */
export async function buildCounterState(id: string): Promise<AppState | null> {
  const store = await getStore();
  const metas = await store.listMetas();
  const meta: CounterMeta | undefined = metas.find((m) => m.id === id);
  if (!meta) return null;
  const used = await store.getUsed(id);
  const history = await store.getHistory(id);
  return { project: meta, used, history, storage: store.mode };
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}
