import { requireUser } from "@/lib/auth";
import { uploadImage } from "@/lib/blob";
import { jsonError, withErrors } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accepts multipart/form-data:
 *  - "file":  view image (required, ≤800px after client compression)
 *  - "thumb": thumbnail (optional, ≤240px after client compression)
 * Both files share one id; the thumbnail gets a "thumb-" filename prefix.
 * Returns { url, thumbUrl }.
 */
export async function POST(req: Request) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError("Expected multipart/form-data with a \"file\" field");
    }

    const file = form.get("file");
    const thumb = form.get("thumb");

    if (!(file instanceof File)) return jsonError("Missing file field");
    if (!file.type.startsWith("image/")) return jsonError("Only image files are allowed", 415);
    if (file.size > 10 * 1024 * 1024) return jsonError("Image too large (max 10 MB)", 413);

    if (thumb instanceof File) {
      if (!thumb.type.startsWith("image/")) return jsonError("Thumbnail must be an image", 415);
      if (thumb.size > 5 * 1024 * 1024) return jsonError("Thumbnail too large (max 5 MB)", 413);
    }

    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const url = await uploadImage(file, { id });
    const thumbUrl =
      thumb instanceof File ? await uploadImage(thumb, { id, prefix: "thumb-" }) : undefined;
    return Response.json(thumbUrl ? { url, thumbUrl } : { url });
  });
}
