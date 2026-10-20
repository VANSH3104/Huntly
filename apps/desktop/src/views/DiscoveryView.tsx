import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, Globe, Loader2, Radar, RefreshCw, Search, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { Badge } from "../components/common/Badge";
import {
  EventTimeline,
  PageContainer,
  Panel,
  PanelBody,
  PanelHeader,
  listContainer,
  listItem,
} from "../components/common/PagePrimitives";
import { toast, errorMessage } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v);
}

export const DiscoveryView: React.FC = () => {
  const queryClient = useQueryClient();
  const [probeUrl, setProbeUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [probeResult, setProbeResult] = useState<any>(null);

  const { data: sources, isLoading: isSourcesLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.sources.list(),
  });

  const { data: events, isLoading: isEventsLoading } = useQuery({
    queryKey: ["crawl", "events", 30],
    queryFn: () => api.crawl.events(30),
    refetchInterval: 4000,
  });

  const probe = useMutation({
    mutationFn: (url: string) => api.crawl.probeUrl(url),
    onMutate: () => setProbeResult(null),
    onSuccess: (res) => {
      setProbeResult(res);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
      toast.success(`Discovered ${res?.companyName || "career page"}`, {
        description: `${res?.jobsFound ?? 0} jobs extracted via ${res?.ats || "the direct web parser"}.`,
      });
    },
    onError: (err) => {
      setProbeResult({ error: errorMessage(err, "The domain could not be probed") });
      toast.error("Probe failed", { description: errorMessage(err) });
    },
  });

  const crawlSource = useMutation({
    mutationFn: (source: any) => api.sources.triggerCrawl(source.id),
    onSuccess: (_res, source) => {
      toast.success("Crawl queued", { description: `${source.company?.name || hostOf(source.url)} will be re-crawled shortly.` });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (err) => toast.error("Could not start crawl", { description: errorMessage(err) }),
  });

  const urlInvalid = touched && probeUrl.trim() !== "" && !looksLikeUrl(probeUrl);

  const handleProbe = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!looksLikeUrl(probeUrl)) return;
    probe.mutate(probeUrl.trim());
  };

  const list: any[] = sources ?? [];

  return (
    <PageContainer className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          icon={Radar}
          title="Probe a career page"
          description="Paste a company site or ATS link. The engine checks robots.txt and common career endpoints, detects the ATS, and extracts verified jobs."
        />
        <PanelBody>
          <form onSubmit={handleProbe} className="flex max-w-2xl flex-col gap-1.5" noValidate>
            <Label htmlFor="probe-url" className="sr-only">
              Company website or career page URL
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="probe-url"
                type="url"
                inputMode="url"
                placeholder="stripe.com or https://jobs.lever.co/company"
                value={probeUrl}
                onChange={(e) => setProbeUrl(e.target.value)}
                onBlur={() => setTouched(true)}
                aria-invalid={urlInvalid || undefined}
                aria-describedby="probe-url-help"
                className="font-mono text-[13px]"
              />
              <Button type="submit" disabled={probe.isPending || !probeUrl.trim()}>
                {probe.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
                {probe.isPending ? "Probing…" : "Discover jobs"}
              </Button>
            </div>
            <p id="probe-url-help" className={cn("text-[12px]", urlInvalid ? "text-destructive" : "text-muted-foreground")}>
              {urlInvalid
                ? "Enter a domain like stripe.com or a full https:// link."
                : "Works with Greenhouse, Lever, Ashby and most company career pages."}
            </p>
          </form>

          {probeResult && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              role="status"
              className={cn(
                "flex max-w-2xl items-start gap-3 rounded-lg border p-3.5 text-[13px]",
                probeResult.error
                  ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)]"
                  : "border-[var(--brand-line)] bg-[var(--brand-soft)]"
              )}
            >
              {probeResult.error ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              )}
              {probeResult.error ? (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-foreground">Probe failed</span>
                  <span className="text-muted-foreground">{probeResult.error}</span>
                </div>
              ) : (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    {probeResult.companyName || "Company"} ·{" "}
                    <span className="tabular-nums">{probeResult.jobsFound ?? 0}</span> jobs extracted
                  </span>
                  <span className="truncate text-[12px] text-muted-foreground">
                    {probeResult.ats || "Direct web parser"} · {probeResult.careerUrl || probeUrl}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader
            icon={Globe}
            title="Monitored sources"
            description="Career pages and ATS boards the crawler revisits on a schedule"
            action={
              <span className="text-[12.5px] tabular-nums text-muted-foreground">
                {list.length} active
              </span>
            }
          />
          <PanelBody className="px-2 pb-2">
            {isSourcesLoading ? (
              <div className="flex flex-col gap-3 px-3 py-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-64" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : list.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Globe />
                  </EmptyMedia>
                  <EmptyTitle>No sources yet</EmptyTitle>
                  <EmptyDescription>Probe a company career page above to start monitoring it.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full table-fixed border-collapse text-[13px]">
                  <thead className="sticky top-0 z-[1] bg-card">
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="px-3 py-2.5 text-[12px] font-medium text-muted-foreground">Company</th>
                      <th scope="col" className="w-36 px-3 py-2.5 text-[12px] font-medium text-muted-foreground">Platform</th>
                      <th scope="col" className="w-20 px-3 py-2.5 text-right text-[12px] font-medium text-muted-foreground">Jobs</th>
                      <th scope="col" className="w-28 px-3 py-2.5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <motion.tbody variants={listContainer} initial="hidden" animate="show">
                    {list.map((s, i) => {
                      const name = s.company?.name || s.companyName || s.name || hostOf(s.url);
                      const pending = crawlSource.isPending && crawlSource.variables?.id === s.id;
                      return (
                        <motion.tr
                          key={s.id}
                          variants={listItem}
                          custom={i}
                          className="border-b border-border transition-colors last:border-0 hover:bg-[var(--bg-card-hover)]"
                        >
                          <td className="px-3 py-2.5">
                            <div className="truncate font-medium text-foreground">{name}</div>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate font-mono text-[11px] text-muted-foreground hover:text-primary"
                            >
                              {s.url.replace(/^https?:\/\//, "")}
                            </a>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={s.ats ? "cyan" : "muted"} className="capitalize">
                              {s.ats || "direct"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                            {(s.lastJobCount ?? 0).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => crawlSource.mutate(s)}
                              disabled={pending}
                              aria-label={`Crawl ${name} now`}
                            >
                              <RefreshCw className={cn(pending && "animate-spin")} data-icon="inline-start" />
                              Crawl
                            </Button>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </motion.tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            icon={Activity}
            title="Worker activity"
            description="Most recent crawl events"
          />
          <PanelBody className="max-h-[620px] overflow-y-auto pt-3">
            {isEventsLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                ))}
              </div>
            ) : (events ?? []).length > 0 ? (
              <EventTimeline events={events ?? []} />
            ) : (
              <Empty className="p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Activity />
                  </EmptyMedia>
                  <EmptyTitle>Worker idle</EmptyTitle>
                  <EmptyDescription>Logs appear when queries or probes run.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </PanelBody>
        </Panel>
      </div>
    </PageContainer>
  );
};
