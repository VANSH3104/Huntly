import React from "react";
import { Radio, X, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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
    <section
      aria-label="Live scraping feed"
      className="glass-panel"
      style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="btn btn-ghost"
          style={{ padding: "2px 6px", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Radio size={14} color={connected ? "var(--accent-emerald)" : "var(--text-muted)"} />
          <span>Live scraping</span>
        </button>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }} aria-live="polite">
          {!connected
            ? "Connecting to live feed…"
            : running > 0
              ? `${running} board${running === 1 ? "" : "s"} running · ${totalAdded} added`
              : boardEntries.length
                ? `Done · ${totalAdded} added`
                : "Waiting for a scrape to start"}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", flex: 1 }}>
          {boardEntries.map(([board, b]) => (
            <span
              key={board}
              title={b.message}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-secondary)",
                color: b.status === "error" ? "var(--accent-rose)" : b.status === "done" ? "var(--accent-emerald)" : "var(--accent-amber)",
                fontFamily: "var(--font-mono)",
                whiteSpace: "nowrap",
              }}
            >
              {board} · {b.status} · {b.fetched} fetched · +{b.added}
            </span>
          ))}
        </div>
        <button type="button" className="btn-icon" aria-label="Close live feed" onClick={onClose} style={{ marginLeft: "auto" }}>
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            maxHeight: "180px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {items.length === 0 ? (
            <li style={{ fontSize: "12px", color: "var(--text-muted)", padding: "4px 2px" }}>New jobs appear here as they are added.</li>
          ) : (
            items.map((it) => (
              <li
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "12px",
                  padding: "4px 6px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-secondary)",
                }}
              >
                <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title ?? "Untitled role"}
                </span>
                <span style={{ color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{it.company}</span>
                {it.location && <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{it.location}</span>}
                <span style={{ marginLeft: "auto", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{it.board}</span>
                {it.url && (
                  <a href={it.url} target="_blank" rel="noreferrer" aria-label={`Open ${it.title ?? "job"}`} style={{ color: "var(--accent-indigo)", display: "flex" }}>
                    <ExternalLink size={12} />
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
