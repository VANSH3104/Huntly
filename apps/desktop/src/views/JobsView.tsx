import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { ScoreRing } from "../components/common/ScoreRing";
import { Badge } from "../components/common/Badge";
import { AutoApplyModal } from "../components/AutoApplyModal";
import { AutoApplyLauncher } from "../components/autoapply/AutoApplyLauncher";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Building,
  ExternalLink,
  Sparkles,
  CheckCircle,
  PlusCircle,
  Briefcase,
  DollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Radio,
  Zap,
  Plus,
  Layers,
  Check,
  Flame,
  Rocket,
  X,
  RefreshCw,
  Bot,
  TrendingUp,
  Award,
  ShieldCheck,
  Star,
  Clock,
  Bookmark,
  BookmarkCheck,
  Filter,
} from "lucide-react";
import {
  AdvancedFiltersPanel,
  AdvancedFiltersToggle,
  ActiveFilterChips,
  advancedToParams,
  describeAdvancedChips,
  type FilterChip,
} from "../components/jobs/AdvancedFilters";
import { LiveFeed } from "../components/jobs/LiveFeed";
import type { JobFilterState } from "../types";

const ATS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "yc", label: "YC Startups" },
  { id: "greenhouse", label: "Greenhouse" },
  { id: "lever", label: "Lever" },
  { id: "ashby", label: "Ashby" },
  { id: "workday", label: "Workday" },
  { id: "workable", label: "Workable" },
  { id: "smartrecruiters", label: "SmartRecruiters" },
  { id: "recruitee", label: "Recruitee" },
  { id: "remotive", label: "Remotive" },
  { id: "remoteok", label: "RemoteOK" },
  { id: "arbeitnow", label: "Arbeitnow" },
  { id: "jobicy", label: "Jobicy" },
  { id: "himalayas", label: "Himalayas" },
  { id: "themuse", label: "The Muse" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "workingnomads", label: "Working Nomads" },
  { id: "jobspresso", label: "Jobspresso" },
  { id: "authenticjobs", label: "Authentic Jobs" },
  { id: "nodesk", label: "NoDesk" },
  { id: "justremote", label: "JustRemote" },
  { id: "remote100k", label: "Remote100K" },
  { id: "remoteleaf", label: "RemoteLeaf" },
  { id: "landingjobs", label: "Landing.jobs" },
  { id: "hackernews", label: "Hacker News" },
  { id: "ycombinator", label: "Y Combinator jobs" },
  { id: "simplifyinternships", label: "Simplify internships" },
  { id: "simplifynewgrad", label: "Simplify new grad" },
  { id: "internshala", label: "Internshala" },
  { id: "cutshort", label: "Cutshort" },
  { id: "teamtailor", label: "Teamtailor" },
  { id: "bamboohr", label: "BambooHR" },
  { id: "personio", label: "Personio" },
  { id: "breezy", label: "Breezy HR" },
  { id: "rippling", label: "Rippling" },
  { id: "gemjobs", label: "Gem" },
  { id: "adzuna", label: "Adzuna" },
  { id: "jooble", label: "Jooble" },
  { id: "reed", label: "Reed" },
  { id: "usajobs", label: "USAJOBS" },
  { id: "careerjet", label: "Careerjet" },
  { id: "findwork", label: "Findwork" },
];

const POSTED_LABELS: Record<string, string> = {
  "4h": "Past 4h",
  "9h": "Past 9h",
  "24h": "Past 24h",
  "3d": "Past 3 days",
  "7d": "Past week",
  "30d": "Past month",
};

const toolbarGroupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "3px",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-subtle)",
  background: "var(--bg-secondary)",
  flexWrap: "wrap",
};

const toolbarButtonStyle: React.CSSProperties = {
  fontSize: "12px",
  padding: "6px 12px",
  display: "flex",
  alignItems: "center",
  gap: "6px",
  whiteSpace: "nowrap",
};

const quickToggleStyle = (on: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  color: on ? "var(--text-primary)" : "var(--text-secondary)",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
});

function describeBasicChips(f: JobFilterState): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.search) chips.push({ key: "search", label: `Search: ${f.search}`, clear: { search: "" } });
  if (f.role) chips.push({ key: "role", label: `Role: ${f.role}`, clear: { role: "" } });
  if (f.location) chips.push({ key: "location", label: `Location: ${f.location}`, clear: { location: "" } });
  if (f.ats) {
    const label = ATS_OPTIONS.find((o) => o.id === f.ats)?.label ?? f.ats;
    chips.push({ key: "ats", label: `Source: ${label}`, clear: { ats: "" } });
  }
  if (f.postedWithin && f.postedWithin !== "all") {
    chips.push({ key: "postedWithin", label: POSTED_LABELS[f.postedWithin] ?? f.postedWithin, clear: { postedWithin: "all" } });
  }
  if (f.remoteOnly) chips.push({ key: "remoteOnly", label: "Remote only", clear: { remoteOnly: false } });
  if (f.minScore > 0) chips.push({ key: "minScore", label: `Match ≥ ${f.minScore}%`, clear: { minScore: 0 } });
  return chips;
}

export const JobsView: React.FC = () => {
  const { filters, setFilters, resetFilters, setSelectedJobId } = useStore();
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

  const advancedChips = describeAdvancedChips(filters.advanced);
  const activeChips = [...describeBasicChips(filters), ...advancedChips];

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

  const buildJobParams = (page: number, limit: number) => ({
        search: filters.search,
        role: filters.role,
        specialization: filters.specialization || (filters.specializations || []).join(", "),
        seniority: filters.seniority || (filters.seniorities || []).join(", "),
        workFormat: filters.workFormat || (filters.workFormats || []).join(", "),
        region: filters.region || (filters.regions || []).join(", "),
        sources: filters.sources || (filters.sourceList || []).join(", "),
        skills: filters.skills || (filters.skillList || []).join(", "),
        industry: filters.industry || (filters.industries || []).join(", "),
        collection: filters.collection || (filters.collections || []).join(", "),
        location: filters.location,
        remoteOnly: filters.remoteOnly,
        minScore: filters.minScore > 0 ? filters.minScore : undefined,
        ats: filters.ats,
        status: filters.status,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        postedWithin: filters.postedWithin !== "all" ? filters.postedWithin : undefined,
        hideApplied: filters.hideApplied,
        ...advancedToParams(filters.advanced),
        page,
        limit,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["jobs", filters, currentPage, pageSize],
    queryFn: () => api.jobs.list({ ...buildJobParams(currentPage, pageSize), facets: 1 }),
    placeholderData: (prev) => prev,
  });

  const jobsList: any[] = data?.jobs || [];
  const totalPositions = data?.pagination?.total ?? data?.total ?? jobsList.length ?? 0;
  const totalPages = data?.pagination?.pages ?? Math.max(1, Math.ceil(totalPositions / pageSize));

  const handleDiscoverLive = async (silent = false) => {
    try {
      if (!silent) {
        setIsDiscovering(true);
        setShowLiveFeed(true);
      }
      setDiscoverStatus("Searching live public postings from LinkedIn, YC Startups & Career Pages...");
      const res = await api.crawl.discover({
        keywords: filters.search || filters.role || "Software Engineer",
        role: filters.role,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
      });

      const totalFound = res?.discovered?.total ?? 0;
      setDiscoverStatus(
        `Discovered & added ${totalFound} live positions (${res?.discovered?.linkedin ?? 0} LinkedIn, ${res?.discovered?.careerPages ?? 0} ATS/YC Career Pages) to your board!`
      );
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 6000);
    } catch (err: any) {
      setDiscoverStatus(`Discovery error: ${err.message || "Failed to scrape"}`);
      setTimeout(() => setDiscoverStatus(null), 4000);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleScrapeBoards = async () => {
    const keywords = (filters.search || filters.role).trim() || undefined;
    try {
      setIsScrapingBoards(true);
      setShowLiveFeed(true);
      setDiscoverStatus(`Scraping all job boards${keywords ? ` for "${keywords}"` : ""}...`);
      const res = await api.crawl.boards({ keywords });
      const failed = res.perBoard.filter((b) => b.error).map((b) => b.board);
      setDiscoverStatus(
        `Scraped ${res.scraped} postings from ${res.perBoard.length} boards: ${res.added} added, ${res.updated} updated` +
          (failed.length ? ` (failed: ${failed.join(", ")})` : "")
      );
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 8000);
    } catch (err: any) {
      setDiscoverStatus(`Board scrape error: ${err.message || "Failed to scrape boards"}`);
      setTimeout(() => setDiscoverStatus(null), 5000);
    } finally {
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
      setDiscoverStatus(`Extracting verified jobs from ${customCareerUrl}...`);
      const res = await api.crawl.crawlCareerPage({ url: customCareerUrl.trim() });
      setDiscoverStatus(`Added ${res.addedJobs} verified jobs from ${res.company || "career page"} to the board!`);
      setCustomCareerUrl("");
      setShowCustomBar(false);
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 6000);
    } catch (err: any) {
      setDiscoverStatus(`Failed to crawl career page: ${err.message}`);
      setTimeout(() => setDiscoverStatus(null), 5000);
    } finally {
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
    } catch (err: any) {
      alert(`AI expansion error: ${err.message || "Failed to generate combinations"}`);
    } finally {
      setIsGeneratingCombinations(false);
    }
  };

  const handleCrawlSelectedCombinations = async () => {
    const selectedQueries = combinations.filter((c) => c.selected).map((c) => c.query);
    if (selectedQueries.length === 0) {
      alert("Please select at least one search combination.");
      return;
    }

    try {
      setIsCrawlingCombinations(true);
      setDiscoverStatus(`AI is deep-crawling ${selectedQueries.length} combinations across LinkedIn, YC & ATS portals...`);
      const res = await api.crawl.deepSearch({
        queries: selectedQueries,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
        limitPerQuery: 15,
      });

      setDiscoverStatus(`Discovered & added ${res.totalAdded} positions across ${selectedQueries.length} combinations to the board!`);
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 8000);
    } catch (err: any) {
      setDiscoverStatus(`Deep search error: ${err.message || "Failed to complete search"}`);
      setTimeout(() => setDiscoverStatus(null), 5000);
    } finally {
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
      alert("Job saved to Applications Kanban!");
    } catch (err: any) {
      alert(err.message || "Already in applications");
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
    } catch (err: any) {
      alert(err.message || "Could not load the filtered jobs");
    } finally {
      setIsBatchAutoApplying(false);
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Search & filter toolbar: row one search + actions, row two quick filters */}
      <div
        className="glass-panel"
        style={{
          position: "sticky",
          // .page-container is the scroller and has 24px top padding; pin flush to its edge.
          top: "-24px",
          zIndex: 20,
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: "200px" }}>
            <Search
              size={16}
              color="var(--text-muted)"
              style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              aria-label="Search jobs"
              placeholder="Search keywords, tech stack, titles (comma-separate terms)..."
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              style={{ width: "100%", paddingLeft: "36px", paddingRight: filters.search ? "32px" : "12px" }}
            />
            {filters.search && (
              <button
                aria-label="Clear search"
                onClick={() => setFilters({ search: "" })}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  padding: "2px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Find jobs group */}
          <div role="group" aria-label="Find jobs" style={toolbarGroupStyle}>
            <button
              className="btn btn-primary"
              onClick={() => handleDiscoverLive(false)}
              disabled={isDiscovering}
              style={toolbarButtonStyle}
            >
              <RefreshCw size={13} className={isDiscovering ? "animate-spin" : ""} />
              <span>{isDiscovering ? "Searching..." : "Find & Add Jobs"}</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleScrapeBoards}
              disabled={isScrapingBoards}
              style={toolbarButtonStyle}
              title={
                boardList.length
                  ? `Scrape ${boardList.length} public job boards: ${boardList.map((b) => b.label).join(", ")}`
                  : "Scrape every supported public job board for your search or role"
              }
            >
              <Layers size={13} className={isScrapingBoards ? "animate-spin" : ""} />
              <span>{isScrapingBoards ? "Scraping boards..." : "Scrape all boards"}</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setIsAutoHunting(!isAutoHunting)}
              aria-pressed={isAutoHunting}
              style={{
                ...toolbarButtonStyle,
                color: isAutoHunting ? "var(--accent-emerald)" : "var(--text-secondary)",
                borderColor: isAutoHunting ? "var(--accent-emerald)" : undefined,
              }}
              title="Automatically keeps finding real jobs matching your filters and adds them live to the board"
            >
              <Radio size={13} />
              <span>{isAutoHunting ? "Auto-Hunt: ON" : "Auto-Hunt"}</span>
            </button>
          </div>

          {/* AI tools group */}
          <div role="group" aria-label="AI tools" style={toolbarGroupStyle}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowAgentSearch(!showAgentSearch)}
              aria-pressed={showAgentSearch}
              style={{
                ...toolbarButtonStyle,
                color: "var(--accent-purple)",
                borderColor: showAgentSearch ? "var(--accent-purple)" : undefined,
                fontWeight: 600,
              }}
              title="Agentic Search: Live web research on company reputation, Glassdoor & salary benchmarks"
            >
              <Bot size={14} />
              <span>Agent Search</span>
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (!showAiCombinations && combinations.length === 0) {
                  handleGenerateCombinations();
                } else {
                  setShowAiCombinations(!showAiCombinations);
                }
              }}
              aria-pressed={showAiCombinations}
              style={{
                ...toolbarButtonStyle,
                color: showAiCombinations ? "var(--accent-purple)" : "var(--text-secondary)",
                borderColor: showAiCombinations ? "var(--accent-purple)" : undefined,
              }}
              title="AI generates all permutations and combinations of your filters"
            >
              <Sparkles size={13} color="var(--accent-purple)" />
              <span>AI Combinations</span>
              {combinations.length > 0 && (
                <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--accent-purple)" }}>
                  {combinations.filter((c) => c.selected).length}/{combinations.length}
                </span>
              )}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setShowCustomBar(!showCustomBar)}
              aria-pressed={showCustomBar}
              style={toolbarButtonStyle}
              title="Crawl any specific company career page or YC link"
            >
              <Globe size={13} />
              <span>+ Career URL</span>
            </button>
          </div>

          <button
            className="btn"
            onClick={handleBatchAutoApply}
            disabled={isBatchAutoApplying}
            style={{
              ...toolbarButtonStyle,
              padding: "7px 14px",
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "#ffffff",
              border: "none",
              fontWeight: 600,
              boxShadow: "var(--shadow-sm)",
              cursor: isBatchAutoApplying ? "not-allowed" : "pointer",
            }}
            title="Applies to every job matching your current filters in the background. Jobs you already applied to are skipped."
          >
            <Zap size={14} className={isBatchAutoApplying ? "animate-spin" : ""} />
            <span>{isBatchAutoApplying ? "Collecting jobs..." : `Auto-Apply all${totalPositions ? ` (${totalPositions})` : ""}`}</span>
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <input
            type="text"
            aria-label="Role"
            placeholder="Role (e.g. Backend, Frontend, ML)"
            value={filters.role}
            onChange={(e) => setFilters({ role: e.target.value })}
            style={{ flex: "1 1 170px", maxWidth: "220px" }}
          />
          <input
            type="text"
            aria-label="Location"
            placeholder="Location (e.g. Bengaluru, Remote)"
            value={filters.location}
            onChange={(e) => setFilters({ location: e.target.value })}
            style={{ flex: "1 1 160px", maxWidth: "210px" }}
          />
          <select
            aria-label="ATS or job board"
            value={filters.ats}
            onChange={(e) => setFilters({ ats: e.target.value })}
            style={{ width: "170px" }}
          >
            <option value="">All ATS & boards</option>
            {ATS_OPTIONS.map((o) => {
              const count = data?.facets?.ats.find((b) => b.value === o.id)?.count;
              return (
                <option key={o.id} value={o.id}>
                  {count !== undefined ? `${o.label} (${count})` : o.label}
                </option>
              );
            })}
          </select>
          <select
            aria-label="Posted within"
            value={filters.postedWithin || "all"}
            onChange={(e) => setFilters({ postedWithin: e.target.value as any })}
            style={{ width: "140px" }}
            title="Filter by when the position was posted"
          >
            <option value="all">Any time</option>
            <option value="4h">Past 4 hours</option>
            <option value="9h">Past 9 hours</option>
            <option value="24h">Past 24 hours</option>
            <option value="3d">Past 3 days</option>
            <option value="7d">Past week</option>
            <option value="30d">Past month</option>
          </select>
          <label style={quickToggleStyle(filters.remoteOnly)}>
            <input
              type="checkbox"
              checked={filters.remoteOnly}
              onChange={(e) => setFilters({ remoteOnly: e.target.checked })}
            />
            <span>Remote only</span>
          </label>
          <label
            style={quickToggleStyle(filters.hideApplied !== false)}
            title="Exclude positions already tracked or applied on your Kanban board"
          >
            <input
              type="checkbox"
              checked={filters.hideApplied !== false}
              onChange={(e) => setFilters({ hideApplied: e.target.checked })}
            />
            <span>Hide applied</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap", fontSize: "12px", color: "var(--text-muted)" }}>
            <span>Min match: {filters.minScore}%</span>
            <input
              type="range"
              min="0"
              max="95"
              step="5"
              value={filters.minScore}
              onChange={(e) => setFilters({ minScore: parseInt(e.target.value, 10) })}
              style={{ width: "85px", cursor: "pointer" }}
            />
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
            <AdvancedFiltersToggle
              open={showAdvanced}
              activeCount={advancedChips.length}
              onToggle={() => setShowAdvanced(!showAdvanced)}
            />
            {activeChips.length > 0 && (
              <button
                className="btn btn-ghost"
                onClick={resetFilters}
                style={{ fontSize: "12px", padding: "6px 10px" }}
                title="Reset all filters to default"
              >
                Reset all
              </button>
            )}
          </div>
        </div>
      </div>

      {showAdvanced && (
        <AdvancedFiltersPanel
          value={filters.advanced}
          onChange={(advanced) => setFilters({ advanced })}
          facets={data?.facets}
        />
      )}

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
                  backgroundColor: "rgba(124, 58, 237, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-purple, #7c3aed)",
                  border: "1px solid rgba(124, 58, 237, 0.25)",
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
                      backgroundColor: "rgba(124, 58, 237, 0.1)",
                      color: "var(--accent-purple, #7c3aed)",
                      fontWeight: 600,
                      border: "1px solid rgba(124, 58, 237, 0.2)",
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
                  color="var(--accent-purple, #7c3aed)"
                  style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  type="text"
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
                { label: "⭐ Reputed Companies (High Pay)", query: "reputed companies paying high compensation for backend engineer" },
                { label: "💰 Senior Backend (> ₹35 LPA / $150k)", query: "senior backend or distributed systems paying above 35 LPA with good engineering culture" },
                { label: "🚀 High-Growth YC Unicorns", query: "well-funded YC startups or unicorn companies hiring remote full stack or frontend" },
                { label: "🧠 AI / ML Infrastructure", query: "top companies hiring AI engineer or machine learning systems with competitive salary" },
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
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-purple, #7c3aed)", display: "flex", alignItems: "center", gap: "6px" }}>
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
                        backgroundColor: isCurrent ? "rgba(124, 58, 237, 0.1)" : isDone ? "rgba(16, 185, 129, 0.1)" : "var(--bg-card)",
                        border: isCurrent ? "1px solid rgba(124, 58, 237, 0.3)" : isDone ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600, color: isCurrent ? "var(--accent-purple, #7c3aed)" : isDone ? "var(--accent-emerald, #059669)" : "var(--text-muted)" }}>
                        {isDone ? "✓ " : isCurrent ? "⚡ " : ""}{s.title}
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
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                color: "var(--accent-rose, #e11d48)",
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
                        backgroundColor: "rgba(16, 185, 129, 0.12)",
                        color: "var(--accent-emerald, #059669)",
                        border: "1px solid rgba(16, 185, 129, 0.25)",
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
                        backgroundColor: "rgba(124, 58, 237, 0.1)",
                        color: "var(--accent-purple, #7c3aed)",
                        border: "1px solid rgba(124, 58, 237, 0.2)",
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
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : item.tierBadgeColor === "purple"
                                    ? "rgba(124, 58, 237, 0.12)"
                                    : item.tierBadgeColor === "rose"
                                    ? "rgba(225, 29, 72, 0.12)"
                                    : "rgba(37, 99, 235, 0.12)",
                                color:
                                  item.tierBadgeColor === "emerald"
                                    ? "var(--accent-emerald, #059669)"
                                    : item.tierBadgeColor === "purple"
                                    ? "var(--accent-purple, #7c3aed)"
                                    : item.tierBadgeColor === "rose"
                                    ? "var(--accent-rose, #e11d48)"
                                    : "var(--accent-blue, #2563eb)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              ⭐ {item.companyTier}
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
                              <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--accent-amber, #d97706)" }}>
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
                          backgroundColor: "rgba(16, 185, 129, 0.08)",
                          border: "1px solid rgba(16, 185, 129, 0.22)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <DollarSign size={15} color="var(--accent-emerald, #059669)" />
                          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--accent-emerald, #059669)" }}>
                            Expected Pay: {item.expectedPay}
                          </span>
                        </div>
                        {item.payBenchmarkSummary && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            📊 {item.payBenchmarkSummary}
                          </span>
                        )}
                      </div>

                      {/* Why this fits bullets */}
                      {item.whyThisFits && item.whyThisFits.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Why this matches your query:
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
                              ✓ {pro}
                            </span>
                          ))}
                          {item.cons && item.cons.length > 0 && (
                            <span
                              key={item.cons[0]}
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "rgba(217, 119, 6, 0.08)",
                                color: "var(--accent-amber, #d97706)",
                                border: "1px solid rgba(217, 119, 6, 0.2)",
                              }}
                            >
                              ⚠ {item.cons[0]}
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
                            borderColor: savedAgentJobIds.has(item.id) ? "rgba(16, 185, 129, 0.5)" : undefined,
                            color: savedAgentJobIds.has(item.id) ? "var(--accent-emerald, #059669)" : "var(--text-primary)",
                            backgroundColor: savedAgentJobIds.has(item.id) ? "rgba(16, 185, 129, 0.1)" : undefined,
                          }}
                        >
                          {savedAgentJobIds.has(item.id) ? (
                            <>
                              <BookmarkCheck size={13} color="var(--accent-emerald, #059669)" />
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
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
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
                      backgroundColor: "rgba(99, 102, 241, 0.1)",
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
                      background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)",
                      border: "none",
                      color: "#fff",
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
                { id: "role", label: "🎯 Role Synonyms" },
                { id: "stack", label: "⚡ Tech Stack" },
                { id: "startup_yc", label: "🚀 YC & Startups" },
                { id: "ats_portal", label: "🏢 ATS Portals" },
                { id: "intent", label: "🔥 High Intent" },
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
                      border: isActive ? "1px solid rgba(168, 85, 247, 0.6)" : "1px solid rgba(255, 255, 255, 0.08)",
                      backgroundColor: isActive ? "rgba(168, 85, 247, 0.2)" : "rgba(255, 255, 255, 0.03)",
                      color: isActive ? "#c084fc" : "var(--text-secondary)",
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
              <Sparkles size={24} className="spin-animation" color="#a855f7" />
              <span>Analyzing resume skills, role synonyms, and ATS targets to generate high-yield search angles...</span>
            </div>
          ) : combinations.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                Click "Generate Angles" to create tailored permutations based on your search keywords, role, and active resume skills.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleGenerateCombinations}
                style={{ fontSize: "12px", padding: "6px 14px", background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)" }}
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
                      ? { bg: "rgba(217, 119, 6, 0.12)", text: "var(--accent-amber)", label: "YC Startup" }
                      : combo.category === "ats_portal"
                      ? { bg: "rgba(5, 150, 105, 0.12)", text: "var(--accent-emerald)", label: "ATS Board" }
                      : combo.category === "stack"
                      ? { bg: "rgba(37, 99, 235, 0.12)", text: "var(--accent-blue)", label: "Tech Stack" }
                      : combo.category === "intent"
                      ? { bg: "rgba(225, 29, 72, 0.12)", text: "var(--accent-rose)", label: "High Intent" }
                      : { bg: "rgba(124, 58, 237, 0.12)", text: "var(--accent-purple)", label: "Role Synonym" };

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
                        backgroundColor: combo.selected ? "rgba(79, 70, 229, 0.08)" : "var(--bg-card)",
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
                              fontFamily: "var(--font-mono)",
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

      {/* Expandable Custom Career Page Crawler Bar */}
      {showCustomBar && (
        <form
          onSubmit={handleCrawlCustomCareer}
          className="glass-panel"
          style={{
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Globe size={18} color="var(--accent-indigo)" />
          <input
            type="url"
            placeholder="Paste any company career page (e.g. https://t.me/careers, https://boards.greenhouse.io/stripe, or YC company link)"
            value={customCareerUrl}
            onChange={(e) => setCustomCareerUrl(e.target.value)}
            style={{ flex: 1, padding: "8px 14px", fontSize: "13px" }}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isCrawlingCustom || !customCareerUrl.trim()}
            style={{ fontSize: "13px", padding: "8px 16px" }}
          >
            <Zap size={14} />
            <span>{isCrawlingCustom ? "Extracting & Scoring..." : "Crawl & Add to Board"}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCustomBar(false)}
            style={{ fontSize: "12px", padding: "8px 12px" }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Auto-Hunting Active Pulse Indicator */}
      {isAutoHunting && (
        <div
          className="glass-panel"
          style={{
            padding: "10px 18px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-emerald)", boxShadow: "0 0 8px var(--accent-emerald)" }} />
          <span>
            <strong>Continuous Filter-Hunting Active:</strong> Auto-scanning LinkedIn, YC Startups, and ATS career pages every 45s for{" "}
            <em>"{filters.role || filters.search || "Software Engineer"}" in "{filters.location || "India"}"</em> and streaming new jobs directly onto your board.
          </span>
        </div>
      )}

      {/* Discovery Status Banner */}
      {discoverStatus && (
        <div
          className="glass-panel"
          style={{
            padding: "12px 18px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Sparkles size={16} color="var(--accent-indigo)" />
          <span>{discoverStatus}</span>
        </div>
      )}

      <LiveFeed open={showLiveFeed} onClose={() => setShowLiveFeed(false)} onJobsAdded={() => void refetch()} />

      {/* Results Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ fontSize: "14px", color: "var(--text-secondary)" }} aria-live="polite">
            <span style={{ color: "var(--text-primary)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "16px" }}>
              {totalPositions.toLocaleString()}
            </span>{" "}
            {totalPositions === 1 ? "position" : "positions"}
            {activeChips.length > 0 && (
              <span style={{ color: "var(--text-muted)" }}>
                {" "}· {activeChips.length} filter{activeChips.length === 1 ? "" : "s"} applied
              </span>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)" }}>
            Sort by
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ sortBy: e.target.value as any })}
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              <option value="matchScore">Highest Match Score</option>
              <option value="postedAt">Most Recent</option>
              <option value="salary">Highest Salary</option>
              <option value="relevance">Most Relevant (needs search)</option>
            </select>
          </label>
        </div>
        <ActiveFilterChips chips={activeChips} onClear={(chip) => setFilters(chip.clear)} />
      </div>

      {/* Jobs List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-busy={isLoading}>
        {isLoading ? (
          Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="glass-panel"
              aria-hidden="true"
              style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "18px", borderRadius: "var(--radius-lg)" }}
            >
              <div className="skeleton-shimmer" style={{ width: "44px", height: "44px", borderRadius: "var(--radius-full)", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
                <div className="skeleton-shimmer" style={{ height: "14px", width: `${55 - i * 4}%` }} />
                <div className="skeleton-shimmer" style={{ height: "11px", width: "35%" }} />
                <div style={{ display: "flex", gap: "6px" }}>
                  <div className="skeleton-shimmer" style={{ height: "18px", width: "60px" }} />
                  <div className="skeleton-shimmer" style={{ height: "18px", width: "72px" }} />
                  <div className="skeleton-shimmer" style={{ height: "18px", width: "50px" }} />
                </div>
              </div>
              <div className="skeleton-shimmer" style={{ height: "30px", width: "92px", flexShrink: 0 }} />
            </div>
          ))
        ) : jobsList.length > 0 ? (
          jobsList.map((job: any) => {
            const rawScore = job.match?.overall ?? job.matchScore ?? 85;
            const matchScore = rawScore > 1 ? rawScore / 100 : rawScore;
            const salary = job.salary?.min
              ? `$${(job.salary.min / 1000).toFixed(0)}k - $${(job.salary.max / 1000).toFixed(0)}k`
              : (job.salaryMin ? `$${(job.salaryMin / 1000).toFixed(0)}k` : null);

            return (
              <div
                key={job.id}
                className="glass-panel glass-panel-hover"
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "18px",
                  cursor: "pointer",
                  borderRadius: "var(--radius-lg)",
                }}
                onClick={() => setSelectedJobId(job.id)}
              >
                {/* Score Ring */}
                <ScoreRing score={matchScore} size={46} strokeWidth={4} />

                {/* Company Logo Avatar */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(79, 70, 229, 0.08)",
                    border: "1px solid rgba(79, 70, 229, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent-indigo)",
                    flexShrink: 0,
                  }}
                >
                  {(job.company?.name || job.companyName || "C").charAt(0).toUpperCase()}
                </div>

                {/* Main Information */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3
                      style={{
                        fontSize: "14.5px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {job.title}
                    </h3>

                    {job.ats && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {job.ats.toUpperCase()}
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 7px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(79, 70, 229, 0.08)",
                        color: "var(--accent-indigo)",
                        border: "1px solid rgba(79, 70, 229, 0.18)",
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      VERIFIED
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      marginTop: "5px",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {job.company?.name || job.companyName || "Verified Tech Company"}
                    </span>

                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
                      <MapPin size={13} />
                      {job.location?.city
                        ? `${job.location.city}${job.location.country ? `, ${job.location.country}` : ""}`
                        : (job.location?.remote ? "Remote" : "India / Hybrid")}
                    </span>

                    {salary && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--accent-indigo)", fontWeight: 600 }}>
                        <DollarSign size={13} />
                        {salary}
                      </span>
                    )}
                  </div>

                  {/* Skills tags preview */}
                  {job.skills && job.skills.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "5px",
                        marginTop: "8px",
                      }}
                    >
                      {job.skills.slice(0, 6).map((skill: string, i: number) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "10.5px",
                            fontFamily: "var(--font-mono)",
                            padding: "2px 7px",
                            backgroundColor: "var(--bg-surface)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "4px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-secondary"
                    onClick={(e) => handleSaveToKanban(job, e)}
                    style={{ height: "30px", padding: "0 10px", fontSize: "11.5px" }}
                    title="Save to Applications Tracker"
                  >
                    <PlusCircle size={13} />
                    <span>Track</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={(e) => handleApplyQuick(job, e)}
                    style={{ height: "30px", padding: "0 12px", fontSize: "11.5px" }}
                    title="Open direct job application link"
                  >
                    <span>Apply</span>
                    <ExternalLink size={12} />
                  </button>

                  <button
                    className="btn"
                    onClick={(e) => handleTriggerAutoApply(job, e)}
                    style={{
                      height: "30px",
                      padding: "0 12px",
                      fontSize: "11.5px",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: 600,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Autonomous Agent: Navigates to job portal via Playwright, fills details from active resume, and submits"
                  >
                    <Bot size={13} />
                    <span>Auto-Apply</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div
            className="glass-panel"
            style={{
              padding: "64px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <Briefcase size={40} color="var(--accent-cyan)" />
            <div style={{ fontSize: "16px", fontWeight: 600 }}>No jobs found for these criteria</div>
            {activeChips.length > 0 && (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
                <span>
                  {activeChips.length} filter{activeChips.length === 1 ? " is" : "s are"} narrowing the results.
                </span>
                <button className="btn btn-secondary" onClick={resetFilters} style={{ fontSize: "12px", padding: "5px 12px" }}>
                  Clear all filters
                </button>
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "460px", lineHeight: "1.5" }}>
              Would you like to search the public web and scrape live LinkedIn postings for{" "}
              <strong style={{ color: "var(--accent-cyan)" }}>
                "{filters.search || filters.role || "these criteria"}"
              </strong>
              ?
            </div>
            <button
              className="btn btn-primary"
              onClick={() => handleDiscoverLive(false)}
              disabled={isDiscovering}
              style={{
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 22px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "8px",
                background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
              }}
            >
              <Sparkles size={16} className={isDiscovering ? "spin-animation" : ""} />
              <span>
                {isDiscovering
                  ? "Scraping LinkedIn & Web..."
                  : `Scrape Live Web for "${filters.search || filters.role || "Jobs"}"`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Pagination Bar */}
      {totalPositions > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "8px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalPositions)} of {totalPositions} jobs
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="btn"
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage <= 1}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                fontSize: "12px",
                opacity: currentPage <= 1 ? 0.4 : 1,
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--accent-cyan)",
                padding: "4px 12px",
                borderRadius: "6px",
                background: "rgba(6, 182, 212, 0.1)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Page {currentPage} of {totalPages}
            </div>

            <button
              className="btn"
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage >= totalPages}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                fontSize: "12px",
                opacity: currentPage >= totalPages ? 0.4 : 1,
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
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
