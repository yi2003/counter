import { sessionClearCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Signs out: clears the session cookie and goes home (→ /login when locked). */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": sessionClearCookie() },
  });
}
