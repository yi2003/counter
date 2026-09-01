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
import NewCounterModal from "@/components/NewCounterModal";
import ToastHost, { useToasts } from "@/components/ToastHost";
import UserChip from "@/components/UserChip";
import { IconBack, IconGear, IconTrash, IconClose } from "@/components/icons";
import { CopyIcon } from "@/components/CounterCard";
import { clampPct, progressColor } from "@/lib/progress";

type Busy = "checkin" | "undo" | "reset" | "config" | "delete" | "newsub" | null;
type RoundGroup = CounterSummary & { subs: CounterSummary[] };
type NewChildTarget = { mode: "round" | "sub"; parentId: string; parentName: string };

const enc = encodeURIComponent;

export default function CounterDetail({
  id,
  user,
  localMode = false,
}: {
  id: string;
  user: SessionUser;
  localMode?: boolean;
}) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [dupBusy, setDupBusy] = useState<string | null>(null);
  const [copySource, setCopySource] = useState<{ id: string; name: string; kind: "sub" | "round" } | null>(null);
  const [copyBusy, setCopyBusy] = useState<string | null>(null);
  const [rounds, setRounds] = useState<RoundGroup[]>([]);
  const [parent, setParent] = useState<CounterSummary | null>(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newChild, setNewChild] = useState<NewChildTarget | null>(null);
  const [confirmRound, setConfirmRound] = useState<CounterSummary | null>(null);
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
      setRounds(
        list.counters
          .filter((c) => c.parentId === id && c.rounder)
          .map((r) => ({
            ...r,
            subs: list.counters.filter((x) => x.parentId === r.id),
          })),
      );
      // Sub-counters sit inside a round — the "back" target is the owning counter.
      const directParent = s.project.parentId
        ? (list.counters.find((c) => c.id === s.project.parentId) ?? null)
        : null;
      setParent(
        directParent?.rounder
          ? (list.counters.find((c) => c.id === directParent.parentId) ?? null)
          : directParent,
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
      const res = await api<{
        used: number;
        record: CheckinRecord | null;
        parentUpdate?: { id: string; used: number };
      }>(`/api/counters/${enc(id)}/checkin`, {
        method: "POST",
        body: JSON.stringify({ note, image, thumb }),
      });
      if (res.record) {
        setState((s) => (s ? { ...s, used: res.used, history: [res.record!, ...s.history] } : s));
      }
      setShowCheckin(false);
      setBounce(true);
      setTimeout(() => setBounce(false), 700);
      push(
        res.parentUpdate
          ? "Round completed — the counter auto-checked-in ✅"
          : "Checked in successfully 🎉",
      );
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  /** "+1 all" on a round: +1 for every sub-counter inside it. */
  async function handleRoundCheckin(round: CounterSummary) {
    setQuickBusy(round.id);
    try {
      const res = await api<{
        subUpdates?: { id: string; used: number }[];
        skipped?: string[];
        parentUpdate?: { id: string; used: number };
      }>(`/api/counters/${enc(round.id)}/checkin`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRounds((list) =>
        list.map((r) =>
          r.id === round.id
            ? {
                ...r,
                subs: r.subs.map((s) => {
                  const u = res.subUpdates?.find((x) => x.id === s.id);
                  return u ? { ...s, used: u.used } : s;
                }),
              }
            : r,
        ),
      );
      if (res.parentUpdate) {
        push("Round completed — the counter auto-checked-in ✅");
        await load();
      } else if (res.skipped?.length) {
        push(`+1 all — skipped: ${res.skipped.join(", ")} (already at target)`, "warning");
      } else {
        push(`+1 all in ${round.name}`);
      }
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setQuickBusy(null);
    }
  }

  async function handleQuickAdd(sub: CounterSummary) {
    setQuickBusy(sub.id);
    try {
      const res = await api<{ used: number; parentUpdate?: { id: string; used: number } }>(
        `/api/counters/${enc(sub.id)}/checkin`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setRounds((list) =>
        list.map((r) => ({
          ...r,
          subs: r.subs.map((s) => (s.id === sub.id ? { ...s, used: res.used } : s)),
        })),
      );
      push(`+1 ${sub.name}`);
      if (res.parentUpdate) {
        push("Round completed — the counter auto-checked-in ✅");
        await load();
      }
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setQuickBusy(null);
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
      await load();
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

  async function handleDeleteRound() {
    if (!confirmRound) return;
    const target = confirmRound;
    setBusy("delete");
    try {
      await api(`/api/counters/${enc(target.id)}`, { method: "DELETE" });
      setConfirmRound(null);
      push(`Round “${target.name}” deleted`, "warning");
      await load();
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleCreateChild(name: string, total: number) {
    if (!newChild) return;
    setBusy("newsub");
    try {
      await api("/api/counters", {
        method: "POST",
        body: JSON.stringify({
          name,
          total: newChild.mode === "round" ? 1 : total,
          parentId: newChild.parentId,
        }),
      });
      setNewChild(null);
      push(`“${name}” created`);
      await load();
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDuplicate(target: CounterSummary) {
    setDupBusy(target.id);
    try {
      await api(`/api/counters/${enc(target.id)}/duplicate`, { method: "POST" });
      push(`Duplicated ${target.name} ✨`);
      await load();
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setDupBusy(null);
    }
  }

  /** "Copy to round": copies the source (sub-counter or whole round set) into the chosen round. */
  async function handleCopyToRound(targetId: string, targetName: string) {
    if (!copySource) return;
    setCopyBusy(targetId);
    try {
      const res = await api<{ created?: number }>(`/api/counters/${enc(copySource.id)}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ parentId: targetId }),
      });
      const n = res.created ?? 1;
      push(
        n > 1
          ? `Copied ${n} sub-counters to “${targetName}” ✨`
          : `Copied “${copySource.name}” to “${targetName}” ✨`,
      );
      setCopySource(null);
      await load();
    } catch (e) {
      push(errMsg(e), "error");
    } finally {
      setCopyBusy(null);
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

  const { project, used, history, storage, blob } = state;
  const remaining = Math.max(0, project.total - used);
  const pct = project.total > 0 ? Math.round((used / project.total) * 100) : 0;
  const reached = used >= project.total;
  const isTopLevel = !project.parentId;
  const subCount = rounds.reduce((n, r) => n + r.subs.length, 0);

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
              {parent ? `Part of ${parent.name}` : "Universal check-in counter"}
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

      {localMode && (
        <div className="banner banner-info">
          📁 Local mode — this counter and its history live in this browser only.
        </div>
      )}

      {!localMode && storage === "local" && (
        <div className="banner banner-danger">
          ⚠️ <strong>Data is not persistent here.</strong> Connect Vercel KV (dashboard → Storage →
          Upstash Redis) so history survives redeploys and syncs to your other devices.
        </div>
      )}

      {!localMode && storage === "kv" && !blob && (
        <div className="banner banner-warning">
          🖼️ Images are stored temporarily — connect Vercel Blob so photo proof survives redeploys.
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

      {isTopLevel && (
        <section className="card rounds-card">
          <h2 className="section-title">
            Rounds <span className="count-badge">{rounds.length}</span>
          </h2>
          <p className="subs-hint">
            🔄 Each round holds its sub-counters — when every sub-counter in a round reaches its
            target, this counter auto-checks-in the round. “+1 all” adds +1 to every sub-counter.
          </p>
          {rounds.length === 0 && (
            <p className="muted subs-empty">
              No rounds yet — create your first round, then add sub-counters to it.
            </p>
          )}
          {rounds.map((r) => {
            const doneCount = r.subs.filter((s) => s.used >= s.total).length;
            const roundDone = r.subs.length > 0 && doneCount === r.subs.length;
            return (
              <div className={`round-card${roundDone ? " round-done" : ""}`} key={r.id}>
                <div className="round-head">
                  <span className="round-name">{r.name}</span>
                  <span className="round-progress">
                    {roundDone
                      ? "✅ complete"
                      : `${doneCount}/${r.subs.length} sub-counter${r.subs.length === 1 ? "" : "s"} done`}
                  </span>
                  <span className="round-actions">
                    <button
                      className="round-pill"
                      onClick={() => void handleRoundCheckin(r)}
                      disabled={quickBusy === r.id || busy !== null || roundDone}
                      title={
                        roundDone ? "Round complete" : "Add +1 to every sub-counter in this round"
                      }
                    >
                      {quickBusy === r.id ? <span className="spinner spinner-dark" /> : "+1 all"}
                    </button>
                    <button
                      className="round-pill"
                      onClick={() => setCopySource({ id: r.id, name: r.name, kind: "round" })}
                      disabled={busy !== null}
                      title="Copy this round's sub-counters into another round"
                    >
                      Copy to…
                    </button>
                    <button
                      className="round-icon-btn"
                      onClick={() => void handleDuplicate(r)}
                      disabled={dupBusy === r.id || busy !== null}
                      aria-label={`Duplicate ${r.name}`}
                      title="Duplicate this round (with sub-counters, zeroed)"
                    >
                      {dupBusy === r.id ? (
                        <span className="spinner spinner-dark" />
                      ) : (
                        <CopyIcon size={15} />
                      )}
                    </button>
                    <button
                      className="round-icon-btn danger-text"
                      onClick={() => setConfirmRound(r)}
                      disabled={busy !== null}
                      aria-label={`Delete ${r.name}`}
                      title="Delete this round and its sub-counters"
                    >
                      <IconTrash size={15} />
                    </button>
                  </span>
                </div>
                {r.subs.map((s) => {
                  const done = s.used >= s.total;
                  return (
                    <div className="round-sub" key={s.id}>
                      <Link className="round-sub-main" href={`/c/${s.id}`}>
                        <span className="round-sub-bar" aria-hidden>
                          <span
                            className="round-sub-fill"
                            style={{
                              width: `${clampPct(s.total > 0 ? (s.used / s.total) * 100 : 0)}%`,
                              background: progressColor(
                                s.total > 0 ? (s.used / s.total) * 100 : 0,
                              ),
                            }}
                          />
                        </span>
                        <span className="round-sub-name">{s.name}</span>
                      </Link>
                      <span className="round-sub-nums">
                        {s.used} / {s.total}
                        {done ? " 🎉" : ""}
                      </span>
                      <button
                        className="round-sub-btn"
                        onClick={() => void handleQuickAdd(s)}
                        disabled={quickBusy === s.id || done}
                        title={done ? "Target reached" : `+1 ${s.name}`}
                      >
                        {quickBusy === s.id ? <span className="spinner spinner-dark" /> : "+1"}
                      </button>
                      <button
                        className="round-icon-btn"
                        onClick={() => setCopySource({ id: s.id, name: s.name, kind: "sub" })}
                        disabled={copyBusy === s.id || busy !== null}
                        aria-label={`Copy ${s.name} to round`}
                        title="Copy this sub-counter to a round"
                      >
                        {copyBusy === s.id ? (
                          <span className="spinner spinner-dark" />
                        ) : (
                          <CopyIcon size={13} />
                        )}
                      </button>
                    </div>
                  );
                })}
                <button
                  className="btn btn-ghost btn-sm round-add"
                  onClick={() =>
                    setNewChild({ mode: "sub", parentId: r.id, parentName: r.name })
                  }
                >
                  + Add sub-counter
                </button>
              </div>
            );
          })}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setNewChild({ mode: "round", parentId: id, parentName: project.name })}
          >
            + New round
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
        {localMode ? (
          <span className="footer-storage">📁 This device only — data stays in this browser</span>
        ) : (
          <span className="footer-storage">
            {storage === "kv"
              ? `☁️ Cloud sync enabled (Vercel KV${blob ? " + Blob" : ""})`
              : "💾 Local dev storage — add KV/Blob env vars to enable cross-device sync"}
          </span>
        )}
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
      {newChild && (
        <NewCounterModal
          busy={busy === "newsub"}
          mode={newChild.mode}
          parentId={newChild.parentId}
          parentName={newChild.parentName}
          onClose={() => setNewChild(null)}
          onCreate={handleCreateChild}
        />
      )}
      {confirmRound && (
        <ConfirmDialog
          title="Delete round?"
          message={`This permanently deletes “${confirmRound.name}”${
            rounds.find((r) => r.id === confirmRound.id)?.subs.length
              ? ` and its ${rounds.find((r) => r.id === confirmRound.id)!.subs.length} sub-counter${
                  rounds.find((r) => r.id === confirmRound.id)!.subs.length === 1 ? "" : "s"
                }`
              : ""
          }, including all check-in records and uploaded images. This cannot be undone.`}
          confirmLabel="Delete round"
          busy={busy === "delete"}
          onConfirm={() => void handleDeleteRound()}
          onCancel={() => setConfirmRound(null)}
        />
      )}
      {copySource && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && copyBusy === null) setCopySource(null);
          }}
        >
          <div className="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Copy to round">
            <div className="modal-head">
              <h3>
                {copySource.kind === "sub"
                  ? `Copy “${copySource.name}” to round`
                  : `Copy sub-counters of “${copySource.name}” to…`}
              </h3>
              <button
                className="icon-btn"
                onClick={() => setCopySource(null)}
                aria-label="Close"
                disabled={copyBusy !== null}
              >
                <IconClose />
              </button>
            </div>
            {(() => {
              const targets = rounds.filter(
                (r) => copySource.kind === "sub" || r.id !== copySource.id,
              );
              if (targets.length === 0) {
                return (
                  <p className="muted copy-empty">
                    No other rounds yet — create a round first, then copy into it.
                  </p>
                );
              }
              return (
                <div className="copy-targets">
                  {targets.map((t) => (
                    <button
                      key={t.id}
                      className="copy-target"
                      onClick={() => void handleCopyToRound(t.id, t.name)}
                      disabled={copyBusy !== null}
                    >
                      <span className="copy-target-name">{t.name}</span>
                      <span className="copy-target-meta">
                        {t.subs.length} sub-counter{t.subs.length === 1 ? "" : "s"}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
            <p className="muted copy-hint">Copies start at 0 and keep the same target.</p>
          </div>
        </div>
      )}
      {askReset && (
        <ConfirmDialog
          title="Reset counter?"
          message={`This sets the count back to 0 and permanently deletes all ${history.length} check-in record${history.length === 1 ? "" : "s"}${subCount > 0 ? ` across all ${subCount} sub-counter${subCount === 1 ? "" : "s"}` : ""} (including uploaded proof images). This cannot be undone.`}
          confirmLabel="Reset everything"
          busy={busy === "reset"}
          onConfirm={() => void handleReset()}
          onCancel={() => setAskReset(false)}
        />
      )}
      {askDelete && (
        <ConfirmDialog
          title="Delete counter?"
          message={`This permanently deletes “${project.name}”${rounds.length > 0 ? ` with its ${rounds.length} round${rounds.length === 1 ? "" : "s"} and ${subCount} sub-counter${subCount === 1 ? "" : "s"}` : ""}, including all check-in records and uploaded images. This cannot be undone.`}
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
