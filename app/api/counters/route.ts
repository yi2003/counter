import { requireUser } from "@/lib/auth";
import { newCounterId } from "@/lib/store";
import { jsonError, listSummaries, withErrors } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanName, cleanTotal } from "@/lib/validate";

export const dynamic = "force-dynamic";

const MAX_COUNTERS = 50;

export async function GET() {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    return Response.json(await listSummaries(user.sub));
  });
}

export async function POST(req: Request) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid JSON body");

    const name = cleanName(body.name);
    if (!name) return jsonError("Project name cannot be empty");
    const total = cleanTotal(body.total ?? 60);
    if (total === null) return jsonError("Total must be an integer between 1 and 1,000,000");

    const store = await getStore();
    const metas = await store.listMetas(user.sub);
    if (metas.length >= MAX_COUNTERS) {
      return jsonError(`Counter limit reached (max ${MAX_COUNTERS})`, 409);
    }

    // Optional parent: creates a sub-counter (one level deep only).
    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    if (parentId) {
      const parent = metas.find((m) => m.id === parentId);
      if (!parent) return jsonError("Parent counter not found", 404);
      if (parent.parentId) return jsonError("Sub-counters cannot have their own sub-counters", 400);
    }

    const meta = {
      id: newCounterId(),
      name,
      total,
      coverImage: null,
      createdAt: new Date().toISOString(),
      parentId,
    };
    await store.saveMeta(user.sub, meta);
    await store.setUsed(user.sub, meta.id, 0);

    return Response.json({ ...(await listSummaries(user.sub)), id: meta.id });
  });
}
