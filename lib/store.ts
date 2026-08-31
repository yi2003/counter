import fs from "fs";
import path from "path";
import { baseDataDir } from "./paths";
import type { CheckinRecord, CounterMeta } from "./types";
import { DEFAULT_PROJECT } from "./types";

/**
 * Storage abstraction: MULTIPLE users, each with MULTIPLE counters.
 * Every method is scoped by `userId` (Google `sub`, or "guest" when auth is off).
 *
 * - "kv":    Vercel KV (Redis). Keys: "counters:<uid>", "used:<uid>:<cid>",
 *            "history:<uid>:<cid>".
 * - "local": JSON file (<dataDir>/store.json), shape:
 *            { users: { [uid]: { metas, counters } }, legacy? }
 *            Legacy v1/v2 data (pre-auth) is claimed by the first scope that
 *            touches it, so existing local/dev data lands under that account.
 *
 * NOTE: pre-auth global KV keys ("counters"/"used:*"/"history:*") are ignored;
 * each account starts fresh (or claims local legacy data in dev).
 */

export interface CounterStore {
  mode: "kv" | "local";
  listMetas(userId: string): Promise<CounterMeta[]>;
  saveMeta(userId: string, meta: CounterMeta): Promise<void>;
  getUsed(userId: string, id: string): Promise<number>;
  setUsed(userId: string, id: string, n: number): Promise<void>;
  incrUsed(userId: string, id: string): Promise<number>;
  decrUsed(userId: string, id: string): Promise<number>;
  pushHistory(userId: string, id: string, r: CheckinRecord): Promise<void>;
  popHistory(userId: string, id: string): Promise<CheckinRecord | null>;
  getHistory(userId: string, id: string): Promise<CheckinRecord[]>;
  clearHistory(userId: string, id: string): Promise<void>;
  /** Deletes the counter's meta entry plus its used/history data. */
  destroyCounter(userId: string, id: string): Promise<void>;
}

let storePromise: Promise<CounterStore> | null = null;

export function getStore(): Promise<CounterStore> {
  if (!storePromise) storePromise = createStore();
  return storePromise;
}

export function newCounterId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function seedMetas(): CounterMeta[] {
  return [{ ...DEFAULT_PROJECT, id: "default", createdAt: new Date().toISOString() }];
}

/* ------------------------------- KV store -------------------------------- */

const metasKey = (uid: string) => `counters:${uid}`;
const usedKey = (uid: string, cid: string) => `used:${uid}:${cid}`;
const historyKey = (uid: string, cid: string) => `history:${uid}:${cid}`;

type KvClient = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<unknown>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  lpush(key: string, ...values: unknown[]): Promise<number>;
  lpop<T = unknown>(key: string): Promise<T | null>;
  lrange<T = unknown>(key: string, start: number, stop: number): Promise<T[]>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number | boolean>;
};

function createKvStore(kv: KvClient): CounterStore {
  // Lazily seed a fresh scope for a first-time user.
  const ensureScope = async (uid: string) => {
    if (!(await kv.exists(metasKey(uid)))) {
      await kv.set(metasKey(uid), seedMetas());
    }
  };

  return {
    mode: "kv",
    async listMetas(uid) {
      await ensureScope(uid);
      return (await kv.get<CounterMeta[]>(metasKey(uid))) ?? [];
    },
    async saveMeta(uid, meta) {
      const metas = (await kv.get<CounterMeta[]>(metasKey(uid))) ?? [];
      const i = metas.findIndex((m) => m.id === meta.id);
      if (i >= 0) metas[i] = meta;
      else metas.push(meta);
      await kv.set(metasKey(uid), metas);
    },
    async getUsed(uid, cid) {
      const v = await kv.get<number>(usedKey(uid, cid));
      return typeof v === "number" ? v : 0;
    },
    async setUsed(uid, cid, n) {
      await kv.set(usedKey(uid, cid), n);
    },
    async incrUsed(uid, cid) {
      return await kv.incr(usedKey(uid, cid));
    },
    async decrUsed(uid, cid) {
      return await kv.decr(usedKey(uid, cid));
    },
    async pushHistory(uid, cid, r) {
      await kv.lpush(historyKey(uid, cid), r);
    },
    async popHistory(uid, cid) {
      return (await kv.lpop<CheckinRecord>(historyKey(uid, cid))) ?? null;
    },
    async getHistory(uid, cid) {
      return await kv.lrange<CheckinRecord>(historyKey(uid, cid), 0, -1);
    },
    async clearHistory(uid, cid) {
      await kv.del(historyKey(uid, cid));
    },
    async destroyCounter(uid, cid) {
      const metas = (await kv.get<CounterMeta[]>(metasKey(uid))) ?? [];
      await kv.set(metasKey(uid), metas.filter((m) => m.id !== cid));
      await kv.del(usedKey(uid, cid), historyKey(uid, cid));
    },
  };
}

/* ------------------------------ Local store ------------------------------ */

interface LocalCounter {
  used: number;
  history: CheckinRecord[];
}

interface LocalScope {
  metas: CounterMeta[];
  counters: Record<string, LocalCounter>;
}

interface LocalData {
  users: Record<string, LocalScope>;
  /** Pre-auth v1/v2 data, claimed by the first user scope that accesses it. */
  legacy: LocalScope | null;
}

const DATA_DIR = baseDataDir();
const DATA_FILE = path.join(DATA_DIR, "store.json");

function readLocal(): LocalData {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Partial<LocalData> & {
      project?: { name: string; total: number; coverImage: string | null };
      used?: number;
      history?: CheckinRecord[];
      metas?: CounterMeta[];
      counters?: Record<string, LocalCounter>;
    };
    if (raw && raw.users) {
      return { users: raw.users, legacy: raw.legacy ?? null };
    }
    // Older single-user formats → kept as "legacy", claimed on first access.
    let legacy: LocalScope | null = null;
    if (Array.isArray(raw.metas) && raw.counters) {
      legacy = { metas: raw.metas, counters: raw.counters };
    } else if (raw.project) {
      legacy = {
        metas: [{ ...raw.project, id: "default", createdAt: new Date().toISOString() }],
        counters: {
          default: {
            used: typeof raw.used === "number" ? raw.used : 0,
            history: Array.isArray(raw.history) ? raw.history : [],
          },
        },
      };
    }
    const data: LocalData = { users: {}, legacy };
    writeLocal(data);
    return data;
  } catch {
    const data: LocalData = { users: {}, legacy: null };
    writeLocal(data);
    return data;
  }
}

function writeLocal(d: LocalData): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
}

/** Gets (creating on demand) a user's scope; claims legacy data if present. */
function scopeOf(d: LocalData, uid: string): LocalScope {
  if (!d.users[uid]) {
    if (d.legacy) {
      d.users[uid] = d.legacy;
      d.legacy = null;
    } else {
      d.users[uid] = {
        metas: seedMetas(),
        counters: { default: { used: 0, history: [] } },
      };
    }
  }
  return d.users[uid];
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
    async listMetas(uid) {
      const d = readLocal();
      return scopeOf(d, uid).metas; // may claim legacy / seed (sync write)
    },
    async saveMeta(uid, meta) {
      await serialized(() => {
        const d = readLocal();
        const s = scopeOf(d, uid);
        const i = s.metas.findIndex((m) => m.id === meta.id);
        if (i >= 0) s.metas[i] = meta;
        else s.metas.push(meta);
        if (!s.counters[meta.id]) s.counters[meta.id] = { used: 0, history: [] };
        writeLocal(d);
      });
    },
    async getUsed(uid, cid) {
      return readLocal().users[uid]?.counters[cid]?.used ?? 0;
    },
    async setUsed(uid, cid, n) {
      await serialized(() => {
        const d = readLocal();
        const s = scopeOf(d, uid);
        (s.counters[cid] ??= { used: 0, history: [] }).used = n;
        writeLocal(d);
      });
    },
    async incrUsed(uid, cid) {
      return serialized(() => {
        const d = readLocal();
        const s = scopeOf(d, uid);
        const c = (s.counters[cid] ??= { used: 0, history: [] });
        c.used += 1;
        writeLocal(d);
        return c.used;
      });
    },
    async decrUsed(uid, cid) {
      return serialized(() => {
        const d = readLocal();
        const s = scopeOf(d, uid);
        const c = (s.counters[cid] ??= { used: 0, history: [] });
        c.used = Math.max(0, c.used - 1);
        writeLocal(d);
        return c.used;
      });
    },
    async pushHistory(uid, cid, r) {
      await serialized(() => {
        const d = readLocal();
        const s = scopeOf(d, uid);
        (s.counters[cid] ??= { used: 0, history: [] }).history.unshift(r); // newest first
        writeLocal(d);
      });
    },
    async popHistory(uid, cid) {
      return serialized(() => {
        const d = readLocal();
        const c = d.users[uid]?.counters[cid];
        const popped = c?.history.shift() ?? null;
        if (popped) writeLocal(d);
        return popped;
      });
    },
    async getHistory(uid, cid) {
      return readLocal().users[uid]?.counters[cid]?.history ?? [];
    },
    async clearHistory(uid, cid) {
      await serialized(() => {
        const d = readLocal();
        const c = d.users[uid]?.counters[cid];
        if (c) {
          c.history = [];
          writeLocal(d);
        }
      });
    },
    async destroyCounter(uid, cid) {
      await serialized(() => {
        const d = readLocal();
        const s = d.users[uid];
        if (!s) return;
        s.metas = s.metas.filter((m) => m.id !== cid);
        delete s.counters[cid];
        writeLocal(d);
      });
    },
  };
}

/**
 * Finds Redis REST credentials in the environment.
 * Standard names first (KV_REST_API_URL / KV_REST_API_TOKEN); falls back to
 * the prefixed names Vercel's Upstash integration injects per store, e.g.
 * "cc_KV_REST_API_URL" + "cc_KV_REST_API_TOKEN".
 */
function kvCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) return { url, token };

  const keys = Object.keys(process.env).sort();
  for (const key of keys) {
    if (!key.endsWith("_KV_REST_API_URL")) continue;
    const prefix = key.slice(0, -"_KV_REST_API_URL".length);
    const pairUrl = process.env[key];
    const pairToken = process.env[`${prefix}_KV_REST_API_TOKEN`];
    if (pairUrl && pairToken) return { url: pairUrl, token: pairToken };
  }
  return null;
}

async function createStore(): Promise<CounterStore> {
  const creds = kvCredentials();
  if (creds) {
    try {
      const { createClient } = await import("@vercel/kv");
      const kv = createClient(creds) as unknown as KvClient;
      return createKvStore(kv);
    } catch (err) {
      console.warn("[store] Failed to init Vercel KV, falling back to local store:", err);
    }
  }
  return createLocalStore();
}
