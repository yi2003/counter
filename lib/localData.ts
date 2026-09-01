import type { AppState, CheckinRecord, CounterMeta, CounterSummary } from "./types";
import { DEFAULT_PROJECT } from "./types";

/**
 * Pure data operations for LOCAL (this-device-only) mode.
 * Mirrors the server's API semantics exactly — same shapes, same error
 * messages — but runs on a plain JSON object persisted in the browser.
 * No browser APIs here, so it is testable in Node.
 */

export interface LocalData {
  counters: CounterMeta[];
  used: Record<string, number>;
  history: Record<string, CheckinRecord[]>;
}

export const MAX_LOCAL_COUNTERS = 50;

export function newLocalData(): LocalData {
  const data: LocalData = { counters: [], used: {}, history: {} };
  data.counters.push({ ...DEFAULT_PROJECT, id: "default", createdAt: new Date().toISOString() });
  data.used.default = 0;
  data.history.default = [];
  return data;
}

export function loadLocalData(json: string | null | undefined): LocalData {
  if (json) {
    try {
      const parsed = JSON.parse(json) as LocalData;
      if (parsed && Array.isArray(parsed.counters) && parsed.used && parsed.history) {
        return parsed;
      }
    } catch {
      // corrupted → reseed below
    }
  }
  return newLocalData();
}

export function saveLocalData(data: LocalData): string {
  return JSON.stringify(data);
}

export function localListSummaries(data: LocalData): CounterSummary[] {
  return data.counters.map((m) => ({
    id: m.id,
    name: m.name,
    total: m.total,
    coverImage: m.coverImage,
    createdAt: m.createdAt,
    parentId: m.parentId ?? null,
    used: data.used[m.id] ?? 0,
  }));
}

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localCreateCounter(
  data: LocalData,
  input: { name: string; total: number; parentId?: string | null },
): { id: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) throw new Error("Project name cannot be empty");
  const total = Math.floor(Number(input.total));
  if (!Number.isFinite(total) || total < 1 || total > 1_000_000) {
    throw new Error("Total must be an integer between 1 and 1,000,000");
  }
  if (data.counters.length >= MAX_LOCAL_COUNTERS) {
    throw new Error(`Counter limit reached (max ${MAX_LOCAL_COUNTERS})`);
  }
  let parentId: string | null = null;
  if (input.parentId) {
    const parent = data.counters.find((c) => c.id === input.parentId);
    if (!parent) throw new Error("Parent counter not found");
    if (parent.parentId) throw new Error("Sub-counters cannot have their own sub-counters");
    parentId = parent.id;
  }
  const id = genId();
  const meta: CounterMeta = { name, total, coverImage: null, id, createdAt: new Date().toISOString(), parentId };
  data.counters.push(meta);
  data.used[id] = 0;
  data.history[id] = [];
  return { id };
}

export function localGetCounter(data: LocalData, id: string): AppState | null {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) return null;
  return {
    project: meta,
    used: data.used[id] ?? 0,
    history: data.history[id] ?? [],
    storage: "local",
    blob: false,
  };
}

export function localUpdateCounter(
  data: LocalData,
  id: string,
  patch: { name?: string; total?: number; coverImage?: string | null },
): AppState | null {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) return null;
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Project name cannot be empty");
    meta.name = name;
  }
  if (patch.total !== undefined) {
    const total = Math.floor(Number(patch.total));
    if (!Number.isFinite(total) || total < 1 || total > 1_000_000) {
      throw new Error("Total must be an integer between 1 and 1,000,000");
    }
    meta.total = total;
  }
  if (patch.coverImage !== undefined) meta.coverImage = patch.coverImage;
  return localGetCounter(data, id);
}

/** Collects cascade ids: the counter itself plus its direct sub-counters. */
export function localCascadeIds(data: LocalData, id: string): string[] {
  const subs = data.counters.filter((c) => c.parentId === id).map((c) => c.id);
  return [id, ...subs];
}

/** Image refs (idb:…) referenced by the given counters — for storage cleanup. */
export function localImageRefsFor(data: LocalData, ids: string[]): string[] {
  const refs: string[] = [];
  for (const cid of ids) {
    const meta = data.counters.find((c) => c.id === cid);
    if (meta?.coverImage) refs.push(meta.coverImage);
    for (const r of data.history[cid] ?? []) {
      if (r.image) refs.push(r.image);
      if (r.thumb) refs.push(r.thumb);
    }
  }
  return refs;
}

export function localDeleteCounter(
  data: LocalData,
  id: string,
): { removedIds: string[]; imageRefs: string[] } {
  const removedIds = localCascadeIds(data, id);
  if (!data.counters.some((c) => c.id === id)) return { removedIds: [], imageRefs: [] };
  const imageRefs = localImageRefsFor(data, removedIds);
  data.counters = data.counters.filter((c) => !removedIds.includes(c.id));
  for (const cid of removedIds) {
    delete data.used[cid];
    delete data.history[cid];
  }
  return { removedIds, imageRefs };
}

export function localCheckin(
  data: LocalData,
  id: string,
  input: { note?: string | null; image?: string | null; thumb?: string | null },
): {
  used: number;
  record: CheckinRecord;
  subUpdates: { id: string; used: number }[];
  skipped: string[];
  parentUpdate?: { id: string; used: number };
} {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) throw new Error("Counter not found");
  const used = data.used[id] ?? 0;
  if (used >= meta.total) throw new Error("Target already reached");
  const record: CheckinRecord = {
    id: genId(),
    timestamp: new Date().toISOString(),
    note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : null,
    image: input.image ?? null,
    thumb: input.thumb ?? null,
  };
  data.used[id] = used + 1;
  data.history[id] = [record, ...(data.history[id] ?? [])];

  // GROUP SEMANTICS: one check-in of the parent = one round; every direct
  // sub-counter also gets +1 (skipping subs already at their own target).
  const subUpdates: { id: string; used: number }[] = [];
  const skipped: string[] = [];
  for (const child of data.counters.filter((c) => c.parentId === id)) {
    const childUsed = data.used[child.id] ?? 0;
    if (childUsed >= child.total) {
      skipped.push(child.name);
      continue;
    }
    data.used[child.id] = childUsed + 1;
    data.history[child.id] = [
      {
        id: genId(),
        timestamp: record.timestamp,
        note: null,
        image: null,
        thumb: null,
        origin: record.id,
      },
      ...(data.history[child.id] ?? []),
    ];
    subUpdates.push({ id: child.id, used: data.used[child.id] });
  }

  // PARENT AUTO-ROUND: if this counter belongs to a parent and every
  // sub-counter of that parent has caught up (>= parent.used + 1), the
  // parent completes one round automatically. Direct store mutations —
  // NOT a recursive localCheckin — so subs are not double-counted.
  let parentUpdate: { id: string; used: number } | undefined;
  if (meta.parentId) {
    const parent = data.counters.find((c) => c.id === meta.parentId);
    if (parent) {
      const parentUsed = data.used[parent.id] ?? 0;
      if (parentUsed < parent.total) {
        const siblings = data.counters.filter((c) => c.parentId === parent.id);
        if (siblings.every((s) => (data.used[s.id] ?? 0) >= parentUsed + 1)) {
          data.used[parent.id] = parentUsed + 1;
          data.history[parent.id] = [
            {
              id: genId(),
              timestamp: record.timestamp,
              note: "Auto — all sub-counters completed",
              image: null,
              thumb: null,
            },
            ...(data.history[parent.id] ?? []),
          ];
          parentUpdate = { id: parent.id, used: data.used[parent.id] };
        }
      }
    }
  }
  return { used: data.used[id], record, subUpdates, skipped, parentUpdate };
}

export function localUndo(
  data: LocalData,
  id: string,
): { used: number; imageRefs: string[]; subUpdates: { id: string; used: number }[] } {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) throw new Error("Counter not found");
  const history = data.history[id] ?? [];
  if (history.length === 0) throw new Error("Nothing to undo");
  const removed = history[0];
  const imageRefs: string[] = [];
  if (removed.image) imageRefs.push(removed.image);
  if (removed.thumb) imageRefs.push(removed.thumb);
  data.history[id] = history.slice(1);
  data.used[id] = Math.max(0, (data.used[id] ?? 1) - 1);

  // GROUP SEMANTICS: undoing a round also removes the auto-records it
  // created in each sub-counter (matched by origin tag).
  const subUpdates: { id: string; used: number }[] = [];
  for (const child of data.counters.filter((c) => c.parentId === id)) {
    const childHistory = data.history[child.id] ?? [];
    const idx = childHistory.findIndex((r) => r.origin === removed.id);
    if (idx === -1) continue;
    data.history[child.id] = childHistory.filter((_, i) => i !== idx);
    data.used[child.id] = Math.max(0, (data.used[child.id] ?? 1) - 1);
    subUpdates.push({ id: child.id, used: data.used[child.id] });
  }
  return { used: data.used[id], imageRefs, subUpdates };
}

export function localReset(
  data: LocalData,
  id: string,
): { imageRefs: string[]; subIds: string[] } {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) throw new Error("Counter not found");
  const imageRefs: string[] = [];
  for (const r of data.history[id] ?? []) {
    if (r.image) imageRefs.push(r.image);
    if (r.thumb) imageRefs.push(r.thumb);
  }
  data.history[id] = [];
  data.used[id] = 0;
  // GROUP SEMANTICS: resetting a counter resets its sub-counters too.
  const subIds: string[] = [];
  for (const child of data.counters.filter((c) => c.parentId === id)) {
    for (const r of data.history[child.id] ?? []) {
      if (r.image) imageRefs.push(r.image);
      if (r.thumb) imageRefs.push(r.thumb);
    }
    data.history[child.id] = [];
    data.used[child.id] = 0;
    subIds.push(child.id);
  }
  return { imageRefs, subIds };
}
