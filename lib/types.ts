export interface ProjectConfig {
  name: string;
  total: number;
  coverImage: string | null;
}

/** A counter's config plus its stable id (one entry in the "counters" index). */
export interface CounterMeta extends ProjectConfig {
  id: string;
  createdAt: string;
  /** Set when this is a sub-counter of another counter (one level max). */
  parentId?: string | null;
}

/** Card-level summary for the home screen / sub-counter lists. */
export interface CounterSummary {
  id: string;
  name: string;
  total: number;
  coverImage: string | null;
  used: number;
  createdAt: string;
  parentId?: string | null;
}

export interface CheckinRecord {
  id: string;
  timestamp: string; // ISO datetime
  note: string | null;
  image: string | null; // view image URL (≤800px, Vercel Blob or local dev path)
  thumb?: string | null; // small thumbnail URL (≤240px) for the history list
}

export interface AppState {
  project: CounterMeta;
  used: number;
  history: CheckinRecord[]; // newest first
  storage: "kv" | "local";
}

export interface SessionUser {
  sub: string; // stable Google account id (or "guest" when auth is off)
  name: string;
  email: string | null;
  picture: string | null;
}

export const DEFAULT_PROJECT: ProjectConfig = {
  name: "My Counter",
  total: 60,
  coverImage: null,
};
