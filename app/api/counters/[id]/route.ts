import { requireUser } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { buildCounterState, ensureRoundMigration, jsonError, withErrors } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanName, cleanTotal } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;
    // Pre-round data (sub-counters attached directly to the counter) is wrapped
    // into a "Round 1" group on first view.
    await ensureRoundMigration(user.sub, id);
    const state = await buildCounterState(user.sub, id);
    if (!state) return jsonError("Counter not found", 404);
    return Response.json(state);
  });
}

/** Update the counter's config: name / total / coverImage. */
export async function PUT(req: Request, { params }: Ctx) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid JSON body");

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    const i = metas.findIndex((m) => m.id === id);
    if (i < 0) return jsonError("Counter not found", 404);

    const meta = { ...metas[i] };

    if ("name" in body) {
      const name = cleanName(body.name);
      if (!name) return jsonError("Project name cannot be empty");
      meta.name = name;
    }

    if ("total" in body) {
      const total = cleanTotal(body.total);
      if (total === null) return jsonError("Total must be an integer between 1 and 1,000,000");
      meta.total = total;
    }

    if ("coverImage" in body) {
      meta.coverImage = cleanImageUrl(body.coverImage);
    }

    await store.saveMeta(user.sub, meta);
    const state = await buildCounterState(user.sub, id);
    return Response.json(state);
  });
}

/** Delete the counter — cascades to rounds and their sub-counters (images cleaned up, best effort). */
export async function DELETE(_req: Request, { params }: Ctx) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id } = await params;

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    if (!metas.some((m) => m.id === id)) return jsonError("Counter not found", 404);

    const children = metas.filter((m) => m.parentId === id);
    const childIds = new Set(children.map((c) => c.id));
    const grandchildren = metas.filter((m) => m.parentId && childIds.has(m.parentId));

    const destroy = async (cid: string) => {
      const history = await store.getHistory(user.sub, cid);
      await store.destroyCounter(user.sub, cid);
      // Best-effort cleanup of stored images + thumbnails (bounded).
      await Promise.all(
        history.slice(0, 100).flatMap((r) => [deleteImage(r.image), deleteImage(r.thumb)]),
      );
    };

    await Promise.all([...grandchildren, ...children].map((c) => destroy(c.id)));
    await destroy(id);

    return Response.json({ ok: true, removed: grandchildren.length + children.length + 1 });
  });
}
