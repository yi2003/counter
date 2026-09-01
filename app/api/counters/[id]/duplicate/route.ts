import { requireUser } from "@/lib/auth";
import { jsonError, listSummaries, withErrors } from "@/lib/state";
import { getStore, newCounterId } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_COUNTERS = 50;

/**
 * Duplicates a counter (and all of its sub-counters) as a fresh, zeroed copy.
 * The copy itself gets " (copy)" appended to its name; its sub-counters keep
 * their original names. Cover image is intentionally not copied (the blob
 * object is owned by the original counter's delete path).
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
    const children = metas.filter((m) => m.parentId === id);

    if (metas.length + 1 + children.length > MAX_COUNTERS) {
      return jsonError(`Counter limit reached (max ${MAX_COUNTERS})`, 409);
    }

    const now = new Date().toISOString();
    const newId = newCounterId();
    const created: string[] = [newId];
    await store.saveMeta(user.sub, {
      ...meta,
      id: newId,
      name: `${meta.name} (copy)`,
      coverImage: null,
      createdAt: now,
    });
    for (const child of children) {
      const childId = newCounterId();
      created.push(childId);
      await store.saveMeta(user.sub, {
        ...child,
        id: childId,
        parentId: newId,
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
