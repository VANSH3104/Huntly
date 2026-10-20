import * as React from "react";
import {
  Bookmark,
  BookmarkCheck,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  ExternalLink,
  Globe,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { BoardRow, FindMethod, JobSources } from "./useJobSources";

const METHODS: Array<{ id: FindMethod; title: string; description: string; icon: LucideIcon }> = [
  { id: "quick", title: "Quick find", description: "LinkedIn, YC and career pages for your search", icon: Search },
  { id: "scrape", title: "Scrape all boards", description: "Every public job board at once", icon: Layers },
  { id: "autohunt", title: "Auto-hunt", description: "Keep finding jobs in the background", icon: Timer },
  { id: "agent", title: "Agent search", description: "Describe the job you want in plain words", icon: Bot },
  { id: "combos", title: "AI combinations", description: "Expand your search into many queries", icon: Sparkles },
  { id: "career", title: "Career URL", description: "Pull jobs from one company's page", icon: Globe },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function PaneHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function SearchContext({ sources }: { sources: JobSources }) {
  const f = sources.filters;
  const keywords = f.search || f.role || "Software Engineer";
  return (
    <p className="text-sm text-muted-foreground">
      Searching for <span className="font-medium text-foreground">{keywords}</span> in{" "}
      <span className="font-medium text-foreground">{f.location || "India"}</span>
      {f.remoteOnly ? ", remote only" : ""}. Change this with the search box and filters.
    </p>
  );
}

// ─── Quick find ──────────────────────────────────────────────────
function QuickPane({ sources }: { sources: JobSources }) {
  const { quick } = sources;
  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="Quick find" description="Searches public postings on LinkedIn, YC and company career pages, then adds new ones to your feed." />
      <SearchContext sources={sources} />
      <div>
        <Button onClick={() => void quick.run()} disabled={quick.running}>
          {quick.running ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" aria-hidden />}
          {quick.running ? "Searching…" : "Find and add jobs"}
        </Button>
      </div>
      {quick.result && !quick.running && (
        <p className="text-sm text-muted-foreground" role="status">
          Last run added <span className="font-medium text-foreground">{plural(quick.result.total, "job")}</span>:{" "}
          {quick.result.linkedin} from LinkedIn, {quick.result.careerPages} from ATS and YC career pages.
        </p>
      )}
    </div>
  );
}

// ─── Scrape all boards ───────────────────────────────────────────
const STATUS_ORDER: Record<BoardRow["status"], number> = { running: 0, queued: 1, error: 2, done: 3 };

function BoardStatusIcon({ status }: { status: BoardRow["status"] }) {
  if (status === "running") return <Spinner className="text-primary" aria-label="Running" />;
  if (status === "done") return <Check className="size-4 text-[var(--success)]" aria-label="Done" />;
  if (status === "error") return <X className="size-4 text-destructive" aria-label="Failed" />;
  return <CircleDashed className="size-4 text-muted-foreground" aria-label="Queued" />;
}

function BoardTable({ rows }: { rows: BoardRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Board</th>
            <th className="w-24 px-3 py-2 font-medium">Status</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Fetched</th>
            <th className="w-20 px-3 py-2 text-right font-medium">Added</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="truncate font-medium text-foreground">{b.label}</div>
                {b.status === "error" && b.message && (
                  <div className="truncate text-xs text-destructive" title={b.message}>{b.message}</div>
                )}
              </td>
              <td className="px-3 py-2">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <BoardStatusIcon status={b.status} />
                  <span className="text-xs">{b.status === "error" ? "Failed" : b.status[0]!.toUpperCase() + b.status.slice(1)}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{b.status === "queued" ? "" : b.fetched}</td>
              <td className="px-3 py-2 text-right text-foreground tabular-nums">{b.status === "queued" ? "" : b.added}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScrapePane({ sources, onHide }: { sources: JobSources; onHide: () => void }) {
  const { scrape, boardCount } = sources;
  const [showFinished, setShowFinished] = React.useState(false);
  const rows = [...scrape.rows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.label.localeCompare(b.label));
  const total = rows.length;
  const added = rows.reduce((n, b) => n + b.added, 0);
  const failed = rows.filter((b) => b.status === "error");
  const active = rows.filter((b) => b.status === "running" || b.status === "queued");
  const finished = rows.filter((b) => b.status === "done");
  const pct = total ? Math.round((scrape.finished / total) * 100) : 0;
  const hasRun = scrape.running || scrape.result || scrape.error;
  const collapseFinished = finished.length > 8;

  return (
    <div className="flex flex-col gap-5">
      <PaneHeader
        title="Scrape all boards"
        description={`Scrapes ${boardCount ? `${boardCount} public job boards` : "every supported public job board"} for your search or role.`}
      >
        {scrape.running ? (
          <Button variant="outline" onClick={onHide}>Run in background</Button>
        ) : (
          <Button onClick={() => void scrape.start()}>
            <Layers data-icon="inline-start" aria-hidden />
            {hasRun ? "Scrape again" : "Start scraping"}
          </Button>
        )}
      </PaneHeader>

      {!hasRun && <SearchContext sources={sources} />}

      {hasRun && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{scrape.finished} of {total || "?"}</span> boards finished
              {scrape.keywords ? ` for “${scrape.keywords}”` : ""}
            </span>
            <span className="text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{added.toLocaleString()}</span> jobs added
            </span>
          </div>
          <Progress value={scrape.running ? pct : 100} aria-label="Scrape progress" />
          {scrape.running && (
            <p className="text-xs text-muted-foreground">You can close this window. Scraping continues and the feed updates as jobs arrive.</p>
          )}
          {scrape.error && <p className="text-sm text-destructive">{scrape.error}</p>}
        </div>
      )}

      {failed.length > 0 && !scrape.running && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-foreground">Failed boards ({failed.length})</h4>
          <BoardTable rows={failed} />
        </div>
      )}

      {(active.length > 0 || (scrape.running && failed.length > 0)) && (
        <BoardTable rows={scrape.running ? [...active, ...failed] : active} />
      )}

      {finished.length > 0 &&
        (collapseFinished ? (
          <Collapsible open={showFinished} onOpenChange={setShowFinished} className="flex flex-col gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="self-start">
                <ChevronDown className={cn("transition-transform", !showFinished && "-rotate-90")} data-icon="inline-start" aria-hidden />
                {showFinished ? "Hide" : "Show"} finished boards ({finished.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <BoardTable rows={finished} />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <BoardTable rows={finished} />
        ))}

      {scrape.recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-sm font-medium text-foreground">Latest added</h4>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {scrape.recent.map((j) => (
              <li key={j.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{j.title ?? "Untitled role"}</span>
                  {j.company && <span className="text-muted-foreground"> at {j.company}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{j.board}</span>
                {j.url && (
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a href={j.url} target="_blank" rel="noreferrer" aria-label={`Open ${j.title ?? "job"}`}>
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Auto-hunt ───────────────────────────────────────────────────
function AutoHuntPane({ sources }: { sources: JobSources }) {
  const { autoHunt } = sources;
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="Auto-hunt" description="Runs Quick find quietly every 45 seconds while this page is open and adds what it finds to your feed." />
      <Field orientation="horizontal" className="rounded-lg border border-border p-4">
        <div className="flex flex-1 flex-col gap-1">
          <FieldLabel htmlFor="auto-hunt-switch">Keep finding jobs</FieldLabel>
          <FieldDescription>
            {autoHunt.enabled
              ? autoHunt.busy
                ? "Checking for new postings now."
                : autoHunt.last
                  ? autoHunt.last.error
                    ? `Last check ${timeAgo(autoHunt.last.at)} failed: ${autoHunt.last.error}`
                    : `Last check ${timeAgo(autoHunt.last.at)} added ${plural(autoHunt.last.added, "job")}.`
                  : "Starting…"
              : "Off. Turn on to check LinkedIn, YC and ATS career pages on a timer."}
          </FieldDescription>
        </div>
        <Switch id="auto-hunt-switch" checked={autoHunt.enabled} onCheckedChange={autoHunt.setEnabled} />
      </Field>
      <SearchContext sources={sources} />
    </div>
  );
}

// ─── Agent search ────────────────────────────────────────────────
const AGENT_PRESETS = [
  { label: "Reputed companies, high pay", query: "reputed companies paying high compensation for backend engineer" },
  { label: "Senior backend, top pay", query: "senior backend or distributed systems paying above 35 LPA with good engineering culture" },
  { label: "Funded YC startups", query: "well-funded YC startups or unicorn companies hiring remote full stack or frontend" },
  { label: "AI and ML infrastructure", query: "top companies hiring AI engineer or machine learning systems with competitive salary" },
];
const AGENT_STEPS = ["Understanding your request", "Screening saved jobs", "Researching companies", "Ranking matches"];

function AgentPane({ sources, onOpenJob }: { sources: JobSources; onOpenJob: (id: string) => void }) {
  const { agent } = sources;
  const results = agent.data?.results ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="Agent search" description="Describe the job you want. The agent screens your feed, researches the companies and ranks the best fits." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void agent.run();
        }}
      >
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="agent-query" className="sr-only">What are you looking for</FieldLabel>
            <Textarea
              id="agent-query"
              rows={3}
              placeholder="e.g. Reputed companies paying well for backend or distributed systems roles, India or remote"
              value={agent.query}
              onChange={(e) => agent.setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void agent.run();
                }
              }}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={agent.running || !agent.query.trim()}>
              {agent.running ? <Spinner data-icon="inline-start" /> : <Bot data-icon="inline-start" aria-hidden />}
              {agent.running ? "Researching…" : "Run search"}
            </Button>
            {AGENT_PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                disabled={agent.running}
                onClick={() => {
                  agent.setQuery(p.query);
                  void agent.run(p.query);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </FieldGroup>
      </form>

      {agent.running && (
        <ol className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm" aria-live="polite">
          {AGENT_STEPS.map((label, i) => {
            const step = i + 1;
            const done = agent.step > step;
            const current = agent.step === step;
            return (
              <li key={label} className={cn("flex items-center gap-2", done || current ? "text-foreground" : "text-muted-foreground")}>
                {done ? (
                  <Check className="size-4 text-[var(--success)]" aria-hidden />
                ) : current ? (
                  <Spinner className="text-primary" />
                ) : (
                  <CircleDashed className="size-4" aria-hidden />
                )}
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {agent.error && !agent.running && <p className="text-sm text-destructive">{agent.error}</p>}

      {agent.data && !agent.running && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {plural(results.length, "match", "matches")} from {plural(agent.data.stats?.totalEvaluatedInDb ?? 0, "job")} across{" "}
              {plural(agent.data.stats?.uniqueCompaniesResearched ?? 0, "employer")}
            </span>
            <div className="flex items-center gap-2">
              {agent.data.parsedIntent?.compensationExpectation && (
                <Badge variant="secondary">Pay: {agent.data.parsedIntent.compensationExpectation}</Badge>
              )}
              {agent.data.parsedIntent?.reputationTier && <Badge variant="secondary">Tier: {agent.data.parsedIntent.reputationTier}</Badge>}
              <Button variant="ghost" size="sm" onClick={agent.clear}>Clear</Button>
            </div>
          </div>
          {results.length === 0 && <p className="text-sm text-muted-foreground">No matches. Try a broader description.</p>}
          <ul className="flex flex-col gap-3">
            {results.map((item) => {
              const saved = agent.savedIds.has(item.id);
              const loc = item.location
                ? `${item.location.city ? `${item.location.city}, ` : ""}${item.location.country || (item.location.remote ? "Remote" : "Global")}`
                : null;
              return (
                <li key={item.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenJob(item.id)}
                        className="truncate text-left font-medium text-foreground hover:underline"
                      >
                        {item.title}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {item.companyName}
                        {loc ? ` · ${loc}` : ""}
                        {item.reputationScore ? ` · Reputation ${item.reputationScore}/100` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.companyTier && <Badge variant="outline">{item.companyTier}</Badge>}
                      <Badge variant="secondary" className="tabular-nums">{item.agentScore || 85}% fit</Badge>
                    </div>
                  </div>
                  {item.expectedPay && (
                    <p className="text-sm text-foreground">
                      Expected pay {item.expectedPay}
                      {item.payBenchmarkSummary && <span className="text-muted-foreground"> · {item.payBenchmarkSummary}</span>}
                    </p>
                  )}
                  {item.whyThisFits?.length > 0 && (
                    <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm text-muted-foreground">
                      {item.whyThisFits.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onOpenJob(item.id)}>View details</Button>
                    <Button variant="outline" size="sm" onClick={() => void agent.save(item.id)} disabled={saved}>
                      {saved ? <BookmarkCheck data-icon="inline-start" aria-hidden /> : <Bookmark data-icon="inline-start" aria-hidden />}
                      {saved ? "Saved" : "Save to board"}
                    </Button>
                    {item.applyUrl && (
                      <Button size="sm" asChild>
                        <a href={item.applyUrl} target="_blank" rel="noopener noreferrer">
                          Apply
                          <ExternalLink data-icon="inline-end" aria-hidden />
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── AI combinations ─────────────────────────────────────────────
const COMBO_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "role", label: "Role synonyms" },
  { id: "stack", label: "Tech stack" },
  { id: "startup_yc", label: "YC and startups" },
  { id: "ats_portal", label: "ATS portals" },
  { id: "intent", label: "High intent" },
];
const categoryLabel = (id: string) => COMBO_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";

function CombosPane({ sources, onFilterFeed }: { sources: JobSources; onFilterFeed: (q: string) => void }) {
  const { combos } = sources;
  const [category, setCategory] = React.useState("all");
  const selectedCount = combos.items.filter((c) => c.selected).length;
  const visible = combos.items.map((c, i) => ({ c, i })).filter(({ c }) => category === "all" || c.category === category);

  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="AI combinations" description="AI expands your keywords into role titles, tech stacks, startups and ATS boards, then crawls the ones you pick." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void combos.generate();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <Field className="min-w-[240px] flex-1">
          <FieldLabel htmlFor="combo-keywords">Keywords</FieldLabel>
          <Input
            id="combo-keywords"
            placeholder={sources.filters.role || "e.g. backend engineer, golang"}
            value={combos.keywords}
            onChange={(e) => combos.setKeywords(e.target.value)}
          />
        </Field>
        <Button type="submit" variant={combos.items.length ? "outline" : "default"} disabled={combos.generating}>
          {combos.generating ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" aria-hidden />}
          {combos.generating ? "Generating…" : combos.items.length ? "Regenerate" : "Generate"}
        </Button>
      </form>

      {combos.items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              type="single"
              size="sm"
              variant="outline"
              value={category}
              onValueChange={(v) => v && setCategory(v)}
              aria-label="Filter by category"
              className="flex-wrap"
            >
              {COMBO_CATEGORIES.filter((t) => t.id === "all" || combos.items.some((c) => c.category === t.id)).map((t) => (
                <ToggleGroupItem key={t.id} value={t.id}>{t.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="ghost" size="sm" onClick={() => combos.setAll(combos.items.some((c) => !c.selected))}>
              {combos.items.every((c) => c.selected) ? "Deselect all" : "Select all"}
            </Button>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map(({ c, i }) => (
              <li key={c.query + i}>
                <label
                  className={cn(
                    "flex h-full cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                    c.selected ? "border-primary bg-accent/50" : "border-border bg-card hover:bg-accent/30"
                  )}
                >
                  <Checkbox checked={c.selected} onCheckedChange={() => combos.toggle(i)} className="mt-0.5" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-foreground" title={c.query}>{c.query}</span>
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                    <span className="flex items-center justify-between gap-2 pt-1">
                      <Badge variant="outline">{categoryLabel(c.category)}</Badge>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          onFilterFeed(c.query);
                        }}
                      >
                        Filter feed
                      </Button>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground" role="status">
              {combos.result && !combos.crawling
                ? `Last run added ${plural(combos.result.added, "job")} from ${plural(combos.result.queries, "combination")}.`
                : `${selectedCount} of ${combos.items.length} selected`}
            </span>
            <Button onClick={() => void combos.crawlSelected()} disabled={combos.crawling || selectedCount === 0}>
              {combos.crawling ? <Spinner data-icon="inline-start" /> : <Search data-icon="inline-start" aria-hidden />}
              {combos.crawling ? "Crawling…" : `Run selected (${selectedCount})`}
            </Button>
          </div>
        </>
      )}

      {combos.items.length === 0 && !combos.generating && (
        <p className="text-sm text-muted-foreground">
          Uses your keywords, role, location and active resume skills. Nothing is crawled until you pick combinations and run them.
        </p>
      )}
    </div>
  );
}

// ─── Career URL ──────────────────────────────────────────────────
function isHttpUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function CareerPane({ sources }: { sources: JobSources }) {
  const { career } = sources;
  const [touched, setTouched] = React.useState(false);
  const value = career.url.trim();
  const invalid = touched && value.length > 0 && !isHttpUrl(value);
  return (
    <div className="flex flex-col gap-5">
      <PaneHeader title="Career URL" description="Paste a company's careers or ATS page. Jobs on it are extracted, scored and added to your feed." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (isHttpUrl(value)) void career.run();
        }}
        className="flex flex-wrap items-start gap-2"
      >
        <Field data-invalid={invalid || undefined} className="min-w-[260px] flex-1">
          <FieldLabel htmlFor="career-url" className="sr-only">Career page URL</FieldLabel>
          <Input
            id="career-url"
            type="url"
            inputMode="url"
            placeholder="https://boards.greenhouse.io/stripe"
            value={career.url}
            aria-invalid={invalid || undefined}
            onChange={(e) => career.setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
          />
          {invalid && <FieldDescription>Enter a full URL starting with https://</FieldDescription>}
        </Field>
        <Button type="submit" disabled={career.running || !value}>
          {career.running ? <Spinner data-icon="inline-start" /> : <Globe data-icon="inline-start" aria-hidden />}
          {career.running ? "Extracting…" : "Crawl and add"}
        </Button>
      </form>
      {career.result && !career.running && (
        <p className="text-sm text-muted-foreground" role="status">
          Added <span className="font-medium text-foreground">{plural(career.result.added, "job")}</span> from{" "}
          <span className="font-medium text-foreground">{career.result.company}</span>.
        </p>
      )}
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────
function isRunning(sources: JobSources, id: FindMethod): boolean {
  switch (id) {
    case "quick": return sources.quick.running;
    case "scrape": return sources.scrape.running;
    case "autohunt": return sources.autoHunt.enabled;
    case "agent": return sources.agent.running;
    case "combos": return sources.combos.generating || sources.combos.crawling;
    case "career": return sources.career.running;
  }
}

export interface FindJobsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method: FindMethod;
  onMethodChange: (m: FindMethod) => void;
  sources: JobSources;
  onOpenJob: (id: string) => void;
  onFilterFeed: (query: string) => void;
}

export function FindJobsDialog({ open, onOpenChange, method, onMethodChange, sources, onOpenJob, onFilterFeed }: FindJobsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(640px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Find jobs</DialogTitle>
          <DialogDescription>Choose how to look for new postings. Everything found is added to your feed.</DialogDescription>
        </DialogHeader>
        <Tabs
          orientation="vertical"
          value={method}
          onValueChange={(v) => onMethodChange(v as FindMethod)}
          className="min-h-0 flex-1 flex-col gap-0 sm:flex-row"
        >
          <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-muted/40 p-2 sm:w-56 sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-b-0">
            {METHODS.map((m) => {
              const Icon = m.icon;
              return (
                <TabsTrigger
                  key={m.id}
                  value={m.id}
                  className="h-auto flex-none items-start gap-2.5 px-2.5 py-2 text-left whitespace-normal sm:w-full"
                >
                  <Icon className="mt-0.5" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      {m.title}
                      {isRunning(sources, m.id) && (
                        m.id === "autohunt" ? (
                          <span className="size-1.5 rounded-full bg-[var(--success)]" aria-label="On" />
                        ) : (
                          <Spinner className="size-3 text-primary" />
                        )
                      )}
                    </span>
                    <span className="hidden text-xs font-normal text-muted-foreground sm:block">{m.description}</span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <Separator className="hidden" />
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <TabsContent value="quick" className="p-6"><QuickPane sources={sources} /></TabsContent>
            <TabsContent value="scrape" className="p-6"><ScrapePane sources={sources} onHide={() => onOpenChange(false)} /></TabsContent>
            <TabsContent value="autohunt" className="p-6"><AutoHuntPane sources={sources} /></TabsContent>
            <TabsContent value="agent" className="p-6"><AgentPane sources={sources} onOpenJob={onOpenJob} /></TabsContent>
            <TabsContent value="combos" className="p-6"><CombosPane sources={sources} onFilterFeed={onFilterFeed} /></TabsContent>
            <TabsContent value="career" className="p-6"><CareerPane sources={sources} /></TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/** Small toolbar chip shown next to "Find jobs" while a run (or auto-hunt) is active. Clicking reopens the dialog. */
export function FindJobsStatusChip({ sources, onOpen }: { sources: JobSources; onOpen: (m: FindMethod) => void }) {
  const { activity, autoHunt } = sources;
  if (!activity && !autoHunt.enabled) return null;
  return (
    <Button variant="outline" size="sm" className="bg-card" onClick={() => onOpen(activity?.method ?? "autohunt")}>
      {activity ? (
        <Spinner data-icon="inline-start" className="text-primary" />
      ) : (
        <span aria-hidden className="size-2 rounded-full bg-[var(--success)]" data-icon="inline-start" />
      )}
      {activity?.label ?? "Auto-hunt on"}
      {activity && autoHunt.enabled && <span className="text-muted-foreground">· Auto-hunt on</span>}
    </Button>
  );
}
