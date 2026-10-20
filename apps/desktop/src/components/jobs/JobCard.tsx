import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Bot, Briefcase, Check, ExternalLink, MapPin, Plus, SearchX, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ATS_OPTIONS } from "./filterModel";

const MAX_SKILLS = 5;
const STAGGER_CAP = 12;

export function companyName(job: any): string {
  return job.company?.name || job.companyName || "Unknown company";
}

export function formatLocation(loc: any): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.country].filter(Boolean) as string[];
  const place = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i).join(", ");
  if (place) return place;
  return loc.remote ? "Remote" : null;
}

function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, notation: "compact", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n / 1000)}k`;
  }
}

export function formatSalary(job: any): string | null {
  const s = job.salary;
  const currency = s?.currency || "USD";
  if (s?.min && s?.max && s.max !== s.min) return `${formatMoney(s.min, currency)}–${formatMoney(s.max, currency)}`;
  if (s?.min || s?.max) return formatMoney(s.min || s.max, currency);
  if (job.salaryMin) return formatMoney(job.salaryMin, "USD");
  return null;
}

export function relativeTime(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

/** 0–100, or null when the job has not been scored. */
export function matchPercent(job: any): number | null {
  const raw = job?.match?.overall ?? job?.matchScore;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.round(raw <= 1 ? raw * 100 : raw);
}

export function sourceLabel(job: any): string | null {
  const id: string | undefined = job?.ats || job?.sourceName;
  if (!id) return null;
  const known = ATS_OPTIONS.find((o) => o.id === id.toLowerCase());
  if (known) return known.label;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function MatchScore({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return null;
  const tier = value >= 80 ? "strong" : value >= 60 ? "good" : "weak";
  return (
    <div className={cn("flex w-24 flex-col items-end gap-1.5 whitespace-nowrap", className)}>
      <span className="text-sm text-muted-foreground">
        <span className="text-base font-semibold text-foreground tabular-nums">{value}%</span> match
      </span>
      <span className="relative h-1 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            tier === "strong" && "bg-[var(--success)]",
            tier === "good" && "bg-primary",
            tier === "weak" && "bg-muted-foreground"
          )}
          style={{ width: `${value}%` }}
        />
      </span>
    </div>
  );
}

export function CompanyMark({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-sm font-semibold text-foreground",
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

interface JobCardProps {
  job: any;
  onOpen: () => void;
  onTrack: (e: React.MouseEvent) => void;
  onApply: (e: React.MouseEvent) => void;
  onAutoApply: (e: React.MouseEvent) => void;
}

export function JobCard({ job, onOpen, onTrack, onApply, onAutoApply }: JobCardProps) {
  const company = companyName(job);
  const location = formatLocation(job.location);
  const salary = formatSalary(job);
  const posted = relativeTime(job.postedAt || job.firstSeenAt);
  const score = matchPercent(job);
  const source = sourceLabel(job);
  const skills: string[] = Array.isArray(job.skills) ? job.skills : [];
  const have = new Set<string>((job.skillsMatch?.youHave ?? []).map((s: string) => s.toLowerCase()));
  const shown = skills.slice(0, MAX_SKILLS);
  const workFormat = job.workFormat && job.workFormat !== location ? job.workFormat : null;

  return (
    <article
      data-job-card
      className={cn(
        "group relative flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)]",
        "has-[[data-card-link]:focus-visible]:border-ring has-[[data-card-link]:focus-visible]:ring-[3px] has-[[data-card-link]:focus-visible]:ring-ring/40",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      )}
    >
      <CompanyMark name={company} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="text-[15px] leading-snug font-semibold tracking-tight text-foreground">
          <button
            type="button"
            data-card-link
            onClick={onOpen}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] group-hover:text-primary"
          >
            {job.title}
          </button>
        </h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{company}</span>
          {location && (
            <>
              <Dot />
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {location}
              </span>
            </>
          )}
          {workFormat && (
            <>
              <Dot />
              <span>{workFormat}</span>
            </>
          )}
          {salary && (
            <>
              <Dot />
              <span className="font-medium text-foreground tabular-nums">{salary}</span>
            </>
          )}
          {posted && (
            <>
              <Dot />
              <time dateTime={job.postedAt || job.firstSeenAt}>{posted}</time>
            </>
          )}
          {source && (
            <>
              <Dot />
              <span>{source}</span>
            </>
          )}
        </div>

        {shown.length > 0 && (
          <ul aria-label="Skills" className="flex flex-wrap gap-1.5 pt-1.5">
            {shown.map((skill, i) => {
              const matched = have.has(skill.toLowerCase());
              return (
                <li key={`${skill}-${i}`}>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md text-[11.5px] font-normal",
                      matched ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {matched && <Check className="text-[var(--success)]" aria-hidden />}
                    {skill}
                    {matched && <span className="sr-only"> (on your resume)</span>}
                  </Badge>
                </li>
              );
            })}
            {skills.length > MAX_SKILLS && (
              <li>
                <Badge variant="outline" className="rounded-md text-[11.5px] font-normal text-muted-foreground">
                  +{skills.length - MAX_SKILLS}
                </Badge>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-5 self-center">
        <MatchScore value={score} />
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onTrack} aria-label={`Track ${job.title} in Applications`}>
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Track in Applications</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={onApply} aria-label={`Apply to ${job.title} on the company site`}>
            Apply
            <ExternalLink data-icon="inline-end" aria-hidden />
          </Button>
          <Button size="sm" onClick={onAutoApply} aria-label={`Auto-apply to ${job.title}`}>
            <Bot data-icon="inline-start" aria-hidden />
            Auto-apply
          </Button>
        </div>
      </div>
    </article>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-[var(--border-hover)]">
      ·
    </span>
  );
}

export function JobList({ jobs, pageKey, renderCard }: { jobs: any[]; pageKey: string; renderCard: (job: any) => React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <ul key={pageKey} className="flex flex-col gap-3" aria-label="Jobs">
      {jobs.map((job, i) => (
        <motion.li
          key={job.id}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, STAGGER_CAP) * 0.035 }}
        >
          {renderCard(job)}
        </motion.li>
      ))}
    </ul>
  );
}

export function JobCardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div aria-hidden className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <Skeleton className="size-10 rounded-lg" />
      <div className="flex flex-1 flex-col gap-2.5">
        <Skeleton className="h-4" style={{ width: `${56 - (index % 4) * 7}%` }} />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-12" />
        </div>
      </div>
      <div className="flex flex-col items-end gap-3">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  );
}

export function JobListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading jobs">
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

export function JobListEmpty({
  filterCount,
  query,
  onClearFilters,
  onSearchWeb,
  searching,
}: {
  filterCount: number;
  query: string;
  onClearFilters: () => void;
  onSearchWeb: () => void;
  searching: boolean;
}) {
  return (
    <Empty className="border border-dashed border-border bg-card/60">
      <EmptyHeader>
        <EmptyMedia variant="icon">{filterCount > 0 ? <SearchX /> : <Briefcase />}</EmptyMedia>
        <EmptyTitle>{filterCount > 0 ? "No jobs match these filters" : "No jobs yet"}</EmptyTitle>
        <EmptyDescription>
          {filterCount > 0
            ? `${filterCount} filter${filterCount === 1 ? " is" : "s are"} narrowing the feed. Loosen them, or search public postings for “${query}”.`
            : `Search public postings for “${query}” to fill your feed.`}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center gap-2">
        {filterCount > 0 && (
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
        <Button onClick={onSearchWeb} disabled={searching}>
          <Sparkles className={cn(searching && "animate-spin")} data-icon="inline-start" aria-hidden />
          {searching ? "Searching the web…" : "Search the web"}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
