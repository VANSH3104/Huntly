import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  LogIn,
  Minus,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Trash2,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { api, type AutoApplyQueueItem, type AutoApplyStatus } from "../../lib/api";
import { useStore } from "../../store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { errorMessage, toast } from "@/lib/notify";

type Tab = "all" | "active" | "open" | "review" | "skipped" | "done" | "failed";

const STATUS: Record<AutoApplyStatus, { label: string; tone: string; icon: LucideIcon; spin?: boolean }> = {
  queued: { label: "Queued", tone: "text-muted-foreground", icon: Clock },
  open: { label: "Open in browser", tone: "text-[var(--info)]", icon: ExternalLink },
  running: { label: "Applying", tone: "text-primary", icon: Loader2, spin: true },
  needs_review: { label: "Needs you", tone: "text-[var(--warning)]", icon: AlertTriangle },
  needs_login: { label: "Needs sign-in", tone: "text-[var(--warning)]", icon: LogIn },
  skipped: { label: "Skipped", tone: "text-muted-foreground", icon: SkipForward },
  submitted: { label: "Applied", tone: "text-[var(--success)]", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "text-destructive", icon: XCircle },
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
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
    onError: (err) => toast.error("Auto-apply action failed", { description: errorMessage(err) }),
  });

  if (!data || data.items.length === 0) return null;

  const { stats, items, paused, submittedToday, config } = data;
  const total = items.length;
  const parked = stats.skipped + stats.needs_login;
  const finished = stats.submitted + stats.failed + stats.needs_review + parked + stats.open;
  const working = stats.running + stats.queued;
  const pct = total ? Math.round((finished / total) * 100) : 0;

  const visible = items.filter((i) => {
    if (tab === "active") return i.status === "running" || i.status === "queued";
    if (tab === "open") return i.status === "open";
    if (tab === "review") return i.status === "needs_review";
    if (tab === "skipped") return i.status === "skipped" || i.status === "needs_login";
    if (tab === "done") return i.status === "submitted";
    if (tab === "failed") return i.status === "failed";
    return true;
  });

  if (!open) {
    const summary = [
      `${stats.submitted} applied`,
      working > 0 && `${working} left`,
      stats.open > 0 && `${stats.open} open for you`,
      stats.needs_review > 0 && `${stats.needs_review} need you`,
      parked > 0 && `${parked} skipped`,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open auto-apply panel: ${summary}`}
        className="fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full border border-border bg-popover px-4 py-2.5 text-xs font-medium text-foreground shadow-[var(--shadow-lg)] transition-colors outline-none hover:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {working > 0 && !paused ? (
          <Loader2 className="size-3.5 animate-spin text-primary" aria-hidden />
        ) : (
          <Zap className="size-3.5 text-primary" aria-hidden />
        )}
        <span>
          <span className="font-semibold">Auto-apply</span>
          <span className="text-muted-foreground"> · {summary}</span>
        </span>
      </button>
    );
  }

  const tabs: Array<[Tab, string, number]> = [
    ["all", "All", total],
    ["active", "Active", working],
    ["open", "Open tabs", stats.open],
    ["review", "Needs you", stats.needs_review],
    ["skipped", "Skipped", parked],
    ["done", "Applied", stats.submitted],
    ["failed", "Failed", stats.failed],
  ];

  return (
    <section
      aria-label="Auto-apply queue"
      className="fixed right-5 bottom-5 z-40 flex max-h-[72vh] w-[min(440px,calc(100vw-40px))] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-[var(--shadow-xl)]"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 pt-3.5 pb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Zap className="size-4 text-primary" aria-hidden />
            Auto-apply
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {submittedToday}/{config.dailyCap} today
            </span>
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="xs"
              onClick={() => act.mutate(() => (paused ? api.autoApply.resumeQueue() : api.autoApply.pauseQueue()))}
            >
              {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {paused ? "Resume" : "Pause"}
            </Button>
            {stats.queued > 0 && (
              <Button variant="ghost" size="xs" onClick={() => act.mutate(() => api.autoApply.cancelQueued())} title="Remove everything still waiting">
                Cancel queued
              </Button>
            )}
            <Button variant="ghost" size="icon-xs" onClick={() => setOpen(false)} aria-label="Minimise auto-apply panel">
              <Minus />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div
            role="progressbar"
            aria-label="Auto-apply progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="h-1.5 overflow-hidden rounded-full bg-secondary"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {paused ? "Paused. " : working > 0 ? "Working. " : "Done. "}
            {finished} of {total} finished
          </p>
        </div>

        <ToggleGroup
          type="single"
          size="sm"
          aria-label="Filter queue"
          value={tab}
          onValueChange={(v) => v && setTab(v as Tab)}
          className="w-full flex-wrap justify-start gap-1"
        >
          {tabs.map(([id, label, n]) => (
            <ToggleGroupItem
              key={id}
              value={id}
              className="h-7 rounded-md px-2 text-xs data-[state=on]:bg-[var(--brand-soft)] data-[state=on]:text-[var(--brand-strong)]"
            >
              {label}
              <span className="text-[10.5px] opacity-70 tabular-nums">{n}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-1.5 overflow-y-auto p-2">
        {visible.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">Nothing here.</p>}
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
          <Button variant="outline" size="sm" className="m-1 self-start" onClick={() => act.mutate(() => api.autoApply.rerun(["skipped", "needs_login"]))}>
            <RotateCcw data-icon="inline-start" aria-hidden />
            Re-run all skipped ({parked})
          </Button>
        )}
        {stats.failed > 0 && tab === "failed" && (
          <Button variant="outline" size="sm" className="m-1 self-start" onClick={() => act.mutate(() => api.autoApply.clearFailed())}>
            <Trash2 data-icon="inline-start" aria-hidden />
            Clear failed
          </Button>
        )}
      </div>
    </section>
  );
};

const QueueRow: React.FC<{
  item: AutoApplyQueueItem;
  expanded: boolean;
  onToggle: () => void;
  onAct: (fn: () => Promise<unknown>) => void;
}> = ({ item, expanded, onToggle, onAct }) => {
  const st = STATUS[item.status];
  const Icon = st.icon;
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const canAct = ["needs_review", "failed", "skipped", "needs_login"].includes(item.status);
  const detailsId = `queue-item-${item.id}`;

  const saveAnswers = async () => {
    for (const [q, a] of Object.entries(answers)) {
      if (a.trim()) await api.autoApply.saveMemory({ question: q, answer: a.trim() });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Icon className={cn("size-4 shrink-0", st.tone, st.spin && "animate-spin")} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-foreground">{item.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {item.company} · <span className={st.tone}>{st.label}</span>
            {item.reason && item.status !== "submitted" && item.reason !== "signin" && item.reason !== "force" ? ` · ${item.reason}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} aria-hidden />
      </button>

      {expanded && (
        <div id={detailsId} className="flex flex-col gap-3 px-3 pb-3">
          {item.unfilled.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-[var(--warning)]">It needs your answer for these. Saved once, reused on every future job.</p>
              {item.unfilled.map((q) => (
                <Input
                  key={q}
                  aria-label={q}
                  placeholder={q}
                  value={answers[q] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                  className="h-8 text-xs"
                />
              ))}
            </div>
          )}

          {item.screenshot && (
            <a
              href={`/api/auto-apply/screenshot/${item.screenshot}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <img
                src={`/api/auto-apply/screenshot/${item.screenshot}`}
                alt={`Application preview for ${item.title}`}
                className="max-h-[200px] w-full rounded-lg border border-border object-cover object-top"
              />
            </a>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="xs" asChild>
              <a href={item.applyUrl} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open page
              </a>
            </Button>
            {item.status === "open" && (
              <>
                <Button size="xs" onClick={() => onAct(() => api.autoApply.focusItem(item.id))} title="Switch to this job's tab in the browser window">
                  <ExternalLink aria-hidden />
                  Show tab
                </Button>
                <Button variant="outline" size="xs" onClick={() => onAct(() => api.autoApply.markItemApplied(item.id))} title="You submitted it yourself. Put it on the board.">
                  <CheckCircle2 aria-hidden />I submitted it
                </Button>
              </>
            )}
            {item.status === "needs_review" && /captcha/i.test(item.reason ?? "") && (
              <Button
                size="xs"
                onClick={() => onAct(() => api.autoApply.retryItem(item.id, { signIn: true }))}
                title="Opens a browser window. Solve the captcha and it submits for you."
              >
                <LogIn aria-hidden />
                Open and finish
              </Button>
            )}
            {item.status === "needs_login" && (
              <Button
                size="xs"
                onClick={() => onAct(() => api.autoApply.retryItem(item.id, { signIn: true }))}
                title="Opens a browser window. Sign in, and it carries on automatically."
              >
                <LogIn aria-hidden />
                Sign in and run
              </Button>
            )}
            {canAct && (
              <Button
                variant="outline"
                size="xs"
                onClick={async () => {
                  try {
                    await saveAnswers();
                  } catch (err) {
                    toast.error("Could not save your answers", { description: errorMessage(err) });
                    return;
                  }
                  onAct(() => api.autoApply.retryItem(item.id));
                }}
              >
                <RotateCcw aria-hidden />
                {item.status === "skipped" || item.status === "needs_login" ? "Re-run" : "Retry"}
                {item.unfilled.length > 0 ? " with answers" : ""}
              </Button>
            )}
            {item.status === "needs_review" && (
              <>
                <Button variant="outline" size="xs" onClick={() => onAct(() => api.autoApply.retryItem(item.id, { force: true }))} title="Submit even if some required fields are empty">
                  <Zap aria-hidden />
                  Submit anyway
                </Button>
                <Button variant="outline" size="xs" onClick={() => onAct(() => api.autoApply.markItemApplied(item.id))} title="You applied by hand. Put it on the board.">
                  <CheckCircle2 aria-hidden />I applied
                </Button>
              </>
            )}
            {item.status !== "running" && item.status !== "submitted" && (
              <Button variant="ghost" size="xs" onClick={() => onAct(() => api.autoApply.removeItem(item.id))}>
                <Trash2 aria-hidden />
                {item.status === "open" ? "Close tab" : "Remove"}
              </Button>
            )}
          </div>

          {item.logs.length > 0 && (
            <pre className="max-h-[120px] overflow-auto rounded-lg bg-muted/60 p-2 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {item.logs.slice(-10).join("\n")}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
