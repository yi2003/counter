import { jsonError } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanNote } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid JSON body");

  const store = await getStore();
  const meta = (await store.listMetas()).find((m) => m.id === id);
  if (!meta) return jsonError("Counter not found", 404);

  const used = await store.getUsed(id);
  if (used >= meta.total) {
    return jsonError("Target already reached", 409);
  }

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    note: cleanNote(body.note),
    image: cleanImageUrl(body.image),
    thumb: cleanImageUrl(body.thumb),
  };

  const newUsed = await store.incrUsed(id);
  await store.pushHistory(id, record);

  return Response.json({ used: newUsed, record });
}
