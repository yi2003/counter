"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AppState, CheckinRecord, CounterSummary, SessionUser } from "@/lib/types";
import { api, errMsg, uploadImages } from "@/lib/client";
import type { PreparedImages } from "@/lib/image";
import ProgressRing from "@/components/ProgressRing";
import CheckinModal from "@/components/CheckinModal";
import SettingsModal from "@/components/SettingsModal";
import ConfirmDialog from "@/components/ConfirmDialog";
import HistoryList from "@/components/HistoryList";
import Lightbox from "@/components/Lightbox";
import SubCounterCard from "@/components/SubCounterCard";
import NewCounterModal from "@/components/NewCounterModal";
import ToastHost, { useToasts } from "@/components/ToastHost";
import UserChip from "@/components/UserChip";
import { IconBack, IconGear } from "@/components/icons";

type Busy = "checkin" | "undo" | "reset" | "config" | "delete" | "newsub" | null;

const enc = encodeURIComponent;

export default function CounterDetail({ id, user }: { id: string; user: SessionUser }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [subs, setSubs] = useState<CounterSummary[]>([]);
  const [parent, setParent] = useState<CounterSummary | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewSub, setShowNewSub] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [bounce, setBounce] = useState(false);
  const { toasts, push, dismiss } = useToasts();
  const router = useRouter();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, list] = await Promise.all([
        api<AppState>(`/api/counters/${enc(id)}`),
        api<{ counters: CounterSummary[] }>("/api/counters"),
      ]);
      setState(s);
      setSubs(list.counters.filter((c) => c.parentId === id));
      setParent(
        s.project.parentId
          ? (list.counters.find((c) => c.id === s.project.parentId) ?? null)
          : null,
      );
    } catch (e) {
      setLoadError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCheckin(note: string, images: PreparedImages | null) {
    setBusy("checkin");
    try {
      let image: string | undefined;
      let thumb: string | undefined;
      if (images) {
        const up = await uploadImages(images.view, images.thumb);
        image = up.url;
        thumb = up.thumbUrl;
      }
      const res = await api<{ used: number; record: CheckinRecord }>(
        `/api/counters/${enc(id)}/checkin`,
        { method: "POST", body: JSON.stringify({ note, image, thumb }) },
      );
      setState((s) => (s ? { ...s, used: res.used, history: [res.record, ...s.history] } : s));
      setShowCheckin(false);
      setBounce(true);
      setTimeout(() => setBounce(false), 700);
      push("Checked in successfully 🎉");
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleUndo() {
    setBusy("undo");
    try {
      const res = await api<{ used: number }>(`/api/counters/${enc(id)}/undo`, { method: "POST" });
      setState((s) => (s ? { ...s, used: res.used, history: s.history.slice(1) } : s));
      push("Last check-in undone", "warning");
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleReset() {
    setBusy("reset");
    try {
      await api(`/api/counters/${enc(id)}/reset`, { method: "POST" });
      setState((s) => (s ? { ...s, used: 0, history: [] } : s));
      setAskReset(false);
      push("Counter has been reset", "warning");
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveConfig(patch: {
    name: string;
    total: number;
    coverImage: string | null;
  }) {
    setBusy("config");
    try {
      const res = await api<AppState>(`/api/counters/${enc(id)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      setState(res);
      setShowSettings(false);
      push("Settings saved");
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    setBusy("delete");
    try {
      await api(`/api/counters/${enc(id)}`, { method: "DELETE" });
      push("Counter deleted", "warning");
      router.push(state?.project.parentId ? `/c/${state.project.parentId}` : "/");
    } catch (e) {
      push(errMsg(e), "error");
      setBusy(null);
    }
  }

  async function handleCreateSub(name: string, total: number) {
    setBusy("newsub");
    try {
      const res = await api<{ counters: CounterSummary[] }>("/api/counters", {
        method: "POST",
        body: JSON.stringify({ name, total, parentId: id }),
      });
      setSubs(res.counters.filter((c) => c.parentId === id));
      setShowNewSub(false);
      push(`Sub-counter “${name}” created`);
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleQuickAdd(sub: CounterSummary) {
    setQuickBusy(sub.id);
    try {
      const res = await api<{ used: number }>(`/api/counters/${enc(sub.id)}/checkin`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSubs((list) => list.map((s) => (s.id === sub.id ? { ...s, used: res.used } : s)));
      push(`+1 ${sub.name}`);
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setQuickBusy(null);
    }
  }

  if (!state) {
    return (
      <main className="container center-screen">
        {loadError ? (
          <div className="card error-card">
            <p>⚠️ {loadError}</p>
            <div className="error-actions">
              <button className="btn btn-ghost" onClick={() => void load()}>
                Retry
              </button>
              <Link className="btn btn-primary" href="/">
                All counters
              </Link>
            </div>
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

  const { project, used, history, storage } = state;
  const remaining = Math.max(0, project.total - used);
  const pct = project.total > 0 ? Math.round((used / project.total) * 100) : 0;
  const reached = used >= project.total;
  const isSub = Boolean(project.parentId);

  return (
    <main className="container">
      <header className="topbar">
        <div className="topbar-left">
          <Link
            className="icon-btn"
            href={parent ? `/c/${parent.id}` : "/"}
            aria-label={parent ? `Back to ${parent.name}` : "Back to all counters"}
            title={parent ? `Back to ${parent.name}` : "Back to all counters"}
          >
            <IconBack />
          </Link>
          <div>
            <h1 className="app-title">{project.name}</h1>
            <p className="app-subtitle">
              {parent ? `Sub-counter of ${parent.name}` : "Universal check-in counter"}
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <UserChip user={user} />
          <button
            className="icon-btn"
            aria-label="Counter settings"
            title="Counter settings"
            onClick={() => setShowSettings(true)}
          >
            <IconGear />
          </button>
        </div>
      </header>

      {project.coverImage && (
        <div className="cover">
          <img src={project.coverImage} alt={`${project.name} cover`} />
        </div>
      )}

      {storage === "local" && (
        <div className="banner banner-danger">
          ⚠️ <strong>Data is not persistent here.</strong> Connect Vercel KV (dashboard → Storage →
          Upstash Redis) so history survives redeploys and syncs to your other devices.
        </div>
      )}

      <section className="card main-card">
        <ProgressRing used={used} total={project.total} bounce={bounce} />

        <div className="stats">
          <div className="stat">
            <span className="stat-value">{used}</span>
            <span className="stat-label">Used</span>
          </div>
          <div className="stat">
            <span className="stat-value">{remaining}</span>
            <span className="stat-label">Remaining</span>
          </div>
          <div className="stat">
            <span className="stat-value">{pct}%</span>
            <span className="stat-label">Progress</span>
          </div>
        </div>

        <div className="actions">
          <button
            className="btn btn-ghost"
            onClick={() => void handleUndo()}
            disabled={busy !== null || history.length === 0}
            title="Undo the last check-in"
          >
            {busy === "undo" ? <span className="spinner spinner-dark" /> : "− Undo"}
          </button>
          <button
            className="btn btn-primary btn-checkin"
            onClick={() => setShowCheckin(true)}
            disabled={busy !== null || reached}
            title={reached ? "Target reached" : "Record a check-in"}
          >
            {busy === "checkin" ? <span className="spinner" /> : "+ Check-in"}
          </button>
          <button
            className="btn btn-ghost danger-text"
            onClick={() => setAskReset(true)}
            disabled={busy !== null || history.length === 0}
            title="Reset count and clear history"
          >
            Reset
          </button>
        </div>

        {reached && <p className="reached-note">🎉 Target reached — nice work!</p>}
      </section>

      {!isSub && (
        <section className="card subs-card">
          <h2 className="section-title">
            Sub-counters <span className="count-badge">{subs.length}</span>
          </h2>
          {subs.length > 0 ? (
            <div className="counter-grid">
              {subs.map((s) => (
                <SubCounterCard
                  key={s.id}
                  sub={s}
                  busy={quickBusy === s.id}
                  onQuickAdd={() => void handleQuickAdd(s)}
                />
              ))}
            </div>
          ) : (
            <p className="muted subs-empty">
              No sub-counters yet — split this counter into smaller tracks (e.g. exercises,
              medicines, habits).
            </p>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setShowNewSub(true)}>
            + Add sub-counter
          </button>
        </section>
      )}

      <section className="card history-card">
        <h2 className="section-title">
          History <span className="count-badge">{history.length}</span>
        </h2>
        <HistoryList history={history} onPreview={setPreview} />
      </section>

      <footer className="footer">
        {storage === "kv"
          ? "☁️ Cloud sync enabled (Vercel KV + Blob)"
          : "💾 Local dev storage — add KV/Blob env vars to enable cross-device sync"}
      </footer>

      {showCheckin && (
        <CheckinModal
          onClose={() => setShowCheckin(false)}
          onSubmit={handleCheckin}
          busy={busy === "checkin"}
        />
      )}
      {showSettings && (
        <SettingsModal
          project={project}
          saving={busy === "config"}
          deleting={busy === "delete"}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveConfig}
          onDelete={() => setAskDelete(true)}
        />
      )}
      {showNewSub && (
        <NewCounterModal
          busy={busy === "newsub"}
          parentId={id}
          parentName={project.name}
          onClose={() => setShowNewSub(false)}
          onCreate={handleCreateSub}
        />
      )}
      {askReset && (
        <ConfirmDialog
          title="Reset counter?"
          message={`This sets the count back to 0 and permanently deletes all ${history.length} check-in record${history.length === 1 ? "" : "s"} (including uploaded proof images). This cannot be undone.`}
          confirmLabel="Reset everything"
          busy={busy === "reset"}
          onConfirm={() => void handleReset()}
          onCancel={() => setAskReset(false)}
        />
      )}
      {askDelete && (
        <ConfirmDialog
          title="Delete counter?"
          message={`This permanently deletes “${project.name}”${subs.length > 0 ? ` and its ${subs.length} sub-counter${subs.length === 1 ? "" : "s"}` : ""}, including all check-in records and uploaded images. This cannot be undone.`}
          confirmLabel="Delete counter"
          busy={busy === "delete"}
          onConfirm={() => void handleDelete()}
          onCancel={() => setAskDelete(false)}
        />
      )}
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}

      <ToastHost toasts={toasts} dismiss={dismiss} />
    </main>
  );
}
