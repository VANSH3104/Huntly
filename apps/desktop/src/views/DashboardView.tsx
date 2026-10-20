import React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Briefcase,
  Building2,
  CheckSquare,
  Compass,
  MapPin,
  Sparkles,
  Target,
} from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { ScoreRing } from "../components/common/ScoreRing";
import { Badge } from "../components/common/Badge";
import {
  PageContainer,
  Panel,
  PanelBody,
  PanelHeader,
  StatCard,
  EventTimeline,
  listContainer,
  listItem,
} from "../components/common/PagePrimitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

function jobLocation(job: any): string {
  const loc = job.location;
  if (!loc) return "Location not listed";
  const place = [loc.city, loc.country].filter(Boolean).join(", ");
  if (loc.remote) return place ? `Remote · ${place}` : "Remote";
  return place || "Location not listed";
}

export const DashboardView: React.FC = () => {
  const { setCurrentTab, setSelectedJobId } = useStore();

  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => api.analytics.getOverview(),
  });

  const { data: topJobs, isLoading: isJobsLoading } = useQuery({
    queryKey: ["jobs", "top"],
    queryFn: () => api.jobs.list({ limit: 5, sortBy: "matchScore", sortOrder: "desc" }),
  });

  const { data: crawlEvents, isLoading: isEventsLoading } = useQuery({
    queryKey: ["crawl", "events", 8],
    queryFn: () => api.crawl.events(8),
    refetchInterval: 5000,
  });

  const stats = [
    {
      label: "Active jobs",
      value: analytics?.activeJobs ?? analytics?.totalJobs,
      hint: analytics?.newToday != null ? `+${analytics.newToday.toLocaleString()} discovered today` : "Verified open positions",
      icon: Briefcase,
      accent: true,
    },
    {
      label: "Strong matches",
      value: analytics?.highMatchJobs,
      hint: "Roles above your match threshold",
      icon: Target,
    },
    {
      label: "Companies",
      value: analytics?.totalCompanies,
      hint: "Employers with open roles",
      icon: Building2,
    },
    {
      label: "Applications",
      value: analytics?.totalApplications ?? analytics?.activeApplications,
      hint: "Tracked in your pipeline",
      icon: CheckSquare,
    },
  ];

  const jobs: any[] = topJobs?.jobs ?? [];
  const events: any[] = crawlEvents ?? [];

  return (
    <PageContainer className="flex flex-col gap-6">
      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((s, i) => (
          <StatCard key={s.label} index={i} {...s} loading={isAnalyticsLoading} />
        ))}
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            icon={Sparkles}
            title="Top matches"
            description="Highest scoring roles against your active resume"
            action={
              <Button variant="ghost" size="sm" onClick={() => setCurrentTab("jobs")}>
                View all
                <ArrowRight data-icon="inline-end" />
              </Button>
            }
          />
          <PanelBody className="gap-2">
            {isJobsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-4">
                  <Skeleton className="size-12 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))
            ) : jobs.length > 0 ? (
              <motion.ul variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-2">
                {jobs.map((job, i) => (
                  <motion.li key={job.id} variants={listItem} custom={i}>
                    <button
                      type="button"
                      onClick={() => setSelectedJobId(job.id)}
                      className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--brand-line)] hover:bg-[var(--bg-card-hover)] hover:shadow-[var(--shadow-sm)]"
                    >
                      <ScoreRing score={job.matchScore ?? 0} size={46} strokeWidth={4} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[14px] font-medium text-foreground">{job.title}</span>
                        <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
                          <span className="truncate font-medium text-foreground/80">
                            {job.companyName || job.company?.name || "Unknown company"}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <MapPin className="size-3 shrink-0" aria-hidden />
                            <span className="truncate">{jobLocation(job)}</span>
                          </span>
                        </div>
                      </div>
                      {job.ats && (
                        <Badge variant="muted" className="hidden capitalize md:inline-flex">
                          {job.ats}
                        </Badge>
                      )}
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            ) : (
              <Empty className="border border-dashed border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Compass />
                  </EmptyMedia>
                  <EmptyTitle>No matches yet</EmptyTitle>
                  <EmptyDescription>
                    Run discovery to scan career pages and pull in roles that match your resume.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setCurrentTab("discovery")}>Set up discovery</Button>
                </EmptyContent>
              </Empty>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Activity}
            title="Crawler activity"
            description="Live events from the discovery worker"
            action={
              <Button variant="ghost" size="sm" onClick={() => setCurrentTab("discovery")}>
                Open
                <ArrowRight data-icon="inline-end" />
              </Button>
            }
          />
          <PanelBody className="pt-3">
            {isEventsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                ))}
              </div>
            ) : events.length > 0 ? (
              <EventTimeline events={events} />
            ) : (
              <Empty className="p-6 md:p-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Activity />
                  </EmptyMedia>
                  <EmptyTitle>Worker idle</EmptyTitle>
                  <EmptyDescription>Events appear here as soon as a crawl or probe runs.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </PanelBody>
        </Panel>
      </div>
    </PageContainer>
  );
};
