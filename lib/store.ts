import fs from "fs";
import path from "path";
import { baseDataDir } from "./paths";
import type { CheckinRecord, CounterMeta } from "./types";
import { DEFAULT_PROJECT } from "./types";

/**
 * Storage abstraction for MULTIPLE counters.
 * - "kv":    Vercel KV (Redis) — cloud sync across devices (production).
 *            Keys: "counters" (JSON array of CounterMeta), "used:<id>", "history:<id>".
 * - "local": JSON file under .data/ — dev fallback when KV env vars are absent.
 *
 * Legacy single-counter data (old keys "project" / "used" / "history") is
 * migrated once, automatically, into a counter with id "default".
 */

export interface CounterStore {
  mode: "kv" | "local";
  listMetas(): Promise<CounterMeta[]>;
  saveMeta(meta: CounterMeta): Promise<void>;
  getUsed(id: string): Promise<number>;
  setUsed(id: string, n: number): Promise<void>;
  incrUsed(id: string): Promise<number>;
  decrUsed(id: string): Promise<number>;
  pushHistory(id: string, r: CheckinRecord): Promise<void>;
  popHistory(id: string): Promise<CheckinRecord | null>;
  getHistory(id: string): Promise<CheckinRecord[]>;
  clearHistory(id: string): Promise<void>;
  /** Deletes the counter's meta entry plus its used/history data. */
  destroyCounter(id: string): Promise<void>;
}

let storePromise: Promise<CounterStore> | null = null;

export function getStore(): Promise<CounterStore> {
  if (!storePromise) storePromise = createStore();
  return storePromise;
}

export function newCounterId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------------- KV store -------------------------------- */

const METAS_KEY = "counters";
const usedKey = (id: string) => `used:${id}`;
const historyKey = (id: string) => `history:${id}`;

type KvClient = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  lpush(key: string, ...values: unknown[]): Promise<number>;
  rpush(key: string, ...values: unknown[]): Promise<number>;
  lpop<T = unknown>(key: string): Promise<T | null>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number | boolean>;
};

async function migrateKv(kv: KvClient): Promise<void> {
  if (await kv.exists(METAS_KEY)) return;

  const legacyProject = await kv.get<ProjectConfigLike>("project");
  const now = new Date().toISOString();
  if (legacyProject) {
    // Move legacy single-counter data into counter id "default".
    const meta: CounterMeta = { ...legacyProject, id: "default", createdAt: now };
    const legacyUsed = await kv.get<number>("used");
    const legacyHistory = await kv.lrange<CheckinRecord>("history", 0, -1);
    await kv.set(METAS_KEY, [meta]);
    await kv.set(usedKey("default"), typeof legacyUsed === "number" ? legacyUsed : 0);
    // legacyHistory is newest-first; rpush oldest-first to keep that order.
    for (let i = legacyHistory.length - 1; i >= 0; i--) {
      await kv.rpush(historyKey("default"), legacyHistory[i]);
    }
    await kv.del("project", "used", "history").catch(() => {});
  } else {
    // Fresh store: seed one default counter.
    await kv.set(METAS_KEY, [{ ...DEFAULT_PROJECT, id: "default", createdAt: now }]);
  }
}

type ProjectConfigLike = { name: string; total: number; coverImage: string | null };

function createKvStore(kv: KvClient): CounterStore {
  return {
    mode: "kv",
    async listMetas() {
      await migrateKv(kv);
      return (await kv.get<CounterMeta[]>(METAS_KEY)) ?? [];
    },
    async saveMeta(meta) {
      const metas = (await kv.get<CounterMeta[]>(METAS_KEY)) ?? [];
      const i = metas.findIndex((m) => m.id === meta.id);
      if (i >= 0) metas[i] = meta;
      else metas.push(meta);
      await kv.set(METAS_KEY, metas);
    },
    async getUsed(id) {
      const v = await kv.get<number>(usedKey(id));
      return typeof v === "number" ? v : 0;
    },
    async setUsed(id, n) {
      await kv.set(usedKey(id), n);
    },
    async incrUsed(id) {
      return await kv.incr(usedKey(id));
    },
    async decrUsed(id) {
      return await kv.decr(usedKey(id));
    },
    async pushHistory(id, r) {
      await kv.lpush(historyKey(id), r);
    },
    async popHistory(id) {
      return (await kv.lpop<CheckinRecord>(historyKey(id))) ?? null;
    },
    async getHistory(id) {
      return await kv.lrange<CheckinRecord>(historyKey(id), 0, -1);
    },
    async clearHistory(id) {
      await kv.del(historyKey(id));
    },
    async destroyCounter(id) {
      const metas = (await kv.get<CounterMeta[]>(METAS_KEY)) ?? [];
      await kv.set(METAS_KEY, metas.filter((m) => m.id !== id));
      await kv.del(usedKey(id), historyKey(id));
    },
  };
}

/* ------------------------------ Local store ------------------------------ */

interface LocalCounter {
  used: number;
  history: CheckinRecord[];
}

interface LocalData {
  metas: CounterMeta[];
  counters: Record<string, LocalCounter>;
}

const DATA_DIR = baseDataDir();
const DATA_FILE = path.join(DATA_DIR, "store.json");

function seedLocal(): LocalData {
  const meta: CounterMeta = { ...DEFAULT_PROJECT, id: "default", createdAt: new Date().toISOString() };
  return { metas: [meta], counters: { default: { used: 0, history: [] } } };
}

function readLocal(): LocalData {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Partial<LocalData> & {
      project?: ProjectConfigLike;
      used?: number;
      history?: CheckinRecord[];
    };
    if (Array.isArray(raw.metas) && raw.counters) {
      return { metas: raw.metas, counters: raw.counters };
    }
    // Migrate legacy single-counter file (keys: project / used / history).
    const data: LocalData =
      raw.project
        ? {
            metas: [{ ...raw.project, id: "default", createdAt: new Date().toISOString() }],
            counters: {
              default: {
                used: typeof raw.used === "number" ? raw.used : 0,
                history: Array.isArray(raw.history) ? raw.history : [],
              },
            },
          }
        : seedLocal();
    writeLocal(data);
    return data;
  } catch {
    // Fresh (or unreadable) file — seed one default counter.
    const data = seedLocal();
    writeLocal(data);
    return data;
  }
}

function writeLocal(d: LocalData): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

// Serialize mutations to avoid read-modify-write races within one process.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T> | T): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

function createLocalStore(): CounterStore {
  return {
    mode: "local",
    async listMetas() {
      return readLocal().metas;
    },
    async saveMeta(meta) {
      await serialized(() => {
        const d = readLocal();
        const i = d.metas.findIndex((m) => m.id === meta.id);
        if (i >= 0) d.metas[i] = meta;
        else d.metas.push(meta);
        if (!d.counters[meta.id]) d.counters[meta.id] = { used: 0, history: [] };
        writeLocal(d);
      });
    },
    async getUsed(id) {
      return readLocal().counters[id]?.used ?? 0;
    },
    async setUsed(id, n) {
      await serialized(() => {
        const d = readLocal();
        const c = (d.counters[id] ??= { used: 0, history: [] });
        c.used = n;
        writeLocal(d);
      });
    },
    async incrUsed(id) {
      return serialized(() => {
        const d = readLocal();
        const c = (d.counters[id] ??= { used: 0, history: [] });
        c.used += 1;
        writeLocal(d);
        return c.used;
      });
    },
    async decrUsed(id) {
      return serialized(() => {
        const d = readLocal();
        const c = (d.counters[id] ??= { used: 0, history: [] });
        c.used = Math.max(0, c.used - 1);
        writeLocal(d);
        return c.used;
      });
    },
    async pushHistory(id, r) {
      await serialized(() => {
        const d = readLocal();
        const c = (d.counters[id] ??= { used: 0, history: [] });
        c.history.unshift(r); // newest first
        writeLocal(d);
      });
    },
    async popHistory(id) {
      return serialized(() => {
        const d = readLocal();
        const c = d.counters[id];
        const popped = c?.history.shift() ?? null;
        if (popped) writeLocal(d);
        return popped;
      });
    },
    async getHistory(id) {
      return readLocal().counters[id]?.history ?? [];
    },
    async clearHistory(id) {
      await serialized(() => {
        const d = readLocal();
        const c = d.counters[id];
        if (c) {
          c.history = [];
          writeLocal(d);
        }
      });
    },
    async destroyCounter(id) {
      await serialized(() => {
        const d = readLocal();
        d.metas = d.metas.filter((m) => m.id !== id);
        delete d.counters[id];
        writeLocal(d);
      });
    },
  };
}

async function createStore(): Promise<CounterStore> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    try {
      const { createClient } = await import("@vercel/kv");
      const kv = createClient({ url, token }) as unknown as KvClient;
      return createKvStore(kv);
    } catch (err) {
      console.warn("[store] Failed to init Vercel KV, falling back to local store:", err);
    }
  }
  return createLocalStore();
}
