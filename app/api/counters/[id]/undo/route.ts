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
    const meta = (await store.listMetas(user.sub)).find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const removed = await store.popHistory(user.sub, id);
    if (!removed) return jsonError("Nothing to undo", 400);

    const used = Math.max(0, await store.decrUsed(user.sub, id));
    // Best-effort cleanup of the removed record's view image + thumbnail.
    await Promise.all([deleteImage(removed.image), deleteImage(removed.thumb)]);

    return Response.json({ used, removed });
  });
}
