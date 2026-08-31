import { get as getBlob } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { jsonError, withErrors } from "@/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated proxy for private Vercel Blob images.
 * Stored records point here (/api/image?u=<blobUrl>); the route checks the
 * session, then streams the bytes. Raw blob URLs are never exposed publicly.
 */
export async function GET(req: Request) {
  return withErrors(async () => {
    const user = await requireUser();
    if (!user) return jsonError("Sign in required", 401);

    const u = new URL(req.url).searchParams.get("u");
    if (!u || !u.startsWith("https://") || u.length > 2048) {
      return jsonError("Invalid image url", 400);
    }

    let stream: ReadableStream<Uint8Array>;
    let contentType: string | null;
    let contentLength: string | null;
    let etag: string | null;
    try {
      const res = await getBlob(u, {
        access: "private",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      if (!res || res.statusCode !== 200 || !res.stream) {
        return jsonError("Not found", 404);
      }
      stream = res.stream;
      contentType = res.blob.contentType ?? res.headers.get("content-type");
      contentLength = res.headers.get("content-length");
      etag = res.headers.get("etag");
    } catch (err) {
      console.warn("[image] blob get failed:", err);
      return jsonError("Not found", 404);
    }

    const out = new Headers();
    if (contentType) out.set("Content-Type", contentType);
    if (contentLength) out.set("Content-Length", contentLength);
    if (etag) out.set("ETag", etag);
    out.set("Cache-Control", "private, max-age=86400, immutable");
    out.set("Content-Disposition", "inline");

    return new Response(stream, { status: 200, headers: out });
  });
}
