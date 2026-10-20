import React from "react";
import { X, ChevronDown, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type LiveCrawlEvent } from "../../lib/api";

const MAX_ITEMS = 30;
const REFETCH_THROTTLE_MS = 3000;
const MAX_BACKOFF_MS = 30000;
const EVENT_TYPES: LiveCrawlEvent["type"][] = ["board_start", "board_done", "job_added", "error"];

type BoardState = { status: "running" | "done" | "error"; fetched: number; added: number; message?: string };
type FeedItem = LiveCrawlEvent & { id: number };

function parseEvent(raw: string): LiveCrawlEvent | null {
  try {
    const ev = JSON.parse(raw) as LiveCrawlEvent;
    return ev && typeof ev.type === "string" && typeof ev.board === "string" ? ev : null;
  } catch {
    return null;
  }
}

// Calls fn at most once per `ms`, with a trailing call so the last burst is not lost.
function useThrottled(fn: () => void, ms: number): () => void {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const last = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return React.useCallback(() => {
    const wait = last.current + ms - Date.now();
    if (wait <= 0) {
      last.current = Date.now();
      fnRef.current();
    } else if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        last.current = Date.now();
        fnRef.current();
      }, wait);
    }
  }, [ms]);
}

export const LiveFeed: React.FC<{
  open: boolean;
  onClose: () => void;
  onJobsAdded: () => void;
}> = ({ open, onClose, onJobsAdded }) => {
  const [connected, setConnected] = React.useState(false);
  const [expanded, setExpanded] = React.useState(true);
  const [boards, setBoards] = React.useState<Record<string, BoardState>>({});
  const [items, setItems] = React.useState<FeedItem[]>([]);
  const nextId = React.useRef(0);
  const refetchThrottled = useThrottled(onJobsAdded, REFETCH_THROTTLE_MS);

  const handleEvent = React.useCallback(
    (ev: LiveCrawlEvent) => {
      switch (ev.type) {
        case "board_start":
          setBoards((b) => ({ ...b, [ev.board]: { status: "running", fetched: 0, added: 0 } }));
          break;
        case "board_done":
          setBoards((b) => ({
            ...b,
            [ev.board]: { status: "done", fetched: ev.fetched ?? b[ev.board]?.fetched ?? 0, added: ev.added ?? b[ev.board]?.added ?? 0 },
          }));
          break;
        case "error":
          setBoards((b) => ({
            ...b,
            [ev.board]: { ...(b[ev.board] ?? { fetched: 0, added: 0 }), status: "error", message: ev.message },
          }));
          break;
        case "job_added":
          setBoards((b) => {
            const cur = b[ev.board] ?? { status: "running" as const, fetched: 0, added: 0 };
            return { ...b, [ev.board]: { ...cur, added: cur.added + 1 } };
          });
          setItems((list) => [{ ...ev, id: nextId.current++ }, ...list].slice(0, MAX_ITEMS));
          refetchThrottled();
          break;
      }
    },
    [refetchThrottled]
  );

  React.useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const onMessage = (e: MessageEvent) => {
      const ev = parseEvent(e.data);
      if (ev) handleEvent(ev);
    };

    const connect = () => {
      if (disposed) return;
      try {
        source = new EventSource(api.crawl.liveUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      source.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      // The backend may send unnamed or named events; only one of these paths fires per event.
      source.onmessage = onMessage;
      EVENT_TYPES.forEach((t) => source?.addEventListener(t, onMessage as EventListener));
      source.onerror = () => {
        setConnected(false);
        source?.close();
        source = null;
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (disposed || retry) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [handleEvent]);

  if (!open) return null;

  const boardEntries = Object.entries(boards);
  const totalAdded = boardEntries.reduce((n, [, b]) => n + b.added, 0);
  const running = boardEntries.filter(([, b]) => b.status === "running").length;

  return (
    <section aria-label="Live scraping feed" className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls="live-feed-items"
          className="-ml-2 font-semibold"
        >
          <ChevronDown className={cn("transition-transform", !expanded && "-rotate-90")} data-icon="inline-start" aria-hidden />
          <span className="relative flex size-2" aria-hidden>
            {connected && (
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--success)] opacity-60 motion-reduce:animate-none" />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", connected ? "bg-[var(--success)]" : "bg-[var(--border-hover)]")} />
          </span>
          Live scraping
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {!connected
            ? "Connecting to the live feed…"
            : running > 0
              ? `${running} board${running === 1 ? "" : "s"} running · ${totalAdded} added`
              : boardEntries.length
                ? `Done · ${totalAdded} added`
                : "Waiting for a scrape to start"}
        </span>
        <ul aria-label="Boards" className="flex flex-1 flex-wrap gap-1.5">
          {boardEntries.map(([board, b]) => (
            <li
              key={board}
              title={b.message}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 text-[11px] whitespace-nowrap",
                b.status === "error" ? "text-destructive" : b.status === "done" ? "text-[var(--success)]" : "text-[var(--warning)]"
              )}
            >
              {b.status === "running" && <Loader2 className="size-3 animate-spin" aria-hidden />}
              {board} · {b.status} · {b.fetched} fetched · +{b.added}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="icon-sm" aria-label="Close live feed" onClick={onClose} className="ml-auto">
          <X />
        </Button>
      </div>

      {expanded && (
        <ul id="live-feed-items" className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-1 py-1 text-xs text-muted-foreground">New jobs appear here as they are added.</li>
          ) : (
            items.map((it) => (
              <li key={it.id} className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
                <span className="truncate font-medium text-foreground">{it.title ?? "Untitled role"}</span>
                <span className="whitespace-nowrap text-muted-foreground">{it.company}</span>
                {it.location && <span className="whitespace-nowrap text-muted-foreground">{it.location}</span>}
                <span className="ml-auto text-[11px] text-muted-foreground">{it.board}</span>
                {it.url && (
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${it.title ?? "job"}`}
                    className="inline-flex size-6 items-center justify-center rounded text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
};
