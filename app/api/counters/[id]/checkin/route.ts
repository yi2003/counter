import { requireUser } from "@/lib/auth";
import { jsonError, withErrors, withClientRecordImages } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanNote } from "@/lib/validate";
import type { CheckinRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid JSON body");

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    const meta = metas.find((m) => m.id === id);
    if (!meta) return jsonError("Counter not found", 404);

    const used = await store.getUsed(user.sub, id);
    if (used >= meta.total) {
      return jsonError("Target already reached", 409);
    }

    const record: CheckinRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      note: cleanNote(body.note),
      image: cleanImageUrl(body.image),
      thumb: cleanImageUrl(body.thumb),
    };

    const newUsed = await store.incrUsed(user.sub, id);
    await store.pushHistory(user.sub, id, record);

    // GROUP SEMANTICS: checking in a counter that has sub-counters completes
    // one round — every direct sub-counter also gets +1. Subs already at
    // their own target are skipped (reported back to the client).
    const children = metas.filter((m) => m.parentId === id);
    const subUpdates: { id: string; used: number }[] = [];
    const skipped: string[] = [];
    for (const child of children) {
      const childUsed = await store.getUsed(user.sub, child.id);
      if (childUsed >= child.total) {
        skipped.push(child.name);
        continue;
      }
      const childNewUsed = await store.incrUsed(user.sub, child.id);
      await store.pushHistory(user.sub, child.id, {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: record.timestamp,
        note: null,
        image: null,
        thumb: null,
        origin: record.id,
      });
      subUpdates.push({ id: child.id, used: childNewUsed });
    }

    // Serve the proxy URL (not the raw private blob URL) so the new record
    // renders immediately — same rewriting as buildCounterState.
    return Response.json({
      used: newUsed,
      record: withClientRecordImages([record])[0],
      subUpdates,
      skipped,
    });
  });
}
