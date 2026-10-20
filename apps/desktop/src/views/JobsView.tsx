import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { ScoreRing } from "../components/common/ScoreRing";
import { AutoApplyModal } from "../components/AutoApplyModal";
import { AutoApplyLauncher } from "../components/autoapply/AutoApplyLauncher";
import {
  Search,
  MapPin,
  ExternalLink,
  Sparkles,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Globe,
  Zap,
  Layers,
  X,
  RefreshCw,
  Bot,
  Award,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { LiveFeed } from "../components/jobs/LiveFeed";
import { FiltersDialog } from "../components/jobs/FiltersDialog";
import { JobsToolbar } from "../components/jobs/JobsToolbar";
import { JobCard, JobList, JobListEmpty, JobListSkeleton } from "../components/jobs/JobCard";
import { buildJobParams as buildParams, clearedFilters, describeFilterChips } from "../components/jobs/filterModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { errorMessage, toast } from "@/lib/notify";

export const JobsView: React.FC = () => {
  const { filters, setFilters, setSelectedJobId } = useStore();
  const [autoApplyJob, setAutoApplyJob] = React.useState<any | null>(null);
  const [isBatchAutoApplying, setIsBatchAutoApplying] = React.useState(false);
  const [showLauncher, setShowLauncher] = React.useState(false);
  const [launcherIds, setLauncherIds] = React.useState<string[]>([]);
  const [launcherTotal, setLauncherTotal] = React.useState(0);
  const [batchApplyStatus, setBatchApplyStatus] = React.useState<string | null>(null);
  const [batchApplyProgress, setBatchApplyProgress] = React.useState<{ current: number; total: number; currentJob?: string } | null>(null);
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [discoverStatus, setDiscoverStatus] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [isScrapingBoards, setIsScrapingBoards] = React.useState(false);
  const [showLiveFeed, setShowLiveFeed] = React.useState(false);

  const { data: boardsData } = useQuery({
    queryKey: ["crawl-boards"],
    queryFn: () => api.crawl.listBoards(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const boardList = boardsData?.boards ?? [];

  const activeChips = describeFilterChips(filters);
  const pageRef = React.useRef<HTMLDivElement>(null);

  // Continuous auto-discovery state
  const [isAutoHunting, setIsAutoHunting] = React.useState(false);

  // Custom career URL crawl state
  const [showCustomBar, setShowCustomBar] = React.useState(false);
  const [customCareerUrl, setCustomCareerUrl] = React.useState("");
  const [isCrawlingCustom, setIsCrawlingCustom] = React.useState(false);

  // AI Filter Combinations state
  const [showAiCombinations, setShowAiCombinations] = React.useState(false);
  const [isGeneratingCombinations, setIsGeneratingCombinations] = React.useState(false);
  const [isCrawlingCombinations, setIsCrawlingCombinations] = React.useState(false);
  const [combinations, setCombinations] = React.useState<
    Array<{ query: string; category: string; description: string; selected: boolean }>
  >([]);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

  // Agentic Deep Search & Company Intelligence state
  const [showAgentSearch, setShowAgentSearch] = React.useState(false);
  const [agentQuery, setAgentQuery] = React.useState("");
  const [isAgentSearching, setIsAgentSearching] = React.useState(false);
  const [agentSearchData, setAgentSearchData] = React.useState<any | null>(null);
  const [agentSearchStepIndex, setAgentSearchStepIndex] = React.useState(0);
  const [agentSearchError, setAgentSearchError] = React.useState<string | null>(null);

  const handleRunAgentSearch = async (overrideQuery?: string) => {
    const queryToUse = (overrideQuery || agentQuery).trim();
    if (!queryToUse) return;

    try {
      setIsAgentSearching(true);
      setAgentSearchError(null);
      setAgentSearchStepIndex(1);

      const step1 = setTimeout(() => setAgentSearchStepIndex(2), 1000);
      const step2 = setTimeout(() => setAgentSearchStepIndex(3), 3000);
      const step3 = setTimeout(() => setAgentSearchStepIndex(4), 5500);

      const res = await api.ai.agentSearch({
        query: queryToUse,
        limit: 12,
      });

      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);

      setAgentSearchData(res);
      setAgentSearchStepIndex(5);
    } catch (err: any) {
      setAgentSearchError(err.message || "Failed to execute agent search");
    } finally {
      setIsAgentSearching(false);
    }
  };

  const [savedAgentJobIds, setSavedAgentJobIds] = React.useState<Set<string>>(new Set());

  const handleSaveAgentJob = async (jobId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.applications.create({
        jobId,
        status: "saved",
        notes: "Saved from Agent Deep Search",
      });
      setSavedAgentJobIds((prev) => new Set([...prev, jobId]));
    } catch {
      setSavedAgentJobIds((prev) => new Set([...prev, jobId]));
    }
  };

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [
    filters.search,
    filters.role,
    filters.specialization,
    filters.specializations,
    filters.location,
    filters.region,
    filters.regions,
    filters.remoteOnly,
    filters.workFormat,
    filters.workFormats,
    filters.seniority,
    filters.seniorities,
    filters.sources,
    filters.sourceList,
    filters.skills,
    filters.skillList,
    filters.industry,
    filters.industries,
    filters.collection,
    filters.collections,
    filters.minScore,
    filters.ats,
    filters.status,
    filters.sortBy,
    filters.postedWithin,
    filters.hideApplied,
    filters.advanced,
  ]);

  const buildJobParams = (page: number, limit: number) => buildParams(filters, page, limit);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["jobs", filters, currentPage, pageSize],
    queryFn: () => api.jobs.list({ ...buildJobParams(currentPage, pageSize), facets: 1 }),
    placeholderData: (prev) => prev,
  });

  const jobsList: any[] = data?.jobs || [];
  const totalPositions = data?.pagination?.total ?? data?.total ?? jobsList.length ?? 0;
  const totalPages = data?.pagination?.pages ?? Math.max(1, Math.ceil(totalPositions / pageSize));

  const goToPage = (page: number) => {
    setCurrentPage(Math.min(totalPages, Math.max(1, page)));
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    pageRef.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  const handleDiscoverLive = async (silent = false) => {
    try {
      if (!silent) {
        setIsDiscovering(true);
        setShowLiveFeed(true);
      }
      setDiscoverStatus("Searching public postings on LinkedIn, YC and company career pages…");
      const res = await api.crawl.discover({
        keywords: filters.search || filters.role || "Software Engineer",
        role: filters.role,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
      });

      const totalFound = res?.discovered?.total ?? 0;
      await refetch();
      if (!silent) {
        toast.success(`Added ${totalFound.toLocaleString()} ${totalFound === 1 ? "job" : "jobs"} to your feed`, {
          description: `${res?.discovered?.linkedin ?? 0} from LinkedIn, ${res?.discovered?.careerPages ?? 0} from ATS and YC career pages.`,
        });
      }
    } catch (err) {
      if (!silent) toast.error("Job discovery failed", { description: errorMessage(err, "Could not search public postings.") });
    } finally {
      setDiscoverStatus(null);
      setIsDiscovering(false);
    }
  };

  const handleScrapeBoards = async () => {
    const keywords = (filters.search || filters.role).trim() || undefined;
    try {
      setIsScrapingBoards(true);
      setShowLiveFeed(true);
      setDiscoverStatus(`Scraping every job board${keywords ? ` for “${keywords}”` : ""}…`);
      const res = await api.crawl.boards({ keywords });
      const failed = res.perBoard.filter((b) => b.error).map((b) => b.board);
      await refetch();
      toast.success(`Scraped ${res.scraped.toLocaleString()} postings from ${res.perBoard.length} boards`, {
        description: `${res.added} added, ${res.updated} updated.${failed.length ? ` Failed: ${failed.join(", ")}.` : ""}`,
      });
    } catch (err) {
      toast.error("Board scrape failed", { description: errorMessage(err, "Could not scrape the job boards.") });
    } finally {
      setDiscoverStatus(null);
      setIsScrapingBoards(false);
    }
  };

  // Continuous background auto-hunting effect
  React.useEffect(() => {
    if (!isAutoHunting) return;

    // Run first discovery immediately
    handleDiscoverLive(true);

    const interval = setInterval(() => {
      handleDiscoverLive(true);
    }, 45000);

    return () => clearInterval(interval);
  }, [isAutoHunting, filters.search, filters.role, filters.location, filters.remoteOnly]);

  const handleCrawlCustomCareer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customCareerUrl.trim()) return;

    try {
      setIsCrawlingCustom(true);
      setDiscoverStatus(`Extracting jobs from ${customCareerUrl}…`);
      const res = await api.crawl.crawlCareerPage({ url: customCareerUrl.trim() });
      setCustomCareerUrl("");
      setShowCustomBar(false);
      await refetch();
      toast.success(`Added ${res.addedJobs} ${res.addedJobs === 1 ? "job" : "jobs"} from ${res.company || "the career page"}`);
    } catch (err) {
      toast.error("Could not crawl that career page", { description: errorMessage(err) });
    } finally {
      setDiscoverStatus(null);
      setIsCrawlingCustom(false);
    }
  };

  const handleGenerateCombinations = async () => {
    try {
      setIsGeneratingCombinations(true);
      setShowAiCombinations(true);
      const res = await api.ai.expandFilters({
        role: filters.role,
        keywords: filters.search,
        location: filters.location || "India, Remote",
      });
      const items = (res.combinations || []).map((c) => ({
        ...c,
        selected: true,
      }));
      setCombinations(items);
    } catch (err) {
      toast.error("Could not generate search combinations", { description: errorMessage(err) });
    } finally {
      setIsGeneratingCombinations(false);
    }
  };

  const handleCrawlSelectedCombinations = async () => {
    const selectedQueries = combinations.filter((c) => c.selected).map((c) => c.query);
    if (selectedQueries.length === 0) {
      toast.warning("Select at least one search combination");
      return;
    }

    try {
      setIsCrawlingCombinations(true);
      setDiscoverStatus(`Crawling ${selectedQueries.length} combinations across LinkedIn, YC and ATS portals…`);
      const res = await api.crawl.deepSearch({
        queries: selectedQueries,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
        limitPerQuery: 15,
      });

      await refetch();
      toast.success(`Added ${res.totalAdded} ${res.totalAdded === 1 ? "job" : "jobs"} from ${selectedQueries.length} combinations`);
    } catch (err) {
      toast.error("Deep search failed", { description: errorMessage(err) });
    } finally {
      setDiscoverStatus(null);
      setIsCrawlingCombinations(false);
    }
  };

  const toggleCombination = (index: number) => {
    setCombinations((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAllCombinations = (select: boolean) => {
    setCombinations((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleApplySingleCombination = (query: string) => {
    setFilters({ search: query });
  };

  const handleApplyQuick = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.applications.create({
        jobId: job.id,
        status: "applied",
        notes: "Quick applied from feed",
      });
      // Open official URL in new window
      if (job.applyUrl || job.sourceUrl) {
        window.open(job.applyUrl || job.sourceUrl, "_blank");
      }
    } catch {
      if (job.applyUrl || job.sourceUrl) {
        window.open(job.applyUrl || job.sourceUrl, "_blank");
      }
    }
  };

  const handleSaveToKanban = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.applications.create({
        jobId: job.id,
        status: "saved",
      });
      toast.success("Saved to Applications", { description: `${job.title} is now on your board.` });
    } catch (err) {
      toast.error("Could not save this job", { description: errorMessage(err, "It may already be on your board.") });
    }
  };

  const handleTriggerAutoApply = (job: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAutoApplyJob(job);
  };

  const handleBatchAutoApply = async () => {
    try {
      setIsBatchAutoApplying(true);
      const MAX_IDS = 500;
      const ids: string[] = [];
      let page = 1;
      let pages = 1;
      do {
        const res = await api.jobs.list(buildJobParams(page, 100));
        ids.push(...(res.jobs || []).map((j: any) => j.id));
        pages = res.pagination?.pages ?? 1;
        page++;
      } while (page <= pages && ids.length < MAX_IDS);
      setLauncherIds(ids);
      setLauncherTotal(totalPositions);
      setShowLauncher(true);
    } catch (err) {
      toast.error("Could not load the filtered jobs", { description: errorMessage(err) });
    } finally {
      setIsBatchAutoApplying(false);
    }
  };

  return (
    <div ref={pageRef} className="page-container flex flex-col gap-4">

      {/* Discovery actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Find jobs" className="flex flex-wrap items-center gap-2">
          <Button onClick={() => handleDiscoverLive(false)} disabled={isDiscovering}>
            <RefreshCw className={cn(isDiscovering && "animate-spin")} data-icon="inline-start" aria-hidden />
            {isDiscovering ? "Searching…" : "Find & add jobs"}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="bg-card" onClick={handleScrapeBoards} disabled={isScrapingBoards}>
                <Layers className={cn(isScrapingBoards && "animate-pulse")} data-icon="inline-start" aria-hidden />
                {isScrapingBoards ? "Scraping boards…" : "Scrape all boards"}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {boardList.length
                ? `Scrape ${boardList.length} public job boards for your search or role`
                : "Scrape every supported public job board for your search or role"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                variant="outline"
                pressed={isAutoHunting}
                onPressedChange={setIsAutoHunting}
                className="h-9 bg-card px-3 data-[state=on]:border-[var(--success)] data-[state=on]:bg-card data-[state=on]:text-foreground"
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", isAutoHunting ? "bg-[var(--success)]" : "bg-[var(--border-hover)]")}
                />
                Auto-hunt
              </Toggle>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Keep finding jobs that match your filters and add them to the feed</TooltipContent>
          </Tooltip>
        </div>

        <Separator orientation="vertical" className="mx-1 hidden !h-6 sm:block" />

        <div role="group" aria-label="AI tools" className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            aria-pressed={showAgentSearch}
            onClick={() => setShowAgentSearch(!showAgentSearch)}
            className={cn(showAgentSearch && "bg-accent")}
          >
            <Bot data-icon="inline-start" aria-hidden />
            Agent search
          </Button>
          <Button
            variant="ghost"
            aria-pressed={showAiCombinations}
            onClick={() => {
              if (!showAiCombinations && combinations.length === 0) {
                handleGenerateCombinations();
              } else {
                setShowAiCombinations(!showAiCombinations);
              }
            }}
            className={cn(showAiCombinations && "bg-accent")}
          >
            <Sparkles data-icon="inline-start" aria-hidden />
            AI combinations
            {combinations.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {combinations.filter((c) => c.selected).length}/{combinations.length}
              </span>
            )}
          </Button>
          <Button
            variant="ghost"
            aria-pressed={showCustomBar}
            onClick={() => setShowCustomBar(!showCustomBar)}
            className={cn(showCustomBar && "bg-accent")}
          >
            <Globe data-icon="inline-start" aria-hidden />
            Career URL
          </Button>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" className="ml-auto bg-card" onClick={handleBatchAutoApply} disabled={isBatchAutoApplying}>
              <Zap className={cn(isBatchAutoApplying && "animate-pulse")} data-icon="inline-start" aria-hidden />
              {isBatchAutoApplying
                ? "Collecting jobs…"
                : `Auto-apply all${totalPositions ? ` (${totalPositions.toLocaleString()})` : ""}`}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            Applies to every job matching your filters in the background. Jobs you already applied to are skipped.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Search and filter toolbar. .page-container scrolls and has 24px top padding, so pin flush to its edge. */}
      <div className="sticky -top-6 z-20 rounded-xl border border-border bg-[var(--bg-header)] px-4 py-3 shadow-[var(--shadow-sm)] backdrop-blur-md">
        <JobsToolbar
          filters={filters}
          setFilters={setFilters}
          chips={activeChips}
          onClearAll={() => setFilters(clearedFilters(filters))}
          onOpenFilters={() => setShowAdvanced(true)}
          total={totalPositions}
          fetching={isFetching && !isLoading}
        />
      </div>

      <FiltersDialog
        open={showAdvanced}
        onOpenChange={setShowAdvanced}
        filters={filters}
        onApply={(next) => setFilters(next)}
        facets={data?.facets}
      />

      {/* Agentic Deep Search & Company Intelligence Panel */}
      {showAgentSearch && (
        <div
          className="glass-panel"
          style={{
            padding: "22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "18px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            boxShadow: "var(--shadow-md)",
            position: "relative",
          }}
        >
          {/* Panel Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  backgroundColor: "color-mix(in srgb, var(--brand) 12%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-purple, var(--brand))",
                  border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
                }}
              >
                <Bot size={22} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                    Agentic Deep Search & Company Intelligence
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: "color-mix(in srgb, var(--brand) 10%, transparent)",
                      color: "var(--accent-purple, var(--brand))",
                      fontWeight: 600,
                      border: "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
                    }}
                  >
                    Live Web + Levels.fyi + Glassdoor
                  </span>
                </div>
                <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                  Search by company reputation, Glassdoor rating & salary benchmarks across all positions.
                </p>
              </div>
            </div>

            <button
              className="btn btn-secondary"
              aria-label="Close agent search"
              onClick={() => setShowAgentSearch(false)}
              style={{ padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Search Input & Action */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleRunAgentSearch();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  size={17}
                  color="var(--accent-purple, var(--brand))"
                  style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  type="text"
                  aria-label="Agent search query"
                  placeholder="e.g. Find reputed tech companies paying high compensation for Backend / Distributed Systems in India or Remote..."
                  value={agentQuery}
                  onChange={(e) => setAgentQuery(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px 10px 38px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    backgroundColor: "var(--bg-input)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                  }}
                />
                {agentQuery && (
                  <button
                    type="button"
                    aria-label="Clear agent query"
                    onClick={() => setAgentQuery("")}
                    style={{
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px",
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isAgentSearching || !agentQuery.trim()}
                className="btn btn-primary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "7px",
                  padding: "10px 20px",
                  fontSize: "13px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {isAgentSearching ? (
                  <>
                    <RefreshCw size={14} className="spin-animation" />
                    <span>Researching...</span>
                  </>
                ) : (
                  <>
                    <Zap size={14} />
                    <span>Run Deep Search</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "2px" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>Quick Presets:</span>
              {[
                { label: "Reputed Companies (High Pay)", query: "reputed companies paying high compensation for backend engineer" },
                { label: "Senior Backend (> ₹35 LPA / $150k)", query: "senior backend or distributed systems paying above 35 LPA with good engineering culture" },
                { label: "High-growth YC Unicorns", query: "well-funded YC startups or unicorn companies hiring remote full stack or frontend" },
                { label: "AI / ML Infrastructure", query: "top companies hiring AI engineer or machine learning systems with competitive salary" },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setAgentQuery(preset.query);
                    handleRunAgentSearch(preset.query);
                  }}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </form>

          {/* Stepper indicator when researching */}
          {isAgentSearching && (
            <div
              style={{
                padding: "14px 16px",
                borderRadius: "10px",
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-purple, var(--brand))", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={14} /> Agent Execution Graph in Progress
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Live web queries & LLM synthesis...</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                {[
                  { step: 1, title: "1. Intent & Criteria Parsing", desc: "Deconstructing roles & tier targets" },
                  { step: 2, title: "2. Database Candidate Screening", desc: "Screening 3,000+ local positions" },
                  { step: 3, title: "3. Live Web Research", desc: "Levels.fyi, Glassdoor & company reputation" },
                  { step: 4, title: "4. Multi-Criteria Ranking", desc: "Scoring fit, culture & expected pay" },
                ].map((s) => {
                  const isCurrent = agentSearchStepIndex === s.step;
                  const isDone = agentSearchStepIndex > s.step;
                  return (
                    <div
                      key={s.step}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "8px",
                        backgroundColor: isCurrent ? "color-mix(in srgb, var(--brand) 10%, transparent)" : isDone ? "color-mix(in srgb, var(--success) 10%, transparent)" : "var(--bg-card)",
                        border: isCurrent ? "1px solid color-mix(in srgb, var(--brand) 30%, transparent)" : isDone ? "1px solid color-mix(in srgb, var(--success) 30%, transparent)" : "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600, color: isCurrent ? "var(--accent-purple, var(--brand))" : isDone ? "var(--success)" : "var(--text-muted)" }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>{s.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error Message */}
          {agentSearchError && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)",
                color: "var(--accent-rose, var(--danger))",
                fontSize: "12px",
              }}
            >
              {agentSearchError}
            </div>
          )}

          {/* Agent Results Container */}
          {agentSearchData && agentSearchData.results?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "4px" }}>
              {/* Summary Bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                  padding: "10px 16px",
                  borderRadius: "8px",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    <strong>Evaluated:</strong> {agentSearchData.stats?.totalEvaluatedInDb} jobs across {agentSearchData.stats?.uniqueCompaniesResearched} employers
                  </div>
                  {agentSearchData.parsedIntent?.compensationExpectation && (
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: "color-mix(in srgb, var(--success) 12%, transparent)",
                        color: "var(--success)",
                        border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
                        fontWeight: 600,
                      }}
                    >
                      Target Pay: {agentSearchData.parsedIntent.compensationExpectation}
                    </span>
                  )}
                  {agentSearchData.parsedIntent?.reputationTier && (
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: "color-mix(in srgb, var(--brand) 10%, transparent)",
                        color: "var(--accent-purple, var(--brand))",
                        border: "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
                        fontWeight: 600,
                      }}
                    >
                      Tier: {agentSearchData.parsedIntent.reputationTier}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setAgentSearchData(null)}
                  style={{
                    fontSize: "11px",
                    color: "var(--text-muted)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear Results
                </button>
              </div>

              {/* Cards Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}>
                {agentSearchData.results.map((item: any, idx: number) => {
                  return (
                    <div
                      key={item.id || idx}
                      className="glass-panel"
                      style={{
                        padding: "16px 18px",
                        borderRadius: "10px",
                        backgroundColor: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        boxShadow: "var(--shadow-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      {/* Top Row: Title, Company, Score, Tier */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "260px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <h4
                              onClick={() => setSelectedJobId(item.id)}
                              style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: 700,
                                color: "var(--text-primary)",
                                cursor: "pointer",
                              }}
                            >
                              {item.title}
                            </h4>
                            {/* Tier Badge */}
                            <span
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontWeight: 600,
                                backgroundColor:
                                  item.tierBadgeColor === "emerald"
                                    ? "color-mix(in srgb, var(--success) 12%, transparent)"
                                    : item.tierBadgeColor === "purple"
                                    ? "color-mix(in srgb, var(--brand) 12%, transparent)"
                                    : item.tierBadgeColor === "rose"
                                    ? "color-mix(in srgb, var(--danger) 12%, transparent)"
                                    : "color-mix(in srgb, var(--info) 12%, transparent)",
                                color:
                                  item.tierBadgeColor === "emerald"
                                    ? "var(--success)"
                                    : item.tierBadgeColor === "purple"
                                    ? "var(--accent-purple, var(--brand))"
                                    : item.tierBadgeColor === "rose"
                                    ? "var(--accent-rose, var(--danger))"
                                    : "var(--info)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              {item.companyTier}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "5px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-muted)" }}>
                            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.companyName}</span>
                            {item.location && (
                              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <MapPin size={12} />
                                {item.location.city ? `${item.location.city}, ` : ""}{item.location.country || (item.location.remote ? "Remote" : "Global")}
                              </span>
                            )}
                            {item.reputationScore && (
                              <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--warning)" }}>
                                <Award size={12} /> Rep: {item.reputationScore}/100
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Match Score */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <ScoreRing score={item.agentScore || 85} size={44} strokeWidth={4} />
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-primary)" }}>Agent Fit</span>
                            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Synthesized</span>
                          </div>
                        </div>
                      </div>

                      {/* Middle: Expected Pay & Market Benchmark */}
                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: "8px",
                          backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
                          border: "1px solid color-mix(in srgb, var(--success) 22%, transparent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <DollarSign size={15} color="var(--success)" />
                          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--success)" }}>
                            Expected Pay: {item.expectedPay}
                          </span>
                        </div>
                        {item.payBenchmarkSummary && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            {item.payBenchmarkSummary}
                          </span>
                        )}
                      </div>

                      {/* Why this fits bullets */}
                      {item.whyThisFits && item.whyThisFits.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-muted)" }}>
                            Why this matches your query
                          </span>
                          <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "2px" }}>
                            {item.whyThisFits.map((reason: string, rIdx: number) => (
                              <li key={rIdx}>{reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Company Pros & Footprint */}
                      {item.pros && item.pros.length > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Signals:</span>
                          {item.pros.map((pro: string, pIdx: number) => (
                            <span
                              key={pIdx}
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "var(--bg-secondary)",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              {pro}
                            </span>
                          ))}
                          {item.cons && item.cons.length > 0 && (
                            <span
                              key={item.cons[0]}
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
                                color: "var(--warning)",
                                border: "1px solid color-mix(in srgb, var(--warning) 20%, transparent)",
                              }}
                            >
                              {item.cons[0]}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Actions */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "10px", paddingTop: "6px", borderTop: "1px solid var(--border-subtle)" }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setSelectedJobId(item.id)}
                          style={{ fontSize: "12px", padding: "5px 12px" }}
                        >
                          View Details & Tailor
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={(e) => handleSaveAgentJob(item.id, e)}
                          style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            borderColor: savedAgentJobIds.has(item.id) ? "color-mix(in srgb, var(--success) 50%, transparent)" : undefined,
                            color: savedAgentJobIds.has(item.id) ? "var(--success)" : "var(--text-primary)",
                            backgroundColor: savedAgentJobIds.has(item.id) ? "color-mix(in srgb, var(--success) 10%, transparent)" : undefined,
                          }}
                        >
                          {savedAgentJobIds.has(item.id) ? (
                            <>
                              <BookmarkCheck size={13} color="var(--success)" />
                              <span>Added to Board</span>
                            </>
                          ) : (
                            <>
                              <Bookmark size={13} />
                              <span>+ Add to Board</span>
                            </>
                          )}
                        </button>
                        {item.applyUrl && (
                          <a
                            href={item.applyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-primary"
                            style={{
                              fontSize: "12px",
                              padding: "5px 12px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              textDecoration: "none",
                            }}
                          >
                            <span>Apply on Career Page</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expandable AI Search Expansion & Combinations Panel */}
      {showAiCombinations && (
        <div
          className="glass-panel"
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "color-mix(in srgb, var(--brand) 12%, transparent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-indigo)",
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    AI Search Angles & Keyword Permutations
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: "color-mix(in srgb, var(--brand) 10%, transparent)",
                      color: "var(--accent-indigo)",
                      fontWeight: 600,
                    }}
                  >
                    {combinations.length} Angles
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                  AI expands your keywords into role titles, tech stacks, YC startups, and direct ATS boards to discover hidden jobs.
                </p>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="btn btn-secondary"
                onClick={handleGenerateCombinations}
                disabled={isGeneratingCombinations}
                style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={13} className={isGeneratingCombinations ? "spin-animation" : ""} />
                <span>{isGeneratingCombinations ? "Generating..." : "Regenerate Angles"}</span>
              </button>

              {combinations.length > 0 && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => toggleAllCombinations(combinations.some((c) => !c.selected))}
                    style={{ fontSize: "12px", padding: "6px 10px" }}
                  >
                    {combinations.every((c) => c.selected) ? "Deselect All" : "Select All"}
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={handleCrawlSelectedCombinations}
                    disabled={isCrawlingCombinations || combinations.filter((c) => c.selected).length === 0}
                    style={{
                      fontSize: "12px",
                      padding: "6px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-blue) 100%)",
                      border: "none",
                      color: "var(--on-brand)",
                      fontWeight: 600,
                    }}
                  >
                    <Zap size={14} className={isCrawlingCombinations ? "spin-animation" : ""} />
                    <span>
                      {isCrawlingCombinations
                        ? "Deep-Crawling All Angles..."
                        : `Crawl Selected (${combinations.filter((c) => c.selected).length})`}
                    </span>
                  </button>
                </>
              )}

              <button
                className="btn btn-secondary"
                aria-label="Close AI combinations"
                onClick={() => setShowAiCombinations(false)}
                style={{ padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          {combinations.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "4px" }}>Filter:</span>
              {[
                { id: "all", label: "All Angles" },
                { id: "role", label: "Role synonyms" },
                { id: "stack", label: "Tech stack" },
                { id: "startup_yc", label: "YC & startups" },
                { id: "ats_portal", label: "ATS portals" },
                { id: "intent", label: "High intent" },
              ].map((tab) => {
                const count =
                  tab.id === "all"
                    ? combinations.length
                    : combinations.filter((c) => c.category === tab.id).length;
                if (tab.id !== "all" && count === 0) return null;
                const isActive = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setCategoryFilter(tab.id)}
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "14px",
                      border: isActive ? "1px solid color-mix(in srgb, var(--accent-purple) 60%, transparent)" : "1px solid var(--border-subtle)",
                      backgroundColor: isActive ? "color-mix(in srgb, var(--accent-purple) 20%, transparent)" : "var(--bg-secondary)",
                      color: isActive ? "var(--accent-purple)" : "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{ opacity: 0.7, fontSize: "10px" }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Combinations List / Grid */}
          {isGeneratingCombinations ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                color: "var(--text-muted)",
              }}
            >
              <Sparkles size={24} className="spin-animation" color="var(--accent-purple)" />
              <span>Analyzing resume skills, role synonyms, and ATS targets to generate high-yield search angles...</span>
            </div>
          ) : combinations.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                border: "1px dashed var(--border-subtle)",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                Click "Generate Angles" to create tailored permutations based on your search keywords, role, and active resume skills.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleGenerateCombinations}
                style={{ fontSize: "12px", padding: "6px 14px", background: "linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-blue) 100%)" }}
              >
                <Sparkles size={14} />
                <span>Generate Combinations</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "10px",
                maxHeight: "340px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {combinations
                .filter((c) => categoryFilter === "all" || c.category === categoryFilter)
                .map((combo, idx) => {
                  const globalIdx = combinations.indexOf(combo);
                  const categoryBadgeColor =
                    combo.category === "startup_yc"
                      ? { bg: "color-mix(in srgb, var(--warning) 12%, transparent)", text: "var(--accent-amber)", label: "YC Startup" }
                      : combo.category === "ats_portal"
                      ? { bg: "color-mix(in srgb, var(--success) 12%, transparent)", text: "var(--accent-emerald)", label: "ATS Board" }
                      : combo.category === "stack"
                      ? { bg: "color-mix(in srgb, var(--info) 12%, transparent)", text: "var(--accent-blue)", label: "Tech Stack" }
                      : combo.category === "intent"
                      ? { bg: "color-mix(in srgb, var(--danger) 12%, transparent)", text: "var(--accent-rose)", label: "High Intent" }
                      : { bg: "color-mix(in srgb, var(--brand) 12%, transparent)", text: "var(--accent-purple)", label: "Role Synonym" };

                  return (
                    <div
                      key={combo.query + idx}
                      onClick={() => toggleCombination(globalIdx)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: combo.selected
                          ? "1.5px solid var(--accent-indigo)"
                          : "1px solid var(--border-subtle)",
                        backgroundColor: combo.selected ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "var(--bg-card)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={combo.selected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleCombination(globalIdx);
                            }}
                            style={{ cursor: "pointer" }}
                          />
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={combo.query}
                          >
                            {combo.query}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            backgroundColor: categoryBadgeColor.bg,
                            color: categoryBadgeColor.text,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {categoryBadgeColor.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", flex: 1 }}>
                          {combo.description}
                        </span>
                        <div style={{ display: "flex", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleApplySingleCombination(combo.query)}
                            style={{ fontSize: "10px", padding: "2px 6px", height: "auto" }}
                            title="Filter board view using this exact query"
                          >
                            Filter Board
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Custom career page crawler */}
      {showCustomBar && (
        <form
          onSubmit={handleCrawlCustomCareer}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-[var(--shadow-sm)]"
        >
          <Globe className="ml-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            type="url"
            aria-label="Career page URL"
            placeholder="Paste a career page, e.g. https://boards.greenhouse.io/stripe"
            value={customCareerUrl}
            onChange={(e) => setCustomCareerUrl(e.target.value)}
            className="min-w-[240px] flex-1"
            autoFocus
          />
          <Button type="submit" disabled={isCrawlingCustom || !customCareerUrl.trim()}>
            <Zap className={cn(isCrawlingCustom && "animate-pulse")} data-icon="inline-start" aria-hidden />
            {isCrawlingCustom ? "Extracting and scoring…" : "Crawl and add"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowCustomBar(false)}>
            Cancel
          </Button>
        </form>
      )}

      {isAutoHunting && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground"
        >
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--success)] opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-[var(--success)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-foreground">Auto-hunt is on.</span> Checking LinkedIn, YC and ATS career pages
            every 45 seconds for “{filters.role || filters.search || "Software Engineer"}” in {filters.location || "India"}.
          </span>
          <Button variant="ghost" size="sm" onClick={() => setIsAutoHunting(false)}>
            Stop
          </Button>
        </div>
      )}

      {discoverStatus && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-soft)] px-4 py-2.5 text-sm text-foreground"
        >
          <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
          <span>{discoverStatus}</span>
        </div>
      )}

      <LiveFeed open={showLiveFeed} onClose={() => setShowLiveFeed(false)} onJobsAdded={() => void refetch()} />

      {/* Results */}
      <section aria-label="Job results" aria-busy={isLoading}>
        {isLoading ? (
          <JobListSkeleton count={6} />
        ) : jobsList.length > 0 ? (
          <JobList
            jobs={jobsList}
            pageKey={String(currentPage)}
            renderCard={(job) => (
              <JobCard
                job={job}
                onOpen={() => setSelectedJobId(job.id)}
                onTrack={(e) => handleSaveToKanban(job, e)}
                onApply={(e) => handleApplyQuick(job, e)}
                onAutoApply={(e) => handleTriggerAutoApply(job, e)}
              />
            )}
          />
        ) : (
          <JobListEmpty
            filterCount={activeChips.length}
            query={filters.search || filters.role || "Software Engineer"}
            onClearFilters={() => setFilters(clearedFilters(filters))}
            onSearchWeb={() => handleDiscoverLive(false)}
            searching={isDiscovering}
          />
        )}
      </section>

      {totalPositions > 0 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="font-mono text-xs text-muted-foreground tabular-nums">
            {((currentPage - 1) * pageSize + 1).toLocaleString()}–{Math.min(currentPage * pageSize, totalPositions).toLocaleString()} of{" "}
            {totalPositions.toLocaleString()}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="bg-card" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
              <ChevronLeft data-icon="inline-start" aria-hidden />
              Previous
            </Button>
            <span className="px-2 font-mono text-xs text-muted-foreground tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="bg-card"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
              <ChevronRight data-icon="inline-end" aria-hidden />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="jobs-page-size" className="text-xs font-normal text-muted-foreground">
              Per page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger id="jobs-page-size" size="sm" className="w-[76px] bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectGroup>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </nav>
      )}

      <AutoApplyLauncher
        isOpen={showLauncher}
        onClose={() => setShowLauncher(false)}
        jobIds={launcherIds}
        totalMatching={launcherTotal}
      />

      {/* Auto-Apply Modal */}
      {autoApplyJob && (
        <AutoApplyModal
          job={autoApplyJob}
          isOpen={!!autoApplyJob}
          onClose={() => setAutoApplyJob(null)}
          onAppliedSuccess={async () => {
            await refetch();
          }}
        />
      )}
    </div>
  );
};
