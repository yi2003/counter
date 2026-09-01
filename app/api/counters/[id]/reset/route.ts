import { requireUser } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { jsonError, withErrors } from "@/lib/state";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    const meta = metas.find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const history = await store.getHistory(user.sub, id);
    await store.setUsed(user.sub, id, 0);
    await store.clearHistory(user.sub, id);

    // Best-effort cleanup of stored images + thumbnails (bounded to avoid timeouts).
    await Promise.all(
      history.slice(0, 100).flatMap((r) => [deleteImage(r.image), deleteImage(r.thumb)]),
    );

    // GROUP SEMANTICS: resetting a counter resets its sub-counters too.
    const children = metas.filter((m) => m.parentId === id);
    const subIds: string[] = [];
    for (const child of children) {
      const childHistory = await store.getHistory(user.sub, child.id);
      await store.setUsed(user.sub, child.id, 0);
      await store.clearHistory(user.sub, child.id);
      await Promise.all(
        childHistory
          .slice(0, 100)
          .flatMap((r) => [deleteImage(r.image), deleteImage(r.thumb)]),
      );
      subIds.push(child.id);
    }

    return Response.json({ used: 0, history: [], subIds });
  });
}
