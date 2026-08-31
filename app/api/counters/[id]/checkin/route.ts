import { requireUser } from "@/lib/auth";
import { jsonError, withErrors } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanNote } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid JSON body");

    const store = await getStore();
    const meta = (await store.listMetas(user.sub)).find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const used = await store.getUsed(user.sub, id);
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

    const newUsed = await store.incrUsed(user.sub, id);
    await store.pushHistory(user.sub, id, record);

    return Response.json({ used: newUsed, record });
  });
}
