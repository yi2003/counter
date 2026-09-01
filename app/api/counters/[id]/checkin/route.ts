import { requireUser } from "@/lib/auth";
import { jsonError, withErrors, withClientRecordImages } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanNote } from "@/lib/validate";
import type { CheckinRecord, CounterMeta } from "@/lib/types";

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

    const isRounder = meta.rounder === true;

    let used = await store.getUsed(user.sub, id);
    if (!isRounder && used >= meta.total) {
      return jsonError("Target already reached", 409);
    }

    // A rounder check-in has no record of its own — it just +1s its exercises.
    let record: CheckinRecord | null = null;
    if (!isRounder) {
      record = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        note: cleanNote(body.note),
        image: cleanImageUrl(body.image),
        thumb: cleanImageUrl(body.thumb),
      };
      used = await store.incrUsed(user.sub, id);
      await store.pushHistory(user.sub, id, record);
    }

    // GROUP SEMANTICS (rounders): checking in a round adds +1 to every
    // exercise inside it. Exercises already at their target are skipped.
    const children = metas.filter((m) => m.parentId === id && m.rounder !== true);
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
        timestamp: record?.timestamp ?? new Date().toISOString(),
        note: null,
        image: null,
        thumb: null,
        origin: record?.id,
      });
      subUpdates.push({ id: child.id, used: childNewUsed });
    }

    // PARENT AUTO-ROUND: resolve which (round → counter) pair this check-in
    // may complete. When EVERY exercise of the round has reached its target
    // and the counter hasn't counted this round yet, the counter +1s itself.
    let round: CounterMeta | undefined;
    let counter: CounterMeta | undefined;
    if (meta.rounder) {
      round = meta;
      counter = metas.find((m) => m.id === meta.parentId);
    } else if (meta.parentId) {
      const r = metas.find((m) => m.id === meta.parentId);
      if (r?.rounder) {
        round = r;
        counter = metas.find((m) => m.id === r.parentId);
      }
    }

    let parentUpdate: { id: string; used: number } | undefined;
    if (round && counter) {
      const exercises = metas.filter((m) => m.parentId === round!.id && m.rounder !== true);
      const usages = await Promise.all(
        exercises.map(async (s) => ({ t: s.total, u: await store.getUsed(user.sub, s.id) })),
      );
      if (usages.length > 0 && usages.every(({ t, u }) => u >= t)) {
        const counterUsed = await store.getUsed(user.sub, counter.id);
        if (counterUsed < counter.total) {
          const marker = `round:${round.id}`;
          const counterHistory = await store.getHistory(user.sub, counter.id);
          if (!counterHistory.some((r) => r.origin === marker)) {
            const counterNewUsed = await store.incrUsed(user.sub, counter.id);
            await store.pushHistory(user.sub, counter.id, {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              timestamp: record?.timestamp ?? new Date().toISOString(),
              note: `Auto — ${round.name} completed`,
              image: null,
              thumb: null,
              origin: marker,
            });
            parentUpdate = { id: counter.id, used: counterNewUsed };
          }
        }
      }
    }

    // Serve the proxy URL (not the raw private blob URL) so the new record
    // renders immediately — same rewriting as buildCounterState.
    return Response.json({
      used,
      record: record ? withClientRecordImages([record])[0] : null,
      subUpdates,
      skipped,
      parentUpdate,
    });
  });
}
