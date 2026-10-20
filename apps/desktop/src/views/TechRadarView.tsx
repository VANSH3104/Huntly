import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SiGithub, SiHuggingface, SiYcombinator } from "react-icons/si";
import {
  ArrowUp,
  ArrowUpRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Lightbulb,
  List,
  MessagesSquare,
  Newspaper,
  RefreshCw,
  ScrollText,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { api } from "../lib/api";
import { PageContainer, PageIntro } from "../components/common/PagePrimitives";
import { toast, errorMessage } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface IntelCard {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string;
  score: number;
  commentsCount: number;
  readTime: string;
  publishedAt: string;
  executiveSummary: string;
  technicalHighlights: string[];
  practicalImpact: string;
  keyConcepts: string[];
}

const CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "all", label: "All", icon: List },
  { id: "AI & Models", label: "AI models", icon: Sparkles },
  { id: "Agentic Systems", label: "Agents", icon: Bot },
  { id: "Dev Tools & Infra", label: "Tools and infra", icon: Code2 },
  { id: "Architecture & Specs", label: "Architecture", icon: Lightbulb },
  { id: "Discussions", label: "Discussions", icon: MessagesSquare },
];

// Source marks render in the current text colour so they sit quietly in every theme.
const SourceMark: React.FC<{ source: string }> = ({ source }) => {
  const cls = "size-3 shrink-0";
  if (source.includes("Hacker") || source.includes("HN")) return <SiYcombinator className={cls} aria-hidden />;
  if (source.includes("GitHub")) return <SiGithub className={cls} aria-hidden />;
  if (source.includes("arXiv")) return <ScrollText className={cls} aria-hidden />;
  if (source.includes("Hugging")) return <SiHuggingface className={cls} aria-hidden />;
  return <Newspaper className={cls} aria-hidden />;
};

const Meta: React.FC<{ item: IntelCard }> = ({ item }) => (
  <div className="flex shrink-0 items-center gap-2.5 text-[11.5px] tabular-nums text-muted-foreground">
    {item.score > 0 && (
      <span className="flex items-center gap-0.5" title={`${item.score} points`}>
        <ArrowUp className="size-3" aria-hidden />
        <span className="sr-only">Score</span>
        {item.score.toLocaleString()}
      </span>
    )}
    {item.commentsCount > 0 && (
      <span className="flex items-center gap-1" title={`${item.commentsCount} comments`}>
        <MessagesSquare className="size-3" aria-hidden />
        <span className="sr-only">Comments</span>
        {item.commentsCount.toLocaleString()}
      </span>
    )}
    {item.readTime && (
      <span className="flex items-center gap-1">
        <Clock className="size-3" aria-hidden />
        {item.readTime.replace(" read", "")}
      </span>
    )}
  </div>
);

export const TechRadarView: React.FC = () => {
  const [feed, setFeed] = useState<IntelCard[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(
    async (force = false) => {
      setIsLoading(true);
      try {
        const res = await api.intel.getFeed({
          category: activeCategory !== "all" ? activeCategory : undefined,
          force,
        });
        setFeed(res.feed || []);
        setLastUpdated(
          res.lastUpdated ? new Date(res.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""
        );
        if (force) toast.success("Radar refreshed", { description: `${res.feed?.length ?? 0} stories in the stream.` });
      } catch (err) {
        toast.error("Could not load the radar feed", { description: errorMessage(err) });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeCategory]
  );

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadFeed(true);
  };

  const scrollBy = (dx: number) => scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  const q = searchQuery.trim().toLowerCase();
  const filteredFeed = q
    ? feed.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.executiveSummary.toLowerCase().includes(q) ||
          item.keyConcepts?.some((k) => k.toLowerCase().includes(q))
      )
    : feed;

  const featured = feed.slice(0, 6);
  const showSkeleton = isLoading && feed.length === 0;

  return (
    <PageContainer className="flex flex-col gap-7">
      <PageIntro
        title="Source stream"
        description="Hacker News front page, GitHub trending, arXiv releases and AI engineering news, summarized with direct source links."
        actions={
          <>
            {lastUpdated && (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                Updated <span className="tabular-nums">{lastUpdated}</span>
              </span>
            )}
            <Button onClick={handleManualRefresh} disabled={isRefreshing || isLoading}>
              <RefreshCw className={cn(isRefreshing && "animate-spin")} data-icon="inline-start" />
              {isRefreshing ? "Scanning…" : "Refresh stream"}
            </Button>
          </>
        }
      />

      {featured.length > 0 && activeCategory === "all" && !q && (
        <section aria-labelledby="trending-heading" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 id="trending-heading" className="text-[14px] font-semibold tracking-tight text-foreground">
              Trending now
            </h2>
            <div className="flex gap-1.5">
              <Button variant="outline" size="icon-sm" onClick={() => scrollBy(-380)} aria-label="Scroll trending stories left">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => scrollBy(380)} aria-label="Scroll trending stories right">
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div ref={scrollerRef} className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2">
            {featured.map((story, i) => (
              <motion.a
                key={story.id}
                href={story.url}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className="group flex w-[340px] shrink-0 snap-start flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 text-foreground shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-line)] hover:text-foreground hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
                      <SourceMark source={story.source} />
                      {story.source}
                    </span>
                    <Meta item={story} />
                  </div>
                  <h3 className="line-clamp-2 text-[14px] font-medium leading-snug">{story.title}</h3>
                  <p className="line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">{story.executiveSummary}</p>
                </div>
                <span className="flex items-center gap-1 text-[12px] font-medium text-primary">
                  Read source
                  <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </span>
              </motion.a>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={activeCategory}
          onValueChange={(v) => v && setActiveCategory(v)}
          aria-label="Filter by category"
          className="flex-wrap"
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <ToggleGroupItem key={cat.id} value={cat.id} aria-label={cat.label} className="gap-1.5 px-3">
                <Icon aria-hidden />
                {cat.label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search stories"
            placeholder="Search topics, models, tools…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {showSkeleton ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="mt-2 h-16 w-full" />
            </div>
          ))}
        </div>
      ) : filteredFeed.length === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Newspaper />
            </EmptyMedia>
            <EmptyTitle>{q ? "No stories match your search" : "No stories in this stream yet"}</EmptyTitle>
            <EmptyDescription>
              {q ? "Try a broader term or another category." : "Refresh the stream to pull the latest technical stories."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {q ? (
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button onClick={handleManualRefresh}>Refresh stream</Button>
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredFeed.map((item, idx) => (
            <motion.article
              key={item.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: Math.min(idx, 10) * 0.035, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex items-center gap-1.5 truncate text-[11.5px] font-medium text-muted-foreground">
                    <SourceMark source={item.source} />
                    {item.source}
                  </span>
                  <Badge variant="secondary" className="font-normal">
                    {item.category}
                  </Badge>
                </div>
                <Meta item={item} />
              </div>

              <h3 className="text-[15px] font-medium leading-snug">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-sm text-foreground decoration-[var(--brand-line)] underline-offset-4 hover:text-foreground hover:underline"
                >
                  {item.title}
                </a>
              </h3>

              <p className="text-[13px] leading-relaxed text-muted-foreground">{item.executiveSummary}</p>

              {item.technicalHighlights?.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/60 p-3">
                  <span className="text-[12px] font-medium text-muted-foreground">Highlights</span>
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-snug text-foreground/90 marker:text-muted-foreground">
                    {item.technicalHighlights.map((hl, i) => (
                      <li key={i}>{hl}</li>
                    ))}
                  </ul>
                </div>
              )}

              {item.practicalImpact && (
                <p className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/90">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="font-medium">Why it matters: </span>
                    {item.practicalImpact}
                  </span>
                </p>
              )}

              <div className="mt-auto flex flex-col gap-3">
                {item.keyConcepts?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.keyConcepts.map((tag) => (
                      <Badge key={tag} variant="outline" className="font-normal text-muted-foreground">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                <Separator />
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" asChild>
                    <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.title}`}>
                      Open source
                      <ArrowUpRight data-icon="inline-end" />
                    </a>
                  </Button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </PageContainer>
  );
};
