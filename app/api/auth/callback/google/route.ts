import {
  authConfigured,
  createSessionToken,
  exchangeCode,
  fetchGoogleUser,
  readCookie,
  sessionSetCookie,
  stateClearCookie,
} from "@/lib/auth";
import { jsonError, withErrors } from "@/lib/state";

export const dynamic = "force-dynamic";

function loginRedirect(origin: string, error?: string): Response {
  const url = new URL("/login", origin);
  if (error) url.searchParams.set("error", error);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

/** OAuth callback: validates state, exchanges the code, issues the session cookie. */
export async function GET(req: Request) {
  return withErrors(async () => {
    if (!authConfigured()) return loginRedirect(new URL(req.url).origin, "not_configured");

    const url = new URL(req.url);
    const origin = url.origin;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readCookie(req.headers.get("cookie") || "", "cc_oauth_state");

    if (!code || !state || !expectedState || state !== expectedState) {
      return loginRedirect(origin, "state");
    }

    const accessToken = await exchangeCode(code, `${origin}/api/auth/callback/google`);
    if (!accessToken) return loginRedirect(origin, "token");

    const user = await fetchGoogleUser(accessToken);
    if (!user) return loginRedirect(origin, "userinfo");

    const token = await createSessionToken(user);
    const headers = new Headers({ Location: "/" });
    headers.append("Set-Cookie", sessionSetCookie(token));
    headers.append("Set-Cookie", stateClearCookie());
    return new Response(null, { status: 302, headers });
  });
}
