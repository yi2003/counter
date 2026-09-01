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
    rounder: m.rounder === true,
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
  let total = Math.floor(Number(input.total));
  if (!Number.isFinite(total) || total < 1 || total > 1_000_000) {
    throw new Error("Total must be an integer between 1 and 1,000,000");
  }
  if (data.counters.length >= MAX_LOCAL_COUNTERS) {
    throw new Error(`Counter limit reached (max ${MAX_LOCAL_COUNTERS})`);
  }
  let parentId: string | null = null;
  let isRounder = false;
  if (input.parentId) {
    const parent = data.counters.find((c) => c.id === input.parentId);
    if (!parent) throw new Error("Parent counter not found");
    if (parent.rounder) {
      // parent is a round → this is an exercise counter
    } else if (parent.parentId) {
      throw new Error("Exercises cannot contain further counters");
    } else {
      // parent is a top counter → this is a round (rounder group)
      isRounder = true;
      total = 1; // rounds have no count of their own
    }
    parentId = parent.id;
  }
  const id = genId();
  const meta: CounterMeta = {
    name,
    total,
    coverImage: null,
    id,
    createdAt: new Date().toISOString(),
    parentId,
    ...(isRounder ? { rounder: true } : {}),
  };
  data.counters.push(meta);
  data.used[id] = 0;
  data.history[id] = [];
  return { id };
}

/**
 * One-time shape migration for local data: exercises attached directly to a
 * counter are wrapped into a "Round 1" group. Returns true when changed.
 */
export function localMigrateRounds(data: LocalData, counterId: string): boolean {
  if (!data.counters.some((c) => c.id === counterId)) return false;
  const direct = data.counters.filter(
    (c) => c.parentId === counterId && c.rounder !== true,
  );
  if (direct.length === 0) return false;
  const rounderId = genId();
  data.counters.push({
    id: rounderId,
    name: "Round 1",
    total: direct.length,
    coverImage: null,
    createdAt: new Date().toISOString(),
    parentId: counterId,
    rounder: true,
  });
  data.used[rounderId] = 0;
  data.history[rounderId] = [];
  for (const s of direct) s.parentId = rounderId;
  return true;
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

/** Collects cascade ids: the counter, its rounds, and all their exercises. */
export function localCascadeIds(data: LocalData, id: string): string[] {
  const children = data.counters.filter((c) => c.parentId === id).map((c) => c.id);
  const childSet = new Set(children);
  const grandchildren = data.counters
    .filter((c) => c.parentId && childSet.has(c.parentId))
    .map((c) => c.id);
  return [id, ...children, ...grandchildren];
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

/** Local duplicate of a counter — and everything below it — zeroed, name + " (copy)". */
export function localDuplicateCounter(data: LocalData, id: string): { id: string } {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) throw new Error("Counter not found");
  const isRounder = meta.rounder === true;
  const childRounders = isRounder ? [] : data.counters.filter((c) => c.parentId === id && c.rounder === true);
  const directChildren = data.counters.filter((c) => c.parentId === id && c.rounder !== true);
  const childIds = new Set([...childRounders, ...directChildren].map((c) => c.id));
  const grandchildren = data.counters.filter(
    (c) => c.parentId && childIds.has(c.parentId) && c.parentId !== id,
  );
  if (
    data.counters.length + 1 + childRounders.length + directChildren.length + grandchildren.length >
    MAX_LOCAL_COUNTERS
  ) {
    throw new Error(`Counter limit reached (max ${MAX_LOCAL_COUNTERS})`);
  }
  const now = new Date().toISOString();
  const newId = genId();
  const idMap = new Map<string, string>([[id, newId]]);
  data.counters.push({
    ...meta,
    id: newId,
    name: `${meta.name} (copy)`,
    coverImage: null,
    createdAt: now,
  });
  data.used[newId] = 0;
  data.history[newId] = [];
  for (const r of childRounders) {
    const rid = genId();
    idMap.set(r.id, rid);
    data.counters.push({ ...r, id: rid, parentId: newId, coverImage: null, createdAt: now });
    data.used[rid] = 0;
    data.history[rid] = [];
  }
  for (const c of directChildren) {
    const cid = genId();
    idMap.set(c.id, cid);
    data.counters.push({
      ...c,
      id: cid,
      parentId: idMap.get(c.parentId!) ?? newId,
      coverImage: null,
      createdAt: now,
    });
    data.used[cid] = 0;
    data.history[cid] = [];
  }
  for (const g of grandchildren) {
    const gid = genId();
    data.counters.push({
      ...g,
      id: gid,
      parentId: idMap.get(g.parentId!) ?? newId,
      coverImage: null,
      createdAt: now,
    });
    data.used[gid] = 0;
    data.history[gid] = [];
  }
  return { id: newId };
}

export function localCheckin(
  data: LocalData,
  id: string,
  input: { note?: string | null; image?: string | null; thumb?: string | null },
): {
  used: number;
  record: CheckinRecord | null;
  subUpdates: { id: string; used: number }[];
  skipped: string[];
  parentUpdate?: { id: string; used: number };
} {
  const meta = data.counters.find((c) => c.id === id);
  if (!meta) throw new Error("Counter not found");
  const isRounder = meta.rounder === true;

  let used = data.used[id] ?? 0;
  if (!isRounder && used >= meta.total) throw new Error("Target already reached");

  // A round check-in has no record of its own — it just +1s its exercises.
  let record: CheckinRecord | null = null;
  if (!isRounder) {
    record = {
      id: genId(),
      timestamp: new Date().toISOString(),
      note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : null,
      image: input.image ?? null,
      thumb: input.thumb ?? null,
    };
    used += 1;
    data.used[id] = used;
    data.history[id] = [record, ...(data.history[id] ?? [])];
  }

  // GROUP SEMANTICS (rounds): checking in a round adds +1 to every exercise
  // inside it (skipping exercises already at their target).
  const subUpdates: { id: string; used: number }[] = [];
  const skipped: string[] = [];
  for (const child of data.counters.filter((c) => c.parentId === id && c.rounder !== true)) {
    const childUsed = data.used[child.id] ?? 0;
    if (childUsed >= child.total) {
      skipped.push(child.name);
      continue;
    }
    data.used[child.id] = childUsed + 1;
    data.history[child.id] = [
      {
        id: genId(),
        timestamp: record?.timestamp ?? new Date().toISOString(),
        note: null,
        image: null,
        thumb: null,
        origin: record?.id,
      },
      ...(data.history[child.id] ?? []),
    ];
    subUpdates.push({ id: child.id, used: data.used[child.id] });
  }

  // PARENT AUTO-ROUND: resolve which (round → counter) pair this check-in may
  // complete. When EVERY exercise of the round has reached its target and the
  // counter hasn't counted this round yet (origin marker), the counter +1s.
  let round: CounterMeta | undefined;
  let counter: CounterMeta | undefined;
  if (meta.rounder) {
    round = meta;
    counter = data.counters.find((c) => c.id === meta.parentId);
  } else if (meta.parentId) {
    const r = data.counters.find((c) => c.id === meta.parentId);
    if (r?.rounder) {
      round = r;
      counter = data.counters.find((c) => c.id === r.parentId);
    }
  }

  let parentUpdate: { id: string; used: number } | undefined;
  if (round && counter) {
    const exercises = data.counters.filter((c) => c.parentId === round!.id && c.rounder !== true);
    const allDone = exercises.length > 0 && exercises.every((s) => (data.used[s.id] ?? 0) >= s.total);
    if (allDone) {
      const counterUsed = data.used[counter.id] ?? 0;
      if (counterUsed < counter.total) {
        const marker = `round:${round.id}`;
        if (!(data.history[counter.id] ?? []).some((r) => r.origin === marker)) {
          data.used[counter.id] = counterUsed + 1;
          data.history[counter.id] = [
            {
              id: genId(),
              timestamp: record?.timestamp ?? new Date().toISOString(),
              note: `Auto — ${round.name} completed`,
              image: null,
              thumb: null,
              origin: marker,
            },
            ...(data.history[counter.id] ?? []),
          ];
          parentUpdate = { id: counter.id, used: data.used[counter.id] };
        }
      }
    }
  }
  return { used, record, subUpdates, skipped, parentUpdate };
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

  // GROUP SEMANTICS: undoing a round check-in also removes the auto-records
  // it created in each exercise (matched by origin tag).
  const subUpdates: { id: string; used: number }[] = [];
  for (const child of data.counters.filter(
    (c) => c.parentId === id && c.rounder !== true,
  )) {
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
  // GROUP SEMANTICS: resetting a counter resets every exercise below it
  // (rounds → exercises). Round markers live on the counter's history and
  // are cleared above, so rounds can auto-count again after the reset.
  const subIds: string[] = [];
  const children = data.counters.filter((c) => c.parentId === id);
  const childSet = new Set(children.map((c) => c.id));
  const descendants = data.counters.filter((c) => c.parentId && childSet.has(c.parentId));
  for (const child of [...descendants, ...children]) {
    for (const r of data.history[child.id] ?? []) {
      if (r.image) imageRefs.push(r.image);
      if (r.thumb) imageRefs.push(r.thumb);
    }
    data.history[child.id] = [];
    data.used[child.id] = 0;
    if (child.rounder !== true) subIds.push(child.id);
  }
  return { imageRefs, subIds };
}
