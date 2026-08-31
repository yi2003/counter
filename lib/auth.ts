import { cookies } from "next/headers";
import type { SessionUser } from "./types";

/**
 * Google sign-in with signed-cookie sessions — no external auth dependency.
 *
 * - When GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are NOT set, the app runs in
 *   public "guest" mode (exactly as before) so deploys never break.
 * - When they ARE set, every page/API requires a valid session and all data is
 *   scoped to the signed-in Google account (user.sub).
 *
 * OAuth 2.0 code flow with a state cookie (CSRF), userinfo fetched server-side,
 * session = base64url(payload) + "." + HMAC-SHA256(payload, secret), HttpOnly.
 */

export const GUEST_USER: SessionUser = {
  sub: "guest",
  name: "Guest",
  email: null,
  picture: null,
};

const SESSION_COOKIE = "cc_session";
const STATE_COOKIE = "cc_oauth_state";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function authConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function sessionSecret(): string {
  // SESSION_SECRET wins; the Google client secret is already a high-entropy
  // per-deployment secret, so it is a sound fallback.
  return process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || "insecure-dev-secret";
}

/* -------- base64url + HMAC via Web Crypto (node, edge and browser safe) -------- */

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecodeBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function hmacKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionUser | null> {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const key = await hmacKey(["verify"]);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlDecodeBytes(sig), enc.encode(body));
    if (!ok) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecodeBytes(body)),
    ) as SessionUser & { exp?: number };
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      name: payload.name || "User",
      email: payload.email ?? null,
      picture: payload.picture ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Current user for pages AND route handlers.
 * Returns the shared GUEST user when auth is not configured, else the cookie
 * session or null (caller decides to 401/redirect).
 */
export async function requireUser(): Promise<SessionUser | null> {
  if (!authConfigured()) return GUEST_USER;
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/* ------------------------------ cookies ------------------------------ */

function secureFlag(): string {
  return process.env.NODE_ENV === "production" ? "; Secure" : "";
}

export function sessionSetCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secureFlag()}`;
}

export function sessionClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export function stateSetCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secureFlag()}`;
}

export function stateClearCookie(): string {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag()}`;
}

export function readCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

/* ------------------------------ Google OAuth ------------------------------ */

export function googleAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchGoogleUser(accessToken: string): Promise<SessionUser | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as { sub?: string; name?: string; email?: string; picture?: string };
  if (!u.sub) return null;
  return {
    sub: u.sub,
    name: u.name || "Google user",
    email: u.email ?? null,
    picture: u.picture ?? null,
  };
}
