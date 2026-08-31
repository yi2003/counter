import { authConfigured, googleAuthUrl, stateSetCookie } from "@/lib/auth";
import { jsonError } from "@/lib/state";

export const dynamic = "force-dynamic";

/** Starts the Google OAuth flow: redirects to Google with a CSRF state cookie. */
export async function GET(req: Request) {
  if (!authConfigured()) return jsonError("Google sign-in is not configured", 400);

  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID().replace(/-/g, "");

  return new Response(null, {
    status: 302,
    headers: {
      Location: googleAuthUrl(`${origin}/api/auth/callback/google`, state),
      "Set-Cookie": stateSetCookie(state),
    },
  });
}
