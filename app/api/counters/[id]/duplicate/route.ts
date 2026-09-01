import { requireUser } from "@/lib/auth";
import { jsonError, listSummaries, withErrors } from "@/lib/state";
import { getStore, newCounterId } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_COUNTERS = 50;

/** First free variant of `name` among the taken names (" (copy)", " (copy 2)"…). */
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  if (!taken.has(`${name} (copy)`)) return `${name} (copy)`;
  for (let n = 2; ; n++) {
    const candidate = `${name} (copy ${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Duplicates a counter. Two modes:
 *
 * 1. No body → full subtree duplicate (rounds and their sub-counters) as a
 *    fresh, zeroed copy named "<name> (copy)".
 * 2. Body { parentId } → "copy to round": copies the counter (a sub-counter)
 *    — or, for a round, ALL of its sub-counters — into the target round,
 *    zeroed, keeping names (uniquified on collision). Cover images are
 *    intentionally not copied (the blob object is owned by the original's
 *    delete path).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as { parentId?: string } | null;

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    const meta = metas.find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const now = new Date().toISOString();

    /* -------------------- mode 2: copy (sub-counters) to round ------------- */
    if (body?.parentId) {
      const targetId = body.parentId;
      const target = metas.find((m) => m.id === targetId);
      if (!target) return jsonError("Target round not found", 404);
      if (target.rounder !== true) return jsonError("Copy target must be a round", 400);

      let sources: typeof metas;
      if (meta.rounder === true) {
        if (targetId === id) return jsonError("Cannot copy a round into itself", 400);
        sources = metas.filter((m) => m.parentId === id && m.rounder !== true);
      } else {
        const sourceParent = metas.find((m) => m.id === meta.parentId);
        if (!sourceParent?.rounder) {
          return jsonError("Only sub-counters inside a round can be copied to a round", 400);
        }
        sources = [meta];
      }

      if (metas.length + sources.length > MAX_COUNTERS) {
        return jsonError(`Counter limit reached (max ${MAX_COUNTERS})`, 409);
      }

      const taken = new Set(
        metas.filter((m) => m.parentId === targetId).map((m) => m.name),
      );
      let lastId: string | null = null;
      for (const c of sources) {
        const newId = newCounterId();
        lastId = newId;
        const name = uniqueName(c.name, taken);
        taken.add(name);
        await store.saveMeta(user.sub, {
          ...c,
          id: newId,
          parentId: targetId,
          name,
          coverImage: null,
          createdAt: now,
        });
        await store.setUsed(user.sub, newId, 0);
        await store.clearHistory(user.sub, newId);
      }

      return Response.json({
        ...(await listSummaries(user.sub)),
        id: lastId,
        created: sources.length,
      });
    }

    /* -------------------- mode 1: full subtree duplicate ------------------- */
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
