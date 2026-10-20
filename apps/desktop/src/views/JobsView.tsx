import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { AutoApplyModal } from "../components/AutoApplyModal";
import { AutoApplyLauncher } from "../components/autoapply/AutoApplyLauncher";
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Zap,
  Layers,
  Bot,
  Sparkles,
  Search,
} from "lucide-react";
import { FiltersDialog } from "../components/jobs/FiltersDialog";
import { FindJobsDialog, FindJobsStatusChip } from "../components/jobs/FindJobsDialog";
import { useJobSources, type FindMethod } from "../components/jobs/useJobSources";
import { JobsToolbar } from "../components/jobs/JobsToolbar";
import { JobCard, JobList, JobListEmpty, JobListSkeleton } from "../components/jobs/JobCard";
import { buildJobParams as buildParams, clearedFilters, describeFilterChips } from "../components/jobs/filterModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { errorMessage, toast } from "@/lib/notify";

export const JobsView: React.FC = () => {
  const { filters, setFilters, setSelectedJobId } = useStore();
  const sources = useJobSources();
  const [findOpen, setFindOpen] = React.useState(false);
  const [findMethod, setFindMethod] = React.useState<FindMethod>("quick");

  const openFind = (m: FindMethod) => {
    setFindMethod(m);
    setFindOpen(true);
  };

  const [autoApplyJob, setAutoApplyJob] = React.useState<any | null>(null);
  const [isBatchAutoApplying, setIsBatchAutoApplying] = React.useState(false);
  const [showLauncher, setShowLauncher] = React.useState(false);
  const [launcherIds, setLauncherIds] = React.useState<string[]>([]);
  const [launcherTotal, setLauncherTotal] = React.useState(0);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const activeChips = describeFilterChips(filters);
  const pageRef = React.useRef<HTMLDivElement>(null);

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

  const handleApplyQuick = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.applications.create({
        jobId: job.id,
        status: "applied",
        notes: "Quick applied from feed",
      });
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
          <Button onClick={() => openFind("quick")} disabled={sources.quick.running}>
            <Search className={cn(sources.quick.running && "animate-spin")} data-icon="inline-start" aria-hidden />
            {sources.quick.running ? "Searching…" : "Find & add jobs"}
          </Button>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" className="bg-card" onClick={() => openFind("scrape")} disabled={sources.scrape.running}>
                <Layers className={cn(sources.scrape.running && "animate-pulse")} data-icon="inline-start" aria-hidden />
                {sources.scrape.running ? "Scraping boards…" : "Scrape all boards"}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {sources.boardCount
                ? `Scrape ${sources.boardCount} public job boards for your search or role`
                : "Scrape every supported public job board for your search or role"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                variant="outline"
                pressed={sources.autoHunt.enabled}
                onPressedChange={() => sources.autoHunt.setEnabled(!sources.autoHunt.enabled)}
                className="h-9 bg-card px-3 data-[state=on]:border-[var(--success)] data-[state=on]:bg-card data-[state=on]:text-foreground"
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", sources.autoHunt.enabled ? "bg-[var(--success)]" : "bg-[var(--border-hover)]")}
                />
                Auto-hunt
              </Toggle>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">Keep finding jobs that match your filters and add them to the feed</TooltipContent>
          </Tooltip>

          <FindJobsStatusChip sources={sources} onOpen={openFind} />
        </div>

        <Separator orientation="vertical" className="mx-1 hidden !h-6 sm:block" />

        <div role="group" aria-label="AI tools" className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" onClick={() => openFind("agent")}>
            <Bot data-icon="inline-start" aria-hidden />
            Agent search
          </Button>
          <Button variant="ghost" onClick={() => openFind("combos")}>
            <Sparkles data-icon="inline-start" aria-hidden />
            AI combinations
            {sources.combos.items.length > 0 && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {sources.combos.items.filter((c) => c.selected).length}/{sources.combos.items.length}
              </span>
            )}
          </Button>
          <Button variant="ghost" onClick={() => openFind("career")}>
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

      <FindJobsDialog
        open={findOpen}
        onOpenChange={setFindOpen}
        method={findMethod}
        onMethodChange={setFindMethod}
        sources={sources}
        onOpenJob={(id) => setSelectedJobId(id)}
        onFilterFeed={(q) => setFilters({ search: q })}
      />

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
            onSearchWeb={() => openFind("quick")}
            searching={sources.quick.running}
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
