"use client";

import { LOCAL_MODE_KEY } from "./localModeKey";

/**
 * LOCAL MODE flag — "use on this device only, no sign-in".
 * Kept in localStorage (for the client-side storage adapter) and mirrored in
 * a plain cookie (so server components can render local-mode pages without a
 * session and without redirecting to /login).
 */

export function isLocalMode(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Turns local mode on and goes to the app. */
export function enableLocalMode(): void {
  try {
    localStorage.setItem(LOCAL_MODE_KEY, "1");
    document.cookie = `${LOCAL_MODE_KEY}=1; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // storage blocked → local mode cannot work
  }
  window.location.href = "/";
}

/** Clears the flag without navigating (used when a signed-in session appears). */
export function clearLocalModeFlag(): void {
  try {
    localStorage.removeItem(LOCAL_MODE_KEY);
    document.cookie = `${LOCAL_MODE_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/** Turns local mode off (user wants to sign in and sync). */
export function disableLocalMode(): void {
  clearLocalModeFlag();
  window.location.href = "/login";
}
