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

export default function Home({ user }: { user: SessionUser }) {
  const [counters, setCounters] = useState<CounterSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api<{ counters: CounterSummary[] }>("/api/counters");
      setCounters(res.counters.filter((c) => !c.parentId)); // top-level only
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

      {user.sub === "guest" && (
        <div className="banner banner-warning">
          🔒 Public mode — anyone with this link can view and edit. Configure Google sign-in to
          lock this app to your account.
        </div>
      )}

      <section className="counter-grid">
        {counters.map((c) => (
          <CounterCard key={c.id} counter={c} />
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
      </footer>

      {showNew && (
        <NewCounterModal busy={busy} onClose={() => setShowNew(false)} onCreate={handleCreate} />
      )}
      <ToastHost toasts={toasts} dismiss={dismiss} />
    </main>
  );
}
