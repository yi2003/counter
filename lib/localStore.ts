"use client";

import type { AppState, CheckinRecord, CounterSummary } from "./types";
import {
  localCheckin,
  localCreateCounter,
  localDeleteCounter,
  localGetCounter,
  localListSummaries,
  localReset,
  localUndo,
  localUpdateCounter,
  loadLocalData,
  saveLocalData,
  type LocalData,
} from "./localData";

/**
 * Browser-local storage backend for LOCAL MODE.
 * - Counter data (metadata/history/used) lives in localStorage.
 * - Image blobs live in IndexedDB; records store "idb:<key>" refs which the
 *   adapter resolves to blob: object URLs before handing state to the UI.
 * Mirrors the server API so components need no changes (see localApi below).
 */

const DATA_KEY = "cc_local_data_v1";
const DB_NAME = "cc-local-images";
const DB_STORE = "blobs";
const REF_PREFIX = "idb:";

function readData(): LocalData {
  try {
    return loadLocalData(localStorage.getItem(DATA_KEY));
  } catch {
    return loadLocalData(null);
  }
}

function writeData(data: LocalData): void {
  try {
    localStorage.setItem(DATA_KEY, saveLocalData(data));
  } catch (e) {
    throw new Error("Could not save locally (storage full or blocked)");
  }
}

// ------------------------------ IndexedDB ------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

function idbTx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, mode);
        const req = fn(tx.objectStore(DB_STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

function idbPut(key: string, blob: Blob): Promise<void> {
  return idbTx<void>("readwrite", (s) => s.put(blob, key)).then(() => undefined);
}

function idbGet(key: string): Promise<Blob | undefined> {
  return idbTx<Blob | undefined>("readonly", (s) => s.get(key));
}

function idbDelMany(keys: string[]): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        const store = tx.objectStore(DB_STORE);
        for (const k of keys) store.delete(k);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve(); // best-effort cleanup
        };
      }),
  );
}

// --------------------- idb: ref → blob: object URL ---------------------

const urlCache = new Map<string, string>();

async function resolveRef(ref: string | null | undefined): Promise<string | null> {
  if (!ref) return null;
  if (!ref.startsWith(REF_PREFIX)) return ref; // already a usable URL
  const cached = urlCache.get(ref);
  if (cached) return cached;
  try {
    const blob = await idbGet(ref.slice(REF_PREFIX.length));
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(ref, url);
    return url;
  } catch {
    return null;
  }
}

async function resolveRecord(r: CheckinRecord): Promise<CheckinRecord> {
  const [image, thumb] = await Promise.all([resolveRef(r.image), resolveRef(r.thumb)]);
  return { ...r, image, thumb };
}

async function resolveState(s: AppState): Promise<AppState> {
  const [coverImage, history] = await Promise.all([
    resolveRef(s.project.coverImage),
    Promise.all(s.history.map(resolveRecord)),
  ]);
  return { ...s, project: { ...s.project, coverImage }, history };
}

async function resolveSummary(c: CounterSummary): Promise<CounterSummary> {
  return { ...c, coverImage: await resolveRef(c.coverImage) };
}

// ------------------------------ adapter ------------------------------

function methodOf(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function bodyOf<T>(init?: RequestInit): T | undefined {
  if (!init?.body || typeof init.body !== "string") return undefined;
  try {
    return JSON.parse(init.body) as T;
  } catch {
    return undefined;
  }
}

/** In-process "API" mirroring the server routes for local mode. */
export async function localApi<T>(url: string, init?: RequestInit): Promise<T> {
  const path = url.split("?")[0];
  const method = methodOf(init);
  const segs = path.split("/").filter(Boolean).map(decodeURIComponent);
  // expected shape: ["api", "counters", id?, action?]
  const data = readData();

  if (segs[0] === "api" && segs[1] === "counters" && segs.length === 2) {
    if (method === "GET") {
      const counters = await Promise.all(localListSummaries(data).map(resolveSummary));
      return { counters, storage: "local", blob: false } as T;
    }
    if (method === "POST") {
      const body = bodyOf<{ name: string; total: number; parentId?: string | null }>(init);
      const { id } = localCreateCounter(data, {
        name: body?.name ?? "",
        total: body?.total ?? 0,
        parentId: body?.parentId ?? null,
      });
      writeData(data);
      const counters = await Promise.all(localListSummaries(data).map(resolveSummary));
      return { counters, id } as T;
    }
  }

  if (segs[0] === "api" && segs[1] === "counters" && segs.length >= 3) {
    const id = segs[2];
    const action = segs[3];

    if (!action && method === "GET") {
      const state = localGetCounter(data, id);
      if (!state) throw new Error("Counter not found");
      return (await resolveState(state)) as T;
    }
    if (!action && method === "PUT") {
      const patch = bodyOf<{ name?: string; total?: number; coverImage?: string | null }>(init);
      const state = localUpdateCounter(data, id, patch ?? {});
      if (!state) throw new Error("Counter not found");
      writeData(data);
      return (await resolveState(state)) as T;
    }
    if (!action && method === "DELETE") {
      const { imageRefs } = localDeleteCounter(data, id);
      writeData(data);
      await idbDelMany(imageRefs.filter((r) => r.startsWith(REF_PREFIX)).map((r) => r.slice(REF_PREFIX.length)));
      return null as T;
    }
    if (action === "checkin" && method === "POST") {
      const body = bodyOf<{ note?: string | null; image?: string | null; thumb?: string | null }>(init);
      const { used, record } = localCheckin(data, id, body ?? {});
      writeData(data);
      return { used, record: await resolveRecord(record) } as T;
    }
    if (action === "undo" && method === "POST") {
      const { used, imageRefs } = localUndo(data, id);
      writeData(data);
      await idbDelMany(imageRefs.filter((r) => r.startsWith(REF_PREFIX)).map((r) => r.slice(REF_PREFIX.length)));
      return { used } as T;
    }
    if (action === "reset" && method === "POST") {
      const { imageRefs } = localReset(data, id);
      writeData(data);
      await idbDelMany(imageRefs.filter((r) => r.startsWith(REF_PREFIX)).map((r) => r.slice(REF_PREFIX.length)));
      return null as T;
    }
  }

  throw new Error(`Not available in local mode: ${method} ${path}`);
}

// ------------------------------ uploads ------------------------------

function extOf(file: File): string {
  const m = /\.(jpe?g|png|webp|gif|heic|heif)$/i.exec(file.name || "");
  return m ? `.${m[1].toLowerCase()}` : ".jpg";
}

async function storeBlob(file: File, key: string): Promise<string> {
  await idbPut(key, file);
  return `${REF_PREFIX}${key}`;
}

/** Local replacement for uploadImages(): keeps the pair in IndexedDB. */
export async function localUploadImages(
  view: File,
  thumb?: File,
): Promise<{ url: string; thumbUrl?: string }> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const url = await storeBlob(view, `${id}${extOf(view)}`);
  const thumbUrl = thumb ? await storeBlob(thumb, `thumb-${id}${extOf(thumb)}`) : undefined;
  return { url, thumbUrl };
}

/** Local replacement for uploadFile() (cover images). */
export async function localUploadFile(file: File): Promise<{ url: string }> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { url: await storeBlob(file, `cover-${id}${extOf(file)}`) };
}
