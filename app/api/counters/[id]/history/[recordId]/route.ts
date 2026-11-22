import { requireUser } from "@/lib/auth";
import { deleteImage } from "@/lib/blob";
import { jsonError, withErrors, withClientRecordImages } from "@/lib/state";
import { getStore } from "@/lib/store";
import { cleanImageUrl, cleanNote } from "@/lib/validate";
import type { CheckinRecord } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; recordId: string }> };

/** Update a specific history entry (note, timestamp, image). */
export async function PUT(req: Request, { params }: Ctx) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id, recordId } = await params;

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError("Invalid JSON body");

    const store = await getStore();
    const history = await store.getHistory(user.sub, id);
    const index = history.findIndex((r) => r.id === recordId);
    if (index < 0) return jsonError("History entry not found", 404);

    const oldRecord = history[index];
    const updated: CheckinRecord = { ...oldRecord };

    // Update note
    if ("note" in body) {
      updated.note = cleanNote(body.note);
    }

    // Update timestamp
    if ("timestamp" in body && typeof body.timestamp === "string") {
      const ts = new Date(body.timestamp);
      if (isNaN(ts.getTime())) {
        return jsonError("Invalid timestamp");
      }
      updated.timestamp = ts.toISOString();
    }

    // Update images
    if ("image" in body) {
      const newImage = cleanImageUrl(body.image);
      if (newImage !== oldRecord.image) {
        // Clean up old images
        await Promise.all([deleteImage(oldRecord.image), deleteImage(oldRecord.thumb)]);
        updated.image = newImage;
        updated.thumb = cleanImageUrl(body.thumb);
      }
    }

    // Update the history array
    history[index] = updated;

    // If timestamp changed, re-sort to maintain newest-first order
    if (updated.timestamp !== oldRecord.timestamp) {
      history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    await store.setHistory(user.sub, id, history);

    // Return the updated record with client-safe image URLs
    return Response.json({ record: withClientRecordImages([updated])[0] });
  });
}

/** Delete a specific history entry and decrement the counter. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);
    const { id, recordId } = await params;

    const store = await getStore();
    const history = await store.getHistory(user.sub, id);
    const index = history.findIndex((r) => r.id === recordId);
    if (index < 0) return jsonError("History entry not found", 404);

    const deleted = history[index];

    // Remove from history
    history.splice(index, 1);
    await store.setHistory(user.sub, id, history);

    // Decrement the counter (unless it was an auto-generated entry with origin)
    let newUsed = await store.getUsed(user.sub, id);
    if (!deleted.origin) {
      newUsed = await store.decrUsed(user.sub, id);
    }

    // Best-effort cleanup of images
    await Promise.all([deleteImage(deleted.image), deleteImage(deleted.thumb)]);

    return Response.json({ ok: true, used: newUsed });
  });
}
