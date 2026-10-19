import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  X,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Clock,
  ExternalLink,
  RotateCcw,
  Trash2,
  ChevronDown,
  ChevronUp,
  LogIn,
  SkipForward,
} from "lucide-react";
import { api, type AutoApplyQueueItem, type AutoApplyStatus } from "../../lib/api";
import { useStore } from "../../store/useStore";

type Tab = "all" | "active" | "review" | "skipped" | "done" | "failed";

const STATUS: Record<AutoApplyStatus, { label: string; color: string; icon: React.ReactNode }> = {
  queued: { label: "Queued", color: "var(--text-muted)", icon: <Clock size={14} /> },
  running: { label: "Applying", color: "var(--accent-indigo)", icon: <Loader2 size={14} className="animate-spin" /> },
  needs_review: { label: "Needs you", color: "var(--accent-amber)", icon: <AlertTriangle size={14} /> },
  needs_login: { label: "Needs sign-in", color: "var(--accent-amber)", icon: <LogIn size={14} /> },
  skipped: { label: "Skipped", color: "var(--text-muted)", icon: <SkipForward size={14} /> },
  submitted: { label: "Applied", color: "var(--accent-emerald)", icon: <CheckCircle2 size={14} /> },
  failed: { label: "Failed", color: "var(--accent-rose)", icon: <XCircle size={14} /> },
};

const smallBtn: React.CSSProperties = {
  fontSize: "11px",
  padding: "5px 9px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-card)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  textDecoration: "none",
};

export const AutoApplyDock: React.FC = () => {
  const { isAutoApplyDockOpen: open, setIsAutoApplyDockOpen: setOpen } = useStore();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["autoApplyQueue"],
    queryFn: api.autoApply.queue,
    refetchInterval: (q) => {
      const s = q.state.data?.stats;
      return s && (s.running > 0 || s.queued > 0) ? 2000 : 8000;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["autoApplyQueue"] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["jobs"] });
  };
  const act = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn(), onSuccess: refresh });

  if (!data || data.items.length === 0) return null;

  const { stats, items, paused, submittedToday, config } = data;
  const total = items.length;
  const parked = stats.skipped + stats.needs_login;
  const finished = stats.submitted + stats.failed + stats.needs_review + parked;
  const working = stats.running + stats.queued;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  const visible = items.filter((i) => {
    if (tab === "active") return i.status === "running" || i.status === "queued";
    if (tab === "review") return i.status === "needs_review";
    if (tab === "skipped") return i.status === "skipped" || i.status === "needs_login";
    if (tab === "done") return i.status === "submitted";
    if (tab === "failed") return i.status === "failed";
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 90,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-card)",
          boxShadow: "var(--shadow-lg)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-primary)",
        }}
      >
        {working > 0 && !paused ? <Loader2 size={14} className="animate-spin" color="var(--accent-indigo)" /> : <Zap size={14} color="var(--accent-indigo)" />}
        <span>
          Auto-Apply · {stats.submitted} applied
          {working > 0 ? ` · ${working} left` : ""}
          {stats.needs_review > 0 ? ` · ${stats.needs_review} need you` : ""}
          {parked > 0 ? ` · ${parked} skipped` : ""}
        </span>
      </button>
    );
  }

  const tabs: Array<[Tab, string, number]> = [
    ["all", "All", total],
    ["active", "Active", working],
    ["review", "Needs you", stats.needs_review],
    ["skipped", "Skipped / sign-in", parked],
    ["done", "Applied", stats.submitted],
    ["failed", "Failed", stats.failed],
  ];

  return (
    <div
      className="glass-panel"
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 90,
        width: "min(440px, calc(100vw - 40px))",
        maxHeight: "72vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-card)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-lg)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
            <Zap size={16} color="var(--accent-indigo)" /> Auto-Apply
            <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-muted)" }}>
              {submittedToday}/{config.dailyCap} today
            </span>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button style={smallBtn} onClick={() => act.mutate(() => (paused ? api.autoApply.resumeQueue() : api.autoApply.pauseQueue()))}>
              {paused ? <Play size={12} /> : <Pause size={12} />} {paused ? "Resume" : "Pause"}
            </button>
            {stats.queued > 0 && (
              <button style={smallBtn} onClick={() => act.mutate(() => api.autoApply.cancelQueued())} title="Remove everything still waiting">
                Cancel queued
              </button>
            )}
            <button className="btn-icon" onClick={() => setOpen(false)} aria-label="Minimise">
              <X size={15} />
            </button>
          </div>
        </div>

        <div style={{ height: 6, borderRadius: 3, background: "var(--bg-surface)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--gradient-brand)", transition: "width 0.4s" }} />
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          {paused ? "Paused. " : working > 0 ? "Working. " : "Done. "}
          {finished} of {total} finished
        </div>

        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {tabs.map(([id, label, n]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                ...smallBtn,
                background: tab === id ? "rgba(79, 70, 229, 0.08)" : "transparent",
                borderColor: tab === id ? "var(--border-active)" : "transparent",
                color: tab === id ? "var(--accent-indigo)" : "var(--text-muted)",
                fontWeight: tab === id ? 600 : 500,
              }}
            >
              {label} {n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: "8px" }}>
        {visible.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>Nothing here.</div>
        )}
        {visible.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            expanded={expanded === item.id}
            onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
            onAct={(fn) => act.mutate(fn)}
          />
        ))}
        {parked > 0 && tab === "skipped" && (
          <button style={{ ...smallBtn, margin: "8px" }} onClick={() => act.mutate(() => api.autoApply.rerun(["skipped", "needs_login"]))}>
            <RotateCcw size={12} /> Re-run all skipped ({parked})
          </button>
        )}
        {stats.failed > 0 && tab === "failed" && (
          <button style={{ ...smallBtn, margin: "8px" }} onClick={() => act.mutate(() => api.autoApply.clearFailed())}>
            <Trash2 size={12} /> Clear failed
          </button>
        )}
      </div>
    </div>
  );
};

const QueueRow: React.FC<{
  item: AutoApplyQueueItem;
  expanded: boolean;
  onToggle: () => void;
  onAct: (fn: () => Promise<unknown>) => void;
}> = ({ item, expanded, onToggle, onAct }) => {
  const st = STATUS[item.status];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const canAct = ["needs_review", "failed", "skipped", "needs_login"].includes(item.status);

  const saveAnswers = async () => {
    for (const [q, a] of Object.entries(answers)) {
      if (a.trim()) await api.autoApply.saveMemory({ question: q, answer: a.trim() });
    }
  };

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", marginBottom: "6px", background: "var(--bg-surface)" }}>
      <div onClick={onToggle} style={{ display: "flex", gap: "10px", alignItems: "center", padding: "10px 12px", cursor: "pointer" }}>
        <span style={{ color: st.color, display: "flex" }}>{st.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.company} · <span style={{ color: st.color }}>{st.label}</span>
            {item.reason && item.status !== "submitted" && item.reason !== "signin" && item.reason !== "force" ? ` · ${item.reason}` : ""}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
      </div>

      {expanded && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {item.unfilled.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-amber)" }}>It needs your answer for these. Saved once, reused on every future job.</div>
              {item.unfilled.map((q) => (
                <input
                  key={q}
                  placeholder={q}
                  value={answers[q] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  style={{ fontSize: "12px", padding: "7px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                />
              ))}
            </div>
          )}

          {item.screenshot && (
            <a href={`/api/auto-apply/screenshot/${item.screenshot}`} target="_blank" rel="noreferrer">
              <img
                src={`/api/auto-apply/screenshot/${item.screenshot}`}
                alt="Application preview"
                style={{ width: "100%", maxHeight: 200, objectFit: "cover", objectPosition: "top", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}
              />
            </a>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            <a href={item.applyUrl} target="_blank" rel="noreferrer" style={smallBtn}>
              <ExternalLink size={12} /> Open page
            </a>
            {item.status === "needs_review" && /captcha/i.test(item.reason ?? "") && (
              <button
                style={{ ...smallBtn, borderColor: "var(--border-active)", color: "var(--accent-indigo)", fontWeight: 600 }}
                onClick={() => onAct(() => api.autoApply.retryItem(item.id, { signIn: true }))}
                title="Opens a browser window. Solve the captcha and it submits for you."
              >
                <LogIn size={12} /> Open &amp; finish
              </button>
            )}
            {item.status === "needs_login" && (
              <button
                style={{ ...smallBtn, borderColor: "var(--border-active)", color: "var(--accent-indigo)", fontWeight: 600 }}
                onClick={() => onAct(() => api.autoApply.retryItem(item.id, { signIn: true }))}
                title="Opens a browser window. Sign in, and it carries on automatically."
              >
                <LogIn size={12} /> Sign in &amp; run
              </button>
            )}
            {canAct && (
              <button
                style={smallBtn}
                onClick={async () => {
                  await saveAnswers();
                  onAct(() => api.autoApply.retryItem(item.id));
                }}
              >
                <RotateCcw size={12} /> {item.status === "skipped" || item.status === "needs_login" ? "Re-run" : "Retry"}
                {item.unfilled.length > 0 ? " with answers" : ""}
              </button>
            )}
            {item.status === "needs_review" && (
              <>
                <button style={smallBtn} onClick={() => onAct(() => api.autoApply.retryItem(item.id, { force: true }))} title="Submit even if some required fields are empty">
                  <Zap size={12} /> Submit anyway
                </button>
                <button style={smallBtn} onClick={() => onAct(() => api.autoApply.markItemApplied(item.id))} title="You applied by hand. Put it on the board.">
                  <CheckCircle2 size={12} /> I applied
                </button>
              </>
            )}
            {item.status !== "running" && item.status !== "submitted" && (
              <button style={smallBtn} onClick={() => onAct(() => api.autoApply.removeItem(item.id))}>
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>

          {item.logs.length > 0 && (
            <pre style={{ margin: 0, fontSize: "10.5px", lineHeight: 1.5, maxHeight: 120, overflow: "auto", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}>
              {item.logs.slice(-10).join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
