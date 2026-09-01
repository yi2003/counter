import { requireUser } from "@/lib/auth";
import { jsonError, listSummaries, withErrors } from "@/lib/state";
import { getStore, newCounterId } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_COUNTERS = 50;

/**
 * Duplicates a counter — and everything below it (rounds and their
 * sub-counters) — as a fresh, zeroed copy. The copy itself gets " (copy)"
 * appended to its name; everything below keeps its original names. Cover
 * images are intentionally not copied (the blob object is owned by the
 * original's delete path).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    const meta = metas.find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    // Children: for a top counter these are rounds; for a round these are
    // sub-counters. Grandchildren: sub-counters of the copied rounds.
    const isRounder = meta.rounder === true;
    const childRounders = isRounder ? [] : metas.filter((m) => m.parentId === id && m.rounder === true);
    const directChildren = metas.filter((m) => m.parentId === id && m.rounder !== true);
    const childIds = new Set([...childRounders, ...directChildren].map((c) => c.id));
    const grandchildren = metas.filter(
      (m) => m.parentId && childIds.has(m.parentId) && m.parentId !== id,
    );

    const totalNew = 1 + childRounders.length + directChildren.length + grandchildren.length;
    if (metas.length + totalNew > MAX_COUNTERS) {
      return jsonError(`Counter limit reached (max ${MAX_COUNTERS})`, 409);
    }

    const now = new Date().toISOString();
    const newId = newCounterId();
    const created: string[] = [newId];
    const idMap = new Map<string, string>([[id, newId]]);

    await store.saveMeta(user.sub, {
      ...meta,
      id: newId,
      name: `${meta.name} (copy)`,
      coverImage: null,
      createdAt: now,
    });

    for (const r of childRounders) {
      const rid = newCounterId();
      created.push(rid);
      idMap.set(r.id, rid);
      await store.saveMeta(user.sub, { ...r, id: rid, parentId: newId, coverImage: null, createdAt: now });
    }
    for (const c of directChildren) {
      const cid = newCounterId();
      created.push(cid);
      idMap.set(c.id, cid);
      await store.saveMeta(user.sub, {
        ...c,
        id: cid,
        parentId: idMap.get(c.parentId!) ?? newId,
        coverImage: null,
        createdAt: now,
      });
    }
    for (const g of grandchildren) {
      const gid = newCounterId();
      created.push(gid);
      await store.saveMeta(user.sub, {
        ...g,
        id: gid,
        parentId: idMap.get(g.parentId!) ?? newId,
        coverImage: null,
        createdAt: now,
      });
    }

    for (const cid of created) {
      await store.setUsed(user.sub, cid, 0);
      await store.clearHistory(user.sub, cid);
    }

    return Response.json({ ...(await listSummaries(user.sub)), id: newId });
  });
}
