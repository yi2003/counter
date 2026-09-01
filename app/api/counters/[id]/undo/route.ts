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

    const removed = await store.popHistory(user.sub, id);
    if (!removed) return jsonError("Nothing to undo", 400);

    const used = Math.max(0, await store.decrUsed(user.sub, id));
    // Best-effort cleanup of the removed record's view image + thumbnail.
    await Promise.all([deleteImage(removed.image), deleteImage(removed.thumb)]);

    // GROUP SEMANTICS: undoing a round also removes the auto-records that
    // round created in each sub-counter (matched by origin tag).
    const children = metas.filter((m) => m.parentId === id);
    const subUpdates: { id: string; used: number }[] = [];
    for (const child of children) {
      const childHistory = await store.getHistory(user.sub, child.id);
      const idx = childHistory.findIndex((r) => r.origin === removed.id);
      if (idx === -1) continue;
      await store.setHistory(
        user.sub,
        child.id,
        childHistory.filter((_, i) => i !== idx),
      );
      const childUsed = Math.max(0, (await store.getUsed(user.sub, child.id)) - 1);
      await store.setUsed(user.sub, child.id, childUsed);
      subUpdates.push({ id: child.id, used: childUsed });
    }

    return Response.json({ used, removed, subUpdates });
  });
}
