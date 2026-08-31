"use client";

/** Small fetch helpers for the browser side. */

import { isLocalMode } from "./localMode";
import { localApi, localUploadFile, localUploadImages } from "./localStore";

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  // LOCAL MODE: everything stays in this browser, no server calls.
  if (isLocalMode()) return localApi<T>(url, init);

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<{ url: string }> {
  if (isLocalMode()) return localUploadFile(file);

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return { url: data.url };
}

/** Uploads a check-in view image plus its thumbnail; thumbUrl may be absent. */
export async function uploadImages(
  view: File,
  thumb?: File,
): Promise<{ url: string; thumbUrl?: string }> {
  if (isLocalMode()) return localUploadImages(view, thumb);

  const form = new FormData();
  form.append("file", view);
  if (thumb) form.append("thumb", thumb);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as
    | { url?: string; thumbUrl?: string; error?: string }
    | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || `Upload failed (${res.status})`);
  }
  return { url: data.url, thumbUrl: data.thumbUrl ?? undefined };
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
