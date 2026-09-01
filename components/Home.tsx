"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CounterSummary, SessionUser } from "@/lib/types";
import { api, errMsg } from "@/lib/client";
import CounterCard from "@/components/CounterCard";
import NewCounterModal from "@/components/NewCounterModal";
import ToastHost, { useToasts } from "@/components/ToastHost";
import UserChip from "@/components/UserChip";
import { IconPlus } from "@/components/icons";

export default function Home({
  user,
  localMode = false,
}: {
  user: SessionUser;
  localMode?: boolean;
}) {
  const [counters, setCounters] = useState<CounterSummary[] | null>(null);
  const [storage, setStorage] = useState<"kv" | "local" | null>(null);
  const [blob, setBlob] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api<{ counters: CounterSummary[]; storage: "kv" | "local"; blob: boolean }>(
        "/api/counters",
      );
      setCounters(res.counters.filter((c) => !c.parentId)); // top-level only
      setStorage(res.storage);
      setBlob(res.blob);
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(name: string, total: number) {
    setBusy(true);
    try {
      const res = await api<{ counters: CounterSummary[]; id: string }>("/api/counters", {
        method: "POST",
        body: JSON.stringify({ name, total }),
      });
      setShowNew(false);
      router.push(`/c/${res.id}`);
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate(id: string) {
    try {
      const res = await api<{ counters: CounterSummary[] }>(
        `/api/counters/${encodeURIComponent(id)}/duplicate`,
        { method: "POST" },
      );
      setCounters(res.counters.filter((c) => !c.parentId)); // top-level only
      push("Duplicated — open it to rename ✨");
    } catch (e) {
      push(errMsg(e), "error");
    }
  }

  if (!counters) {
    return (
      <main className="container center-screen">
        {loadError ? (
          <div className="card error-card">
            <p>⚠️ {loadError}</p>
            <button className="btn btn-primary" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div className="loading-block">
            <span className="spinner spinner-dark" />
            <p>Loading…</p>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="container">
      <header className="topbar">
        <div>
          <h1 className="app-title">My Counters</h1>
          <p className="app-subtitle">Universal check-in counter — tap one to start</p>
        </div>
        <div className="topbar-actions">
          <UserChip user={user} />
          <button
            className="icon-btn"
            aria-label="New counter"
            title="New counter"
            onClick={() => setShowNew(true)}
          >
            <IconPlus />
          </button>
        </div>
      </header>

      {localMode && (
        <div className="banner banner-info">
          📁 <strong>Local mode</strong> — counters are stored in this browser only and never sent
          to a server. Clearing the browser's site data erases them. Use “Sign in to sync” in the
          top bar to switch to a synced account.
        </div>
      )}

      {!localMode && user.sub === "guest" && (
        <div className="banner banner-warning">
          🔒 Public mode — anyone with this link can view and edit. Configure Google sign-in to
          lock this app to your account.
        </div>
      )}

      {!localMode && storage === "local" && (
        <div className="banner banner-danger">
          ⚠️ <strong>Your data is not persistent.</strong> No database is connected, so everything
          (including history) is wiped on every redeploy. Fix: Vercel dashboard → your project →{" "}
          <strong>Storage → Create Database → Upstash Redis</strong> → connect it → redeploy. The
          footer will switch to “☁️ Cloud sync enabled”.
        </div>
      )}

      {!localMode && storage === "kv" && !blob && (
        <div className="banner banner-warning">
          🖼️ Counters and history are persistent now, but <strong>images are not</strong> — no Blob
          store is connected. Vercel dashboard → <strong>Storage → Create Database → Blob</strong>{" "}
          → connect it to keep photo proof.
        </div>
      )}

      <section className="counter-grid">
        {counters.map((c) => (
          <CounterCard key={c.id} counter={c} onDuplicate={(id) => void handleDuplicate(id)} />
        ))}
        <button className="counter-card new-card" onClick={() => setShowNew(true)}>
          + New counter
          <span className="new-card-hint">Track anything — meds, reps, water, habits…</span>
        </button>
      </section>

      <footer className="footer">
        {counters.length === 0
          ? "Create your first counter to get started."
          : "Tip: open a counter to add sub-counters, notes and photo proof."}
        {localMode ? (
          <span className="footer-storage">📁 This device only — data stays in this browser</span>
        ) : (
          storage && (
            <span className="footer-storage">
              {storage === "kv"
                ? `☁️ Cloud sync enabled (Vercel KV${blob ? " + Blob" : ""})`
                : "💾 Local dev storage — add KV/Blob env vars to enable cross-device sync"}
            </span>
          )
        )}
      </footer>

      {showNew && (
        <NewCounterModal busy={busy} onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      <ToastHost toasts={toasts} dismiss={dismiss} />
    </main>
  );
}
