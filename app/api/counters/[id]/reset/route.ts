import { deleteImage } from "@/lib/blob";
import { jsonError, withErrors } from "@/lib/state";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const { id } = await params;
    const store = await getStore();

    const meta = (await store.listMetas()).find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const history = await store.getHistory(id);
    await store.setUsed(id, 0);
    await store.clearHistory(id);

    // Best-effort cleanup of stored images + thumbnails (bounded to avoid timeouts).
    await Promise.all(
      history.slice(0, 100).flatMap((r) => [deleteImage(r.image), deleteImage(r.thumb)]),
    );

    return Response.json({ used: 0, history: [] });
  });
}
