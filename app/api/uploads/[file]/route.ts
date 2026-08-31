import fs from "fs/promises";
import path from "path";
import { blobEnabled, uploadDir } from "@/lib/blob";

/**
 * Dev-only route that serves locally stored uploads (<dataDir>/uploads).
 * In production, images live in Vercel Blob and are served by its CDN,
 * so this route returns 404 when Blob is configured.
 */

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  if (blobEnabled()) return new Response("Not found", { status: 404 });

  const { file } = await params;
  const safe = path.basename(file);
  if (!/^[A-Za-z0-9._-]+$/.test(safe)) return new Response("Not found", { status: 404 });

  const type = TYPES[path.extname(safe).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });

  try {
    const buf = await fs.readFile(path.join(uploadDir(), safe));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
