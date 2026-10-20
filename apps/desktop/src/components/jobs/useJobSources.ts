import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type BoardScrapeResult, type LiveCrawlEvent } from "../../lib/api";
import { useStore } from "../../store/useStore";
import { errorMessage, toast } from "@/lib/notify";

const AUTO_HUNT_INTERVAL_MS = 45000;
const REFETCH_THROTTLE_MS = 3000;
const MAX_BACKOFF_MS = 30000;
const MAX_RECENT = 8;
const LIVE_EVENT_TYPES: LiveCrawlEvent["type"][] = ["board_start", "board_done", "job_added", "error"];

export type BoardStatus = "queued" | "running" | "done" | "error";
export interface BoardRow {
  id: string;
  label: string;
  status: BoardStatus;
  fetched: number;
  added: number;
  message?: string;
}
export interface RecentJob {
  key: number;
  board: string;
  title?: string;
  company?: string;
  url?: string;
}

export type AgentSearchResult = Awaited<ReturnType<typeof api.ai.agentSearch>>;
export interface Combination {
  query: string;
  category: string;
  description: string;
  selected: boolean;
}

interface ScrapeState {
  running: boolean;
  keywords?: string;
  boards: Record<string, BoardRow>;
  recent: RecentJob[];
  result: BoardScrapeResult | null;
  error: string | null;
}

interface QuickFindResult {
  total: number;
  linkedin: number;
  careerPages: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function parseLiveEvent(raw: string): LiveCrawlEvent | null {
  try {
    const ev = JSON.parse(raw) as LiveCrawlEvent;
    return ev && typeof ev.type === "string" && typeof ev.board === "string" ? ev : null;
  } catch {
    return null;
  }
}

/** Calls fn at most once per `ms`, with a trailing call so the last burst is not lost. */
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

/** Subscribes to the backend's live crawl stream for as long as the caller is mounted, reconnecting with backoff. */
function useLiveCrawl(onEvent: (ev: LiveCrawlEvent) => void) {
  const handler = React.useRef(onEvent);
  handler.current = onEvent;

  React.useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let disposed = false;

    const onMessage = (e: MessageEvent) => {
      const ev = parseLiveEvent(e.data);
      if (ev) handler.current(ev);
    };
    const scheduleReconnect = () => {
      if (disposed || retry) return;
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++);
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };
    const connect = () => {
      if (disposed) return;
      try {
        source = new EventSource(api.crawl.liveUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      source.onopen = () => { attempt = 0; };
      // The backend may send unnamed or named events; only one of these paths fires per event.
      source.onmessage = onMessage;
      LIVE_EVENT_TYPES.forEach((t) => source?.addEventListener(t, onMessage as EventListener));
      source.onerror = () => {
        source?.close();
        source = null;
        scheduleReconnect();
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, []);
}

/**
 * Every way of pulling new jobs into the feed: quick find, the all-boards scrape (with live per-board progress),
 * auto-hunt, agent search, AI search combinations and single career pages. Lives in JobsView so runs keep going
 * while the Find jobs dialog is closed.
 */
export function useJobSources() {
  const { filters, setFilters } = useStore();
  const queryClient = useQueryClient();
  const refreshFeed = React.useCallback(() => queryClient.invalidateQueries({ queryKey: ["jobs"] }), [queryClient]);
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  const { data: boardsData } = useQuery({
    queryKey: ["crawl-boards"],
    queryFn: () => api.crawl.listBoards(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const boardList = React.useMemo(
    () => (boardsData?.boards ?? []).filter((b) => (b as { enabled?: boolean }).enabled !== false),
    [boardsData]
  );
  const boardLabel = React.useCallback(
    (id: string) => boardList.find((b) => b.id === id)?.label ?? id,
    [boardList]
  );

  // ─── Quick find ──────────────────────────────────────────────
  const [quickRunning, setQuickRunning] = React.useState(false);
  const [quickResult, setQuickResult] = React.useState<QuickFindResult | null>(null);

  const discoverParams = () => {
    const f = filtersRef.current;
    return {
      keywords: f.search || f.role || "Software Engineer",
      role: f.role,
      location: f.location || "India",
      remoteOnly: f.remoteOnly,
    };
  };

  const runQuickFind = async () => {
    if (quickRunning) return;
    try {
      setQuickRunning(true);
      const res = await api.crawl.discover(discoverParams());
      const result = {
        total: res?.discovered?.total ?? 0,
        linkedin: res?.discovered?.linkedin ?? 0,
        careerPages: res?.discovered?.careerPages ?? 0,
      };
      setQuickResult(result);
      await refreshFeed();
      toast.success(`${plural(result.total, "job")} added to your feed`, {
        description: `${result.linkedin} from LinkedIn, ${result.careerPages} from ATS and YC career pages.`,
      });
    } catch (err) {
      toast.error("Job discovery failed", { description: errorMessage(err, "Could not search public postings.") });
    } finally {
      setQuickRunning(false);
    }
  };

  // ─── Auto-hunt (silent background quick find) ────────────────
  const [autoHunt, setAutoHunt] = React.useState(false);
  const [autoHuntLast, setAutoHuntLast] = React.useState<{ at: number; added: number; error?: string } | null>(null);
  const [autoHuntBusy, setAutoHuntBusy] = React.useState(false);

  React.useEffect(() => {
    if (!autoHunt) return;
    let cancelled = false;
    const tick = async () => {
      setAutoHuntBusy(true);
      try {
        const res = await api.crawl.discover(discoverParams());
        if (cancelled) return;
        setAutoHuntLast({ at: Date.now(), added: res?.discovered?.total ?? 0 });
        await refreshFeed();
      } catch (err) {
        if (!cancelled) setAutoHuntLast({ at: Date.now(), added: 0, error: errorMessage(err) });
      } finally {
        if (!cancelled) setAutoHuntBusy(false);
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), AUTO_HUNT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setAutoHuntBusy(false);
    };
    // Restart the hunt when the search it runs for changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoHunt, filters.search, filters.role, filters.location, filters.remoteOnly]);

  // ─── Scrape all boards ───────────────────────────────────────
  const [scrape, setScrape] = React.useState<ScrapeState>({
    running: false,
    boards: {},
    recent: [],
    result: null,
    error: null,
  });
  const scrapeActive = React.useRef(false);
  const recentKey = React.useRef(0);
  const refreshThrottled = useThrottled(() => void refreshFeed(), REFETCH_THROTTLE_MS);

  useLiveCrawl((ev) => {
    if (!scrapeActive.current) return;
    setScrape((s) => {
      const cur: BoardRow = s.boards[ev.board] ?? {
        id: ev.board,
        label: boardLabel(ev.board),
        status: "queued",
        fetched: 0,
        added: 0,
      };
      let next: BoardRow = cur;
      let recent = s.recent;
      switch (ev.type) {
        case "board_start":
          next = { ...cur, status: "running", fetched: 0, added: 0, message: undefined };
          break;
        case "error":
          next = { ...cur, status: "error", message: ev.message };
          break;
        case "board_done":
          next = {
            ...cur,
            status: cur.status === "error" ? "error" : "done",
            fetched: ev.fetched ?? cur.fetched,
            added: ev.added ?? cur.added,
          };
          break;
        case "job_added":
          next = { ...cur, status: cur.status === "queued" ? "running" : cur.status, added: cur.added + 1 };
          recent = [
            { key: recentKey.current++, board: next.label, title: ev.title, company: ev.company, url: ev.url },
            ...s.recent,
          ].slice(0, MAX_RECENT);
          break;
      }
      return { ...s, boards: { ...s.boards, [ev.board]: next }, recent };
    });
    if (ev.type === "job_added") refreshThrottled();
  });

  const startScrape = async () => {
    if (scrapeActive.current) return;
    const f = filtersRef.current;
    const keywords = (f.search || f.role).trim() || undefined;
    const seeded: Record<string, BoardRow> = {};
    for (const b of boardList) seeded[b.id] = { id: b.id, label: b.label, status: "queued", fetched: 0, added: 0 };
    scrapeActive.current = true;
    setScrape({ running: true, keywords, boards: seeded, recent: [], result: null, error: null });
    try {
      const res = await api.crawl.boards({ keywords });
      setScrape((s) => {
        const boards = { ...s.boards };
        for (const b of res.perBoard) {
          boards[b.board] = {
            id: b.board,
            label: boards[b.board]?.label ?? boardLabel(b.board),
            status: b.error ? "error" : "done",
            fetched: b.fetched,
            added: b.added,
            message: b.error,
          };
        }
        // Boards that never reported (not run by the server) are dropped rather than left queued forever.
        for (const id of Object.keys(boards)) if (boards[id]!.status === "queued") delete boards[id];
        return { ...s, running: false, boards, result: res };
      });
      await refreshFeed();
      const failed = res.perBoard.filter((b) => b.error).length;
      toast.success(`${plural(res.added, "job")} added from ${plural(res.perBoard.length, "board")}`, {
        description: `${res.scraped.toLocaleString()} postings scraped, ${res.updated.toLocaleString()} updated.${
          failed ? ` ${plural(failed, "board")} failed.` : ""
        }`,
      });
    } catch (err) {
      setScrape((s) => ({ ...s, running: false, error: errorMessage(err, "Could not scrape the job boards.") }));
      toast.error("Board scrape failed", { description: errorMessage(err, "Could not scrape the job boards.") });
    } finally {
      scrapeActive.current = false;
    }
  };

  // ─── Agent search ────────────────────────────────────────────
  const [agentQuery, setAgentQuery] = React.useState("");
  const [agentRunning, setAgentRunning] = React.useState(false);
  const [agentStep, setAgentStep] = React.useState(0);
  const [agentData, setAgentData] = React.useState<AgentSearchResult | null>(null);
  const [agentError, setAgentError] = React.useState<string | null>(null);
  const [savedAgentIds, setSavedAgentIds] = React.useState<Set<string>>(new Set());

  const runAgentSearch = async (override?: string) => {
    const query = (override ?? agentQuery).trim();
    if (!query || agentRunning) return;
    const timers = [
      setTimeout(() => setAgentStep(2), 1000),
      setTimeout(() => setAgentStep(3), 3000),
      setTimeout(() => setAgentStep(4), 5500),
    ];
    try {
      setAgentRunning(true);
      setAgentError(null);
      setAgentStep(1);
      const res = await api.ai.agentSearch({ query, limit: 12 });
      setAgentData(res);
      setAgentStep(5);
    } catch (err) {
      const msg = errorMessage(err, "Failed to execute agent search");
      setAgentError(msg);
      toast.error("Agent search failed", { description: msg });
    } finally {
      timers.forEach(clearTimeout);
      setAgentRunning(false);
    }
  };

  const saveAgentJob = async (jobId: string) => {
    try {
      await api.applications.create({ jobId, status: "saved", notes: "Saved from Agent Deep Search" });
    } catch {
      // Already on the board; treat as saved.
    }
    setSavedAgentIds((prev) => new Set([...prev, jobId]));
  };

  // ─── AI combinations ─────────────────────────────────────────
  const [comboKeywords, setComboKeywords] = React.useState(filters.search);
  const [combinations, setCombinations] = React.useState<Combination[]>([]);
  const [comboGenerating, setComboGenerating] = React.useState(false);
  const [comboCrawling, setComboCrawling] = React.useState(false);
  const [comboResult, setComboResult] = React.useState<{ added: number; queries: number } | null>(null);

  const generateCombinations = async () => {
    const f = filtersRef.current;
    try {
      setComboGenerating(true);
      setComboResult(null);
      const res = await api.ai.expandFilters({
        role: f.role,
        keywords: comboKeywords.trim() || f.search,
        location: f.location || "India, Remote",
      });
      setCombinations((res.combinations || []).map((c) => ({ ...c, selected: true })));
    } catch (err) {
      toast.error("Could not generate search combinations", { description: errorMessage(err) });
    } finally {
      setComboGenerating(false);
    }
  };

  const crawlSelectedCombinations = async () => {
    const queries = combinations.filter((c) => c.selected).map((c) => c.query);
    if (queries.length === 0) {
      toast.warning("Select at least one search combination");
      return;
    }
    const f = filtersRef.current;
    try {
      setComboCrawling(true);
      const res = await api.crawl.deepSearch({
        queries,
        location: f.location || "India",
        remoteOnly: f.remoteOnly,
        limitPerQuery: 15,
      });
      setComboResult({ added: res.totalAdded, queries: queries.length });
      await refreshFeed();
      toast.success(`${plural(res.totalAdded, "job")} added from ${plural(queries.length, "combination")}`);
    } catch (err) {
      toast.error("Deep search failed", { description: errorMessage(err) });
    } finally {
      setComboCrawling(false);
    }
  };

  const toggleCombination = (index: number) =>
    setCombinations((prev) => prev.map((c, i) => (i === index ? { ...c, selected: !c.selected } : c)));
  const setAllCombinations = (selected: boolean) =>
    setCombinations((prev) => prev.map((c) => ({ ...c, selected })));
  const filterFeedBy = (query: string) => setFilters({ search: query });

  // ─── Career page ─────────────────────────────────────────────
  const [careerUrl, setCareerUrl] = React.useState("");
  const [careerRunning, setCareerRunning] = React.useState(false);
  const [careerResult, setCareerResult] = React.useState<{ company: string; added: number; url: string } | null>(null);

  const crawlCareerPage = async () => {
    const url = careerUrl.trim();
    if (!url || careerRunning) return;
    try {
      setCareerRunning(true);
      const res = await api.crawl.crawlCareerPage({ url });
      setCareerResult({ company: res.company || "the career page", added: res.addedJobs, url });
      setCareerUrl("");
      await refreshFeed();
      toast.success(`${plural(res.addedJobs, "job")} added from ${res.company || "the career page"}`);
    } catch (err) {
      toast.error("Could not crawl that career page", { description: errorMessage(err) });
    } finally {
      setCareerRunning(false);
    }
  };

  // ─── Toolbar status ──────────────────────────────────────────
  const boardRows = Object.values(scrape.boards);
  const boardsFinished = boardRows.filter((b) => b.status === "done" || b.status === "error").length;
  const activity: { method: FindMethod; label: string } | null = scrape.running
    ? { method: "scrape", label: `Scraping ${boardsFinished} of ${boardRows.length || "?"} boards` }
    : quickRunning
      ? { method: "quick", label: "Finding jobs" }
      : comboCrawling
        ? { method: "combos", label: "Crawling combinations" }
        : careerRunning
          ? { method: "career", label: "Crawling career page" }
          : agentRunning
            ? { method: "agent", label: "Agent searching" }
            : null;

  return {
    filters,
    boardCount: boardList.length,
    activity,
    quick: { running: quickRunning, result: quickResult, run: runQuickFind },
    autoHunt: { enabled: autoHunt, setEnabled: setAutoHunt, busy: autoHuntBusy, last: autoHuntLast, intervalMs: AUTO_HUNT_INTERVAL_MS },
    scrape: { ...scrape, rows: boardRows, finished: boardsFinished, start: startScrape },
    agent: {
      query: agentQuery,
      setQuery: setAgentQuery,
      running: agentRunning,
      step: agentStep,
      data: agentData,
      error: agentError,
      savedIds: savedAgentIds,
      run: runAgentSearch,
      save: saveAgentJob,
      clear: () => setAgentData(null),
    },
    combos: {
      keywords: comboKeywords,
      setKeywords: setComboKeywords,
      items: combinations,
      generating: comboGenerating,
      crawling: comboCrawling,
      result: comboResult,
      generate: generateCombinations,
      crawlSelected: crawlSelectedCombinations,
      toggle: toggleCombination,
      setAll: setAllCombinations,
      filterFeedBy,
    },
    career: { url: careerUrl, setUrl: setCareerUrl, running: careerRunning, result: careerResult, run: crawlCareerPage },
  };
}

export type FindMethod = "quick" | "scrape" | "autohunt" | "agent" | "combos" | "career";
export type JobSources = ReturnType<typeof useJobSources>;
