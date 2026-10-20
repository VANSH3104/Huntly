import React from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Building2, Code2, Layers, Network, TrendingUp, Wallet } from "lucide-react";
import { api } from "../lib/api";
import {
  PageContainer,
  PageIntro,
  Panel,
  PanelBody,
  PanelHeader,
  StatCard,
  listContainer,
} from "../components/common/PagePrimitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

interface Datum {
  name: string;
  count: number;
}

// Chart ink comes from theme tokens so every chart follows the active theme.
const CHART = {
  bar: "var(--brand)",
  grid: "var(--border-subtle)",
  axis: "var(--text-muted)",
  label: "var(--text-secondary)",
  cursor: "color-mix(in srgb, var(--text-primary) 5%, transparent)",
};

const ChartTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string; unit: string }> = ({
  active,
  payload,
  label,
  unit,
}) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <div
      role="status"
      className="flex min-w-36 flex-col gap-1 rounded-lg border border-[var(--border-hover)] bg-popover px-3 py-2 text-popover-foreground shadow-[var(--shadow-md)]"
    >
      <span className="text-[12px] font-medium">{label}</span>
      <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
        <span className="tabular-nums text-foreground">{value.toLocaleString()}</span> {unit}
      </span>
    </div>
  );
};

const HorizontalBars: React.FC<{ data: Datum[]; unit: string; label: string }> = ({ data, unit, label }) => {
  const height = Math.max(200, data.length * 30 + 24);
  const summary = data.map((d) => `${d.name}: ${d.count}`).join(", ");
  return (
    <figure className="m-0" aria-label={`${label}. ${summary}`}>
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={CHART.grid} />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              allowDecimals={false}
            />
            <YAxis
              dataKey="name"
              type="category"
              axisLine={false}
              tickLine={false}
              width={96}
              tick={{ fill: CHART.label, fontSize: 12 }}
            />
            <Tooltip cursor={{ fill: CHART.cursor }} content={<ChartTooltip unit={unit} />} />
            <Bar dataKey="count" name={unit} fill={CHART.bar} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive animationDuration={500} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
};

const ChartSkeleton: React.FC<{ rows?: number }> = ({ rows = 8 }) => (
  <div className="flex flex-col gap-3 py-1" aria-label="Loading chart">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4" style={{ width: `${85 - i * 8}%` }} />
      </div>
    ))}
  </div>
);

const ChartEmpty: React.FC<{ title: string; description: string }> = ({ title, description }) => (
  <Empty className="min-h-56 border border-dashed border-border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <BarChart3 />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);

export const AnalyticsView: React.FC = () => {
  const { data: overview, isLoading: isOverviewLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => api.analytics.getOverview(),
  });

  const { data: skillsData, isLoading: isSkillsLoading } = useQuery({
    queryKey: ["analytics", "skills"],
    queryFn: () => api.analytics.getSkills(),
  });

  const { data: sources, isLoading: isSourcesLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.sources.list(),
  });

  const { data: salaryData, isLoading: isSalaryLoading } = useQuery({
    queryKey: ["analytics", "salary"],
    queryFn: () => api.analytics.getSalary().catch(() => null),
    retry: false,
  });

  const rawSkills: any[] = Array.isArray(skillsData) ? skillsData : skillsData?.topSkills ?? [];
  const skills: Datum[] = rawSkills
    .map((s) => ({ name: String(s.skill ?? s.name ?? ""), count: Number(s.count ?? 0) }))
    .filter((s) => s.name)
    .slice(0, 12);

  const atsCounts = new Map<string, number>();
  for (const s of sources ?? []) {
    const key = s.ats ? String(s.ats) : "direct";
    atsCounts.set(key, (atsCounts.get(key) ?? 0) + Number(s.lastJobCount ?? 0));
  }
  const ats: Datum[] = [...atsCounts.entries()]
    .map(([name, count]) => ({ name: name === "direct" ? "Direct site" : name[0].toUpperCase() + name.slice(1), count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const salaryRanges: any[] = Array.isArray(salaryData?.ranges) ? salaryData.ranges : [];
  const salary: Datum[] = salaryRanges.map((r) => ({ name: String(r.exp), count: Number(r.avg ?? 0) }));

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageIntro
        title="Market overview"
        description="Aggregated from verified employer career pages and public ATS APIs your crawler has indexed."
      />

      <motion.div
        variants={listContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard index={0} label="Indexed jobs" value={overview?.totalJobs} icon={Layers} loading={isOverviewLoading} accent hint="Across every source" />
        <StatCard index={1} label="Companies" value={overview?.totalCompanies} icon={Building2} loading={isOverviewLoading} hint="Distinct employers" />
        <StatCard index={2} label="Sources" value={sources?.length} icon={Network} loading={isSourcesLoading} hint="Monitored endpoints" />
        <StatCard index={3} label="New today" value={overview?.newToday} icon={TrendingUp} loading={isOverviewLoading} hint="First seen in the last 24h" />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader icon={Code2} title="In-demand skills" description="Skills mentioned most often in active postings" />
          <PanelBody>
            {isSkillsLoading ? (
              <ChartSkeleton />
            ) : skills.length > 0 ? (
              <HorizontalBars data={skills} unit="postings" label="In-demand skills" />
            ) : (
              <ChartEmpty title="No skill data yet" description="Skill demand appears after the first crawl extracts job requirements." />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader icon={Network} title="Jobs by source platform" description="Jobs found per ATS or career site, from your monitored sources" />
          <PanelBody>
            {isSourcesLoading ? (
              <ChartSkeleton rows={6} />
            ) : ats.length > 0 ? (
              <HorizontalBars data={ats} unit="jobs" label="Jobs by source platform" />
            ) : (
              <ChartEmpty title="No sources crawled" description="Add a career page in Discovery to see where your jobs come from." />
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader icon={Wallet} title="Compensation by seniority" description="Average advertised base salary, in thousands" />
        <PanelBody>
          {isSalaryLoading ? (
            <ChartSkeleton rows={4} />
          ) : salary.length > 0 ? (
            <HorizontalBars data={salary} unit="k average" label="Compensation by seniority" />
          ) : (
            <ChartEmpty
              title="Not enough salary data"
              description="Most postings don't publish pay ranges. This chart fills in as more listings with salaries are indexed."
            />
          )}
        </PanelBody>
      </Panel>
    </PageContainer>
  );
};
