import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, GripVertical, Inbox, Trash2, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { PageContainer, PageIntro } from "../components/common/PagePrimitives";
import { Badge, type BadgeTone } from "../components/common/Badge";
import { toast, confirmDialog, errorMessage } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

interface Column {
  id: string;
  title: string;
  tone: BadgeTone;
}

const COLUMNS: Column[] = [
  { id: "saved", title: "Saved", tone: "muted" },
  { id: "applied", title: "Applied", tone: "cyan" },
  { id: "oa", title: "Assessment", tone: "purple" },
  { id: "interview", title: "Interview", tone: "amber" },
  { id: "offer", title: "Offer", tone: "emerald" },
  { id: "rejected", title: "Archived", tone: "rose" },
];

const titleOf = (app: any): string => app.job?.title || app.jobTitle || "Untitled role";
const companyOf = (app: any): string => app.company?.name || app.companyName || "Unknown company";

export const ApplicationsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { setSelectedJobId, setCurrentTab } = useStore();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const { data: applications, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.applications.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.applications.update(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["applications"] });
      const previous = queryClient.getQueryData<any[]>(["applications"]);
      queryClient.setQueryData<any[]>(["applications"], (old) => old?.map((a) => (a.id === id ? { ...a, status } : a)));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["applications"], ctx.previous);
      toast.error("Could not move application", { description: errorMessage(err) });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.applications.delete(id),
    onSuccess: () => {
      toast.success("Application removed");
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
    onError: (err) => toast.error("Could not remove application", { description: errorMessage(err) }),
  });

  const moveTo = (app: any, status: string) => {
    if ((app.status || "saved") === status) return;
    updateMutation.mutate({ id: app.id, status });
  };

  const moveNext = (app: any) => {
    const currentIndex = COLUMNS.findIndex((c) => c.id === (app.status || "saved"));
    if (currentIndex >= 0 && currentIndex < COLUMNS.length - 2) moveTo(app, COLUMNS[currentIndex + 1].id);
  };

  const handleDelete = async (app: any) => {
    const ok = await confirmDialog({
      title: "Remove this application?",
      description: `${titleOf(app)} at ${companyOf(app)} will be removed from your pipeline. The job stays in your feed.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(app.id);
  };

  const apps: any[] = applications ?? [];

  return (
    <PageContainer className="flex flex-col gap-5">
      <PageIntro
        title="Pipeline"
        description="Drag cards between stages, or use the arrow to advance. Every card links back to its original posting."
        actions={
          <span className="text-[12.5px] tabular-nums text-muted-foreground">
            {apps.length} {apps.length === 1 ? "application" : "applications"}
          </span>
        }
      />

      {!isLoading && apps.length === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>Your pipeline is empty</EmptyTitle>
            <EmptyDescription>Save a role from the job feed and it will show up here, ready to track.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setCurrentTab("jobs")}>Browse jobs</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="-mx-1 flex min-h-0 flex-1 gap-3 overflow-x-auto px-1 pb-2">
          {COLUMNS.map((col) => {
            const colApps = apps.filter((a) => (a.status || "saved") === col.id);
            const isOver = overColumn === col.id && dragId !== null;
            return (
              <section
                key={col.id}
                aria-label={`${col.title}, ${colApps.length} applications`}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (overColumn !== col.id) setOverColumn(col.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const app = apps.find((a) => a.id === (dragId ?? e.dataTransfer.getData("text/plain")));
                  if (app) moveTo(app, col.id);
                  setDragId(null);
                  setOverColumn(null);
                }}
                className={cn(
                  "flex min-h-[420px] w-[248px] shrink-0 flex-col rounded-xl border bg-[var(--bg-secondary)] transition-[border-color,background-color] duration-150 xl:w-auto xl:min-w-[168px] xl:flex-1",
                  isOver ? "border-[var(--brand-line)] bg-[var(--brand-soft)]" : "border-border"
                )}
              >
                <header className="flex items-center justify-between gap-2 px-3.5 pt-3.5 pb-2.5">
                  <span className="text-[13px] font-medium text-foreground">{col.title}</span>
                  <Badge variant={col.tone} className="tabular-nums">
                    {colApps.length}
                  </Badge>
                </header>

                <div className="flex flex-1 flex-col gap-2 px-2.5 pb-2.5">
                  {isLoading ? (
                    Array.from({ length: col.id === "saved" ? 2 : 1 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                        <Skeleton className="h-4 w-4/5" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    ))
                  ) : colApps.length === 0 ? (
                    <div
                      className={cn(
                        "flex items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-[12px] text-muted-foreground transition-colors",
                        isOver ? "border-[var(--brand-line)] text-primary" : "border-border"
                      )}
                    >
                      {isOver ? "Drop here" : "No applications"}
                    </div>
                  ) : (
                    <AnimatePresence initial={false}>
                      {colApps.map((app, i) => (
                        <KanbanCard
                          key={app.id}
                          app={app}
                          index={i}
                          isDragging={dragId === app.id}
                          canAdvance={col.id !== "offer" && col.id !== "rejected"}
                          nextStage={COLUMNS[COLUMNS.findIndex((c) => c.id === col.id) + 1]?.title}
                          onOpen={() => app.jobId && setSelectedJobId(app.jobId)}
                          onAdvance={() => moveNext(app)}
                          onDelete={() => handleDelete(app)}
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", app.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(app.id);
                          }}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverColumn(null);
                          }}
                        />
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
};

interface KanbanCardProps {
  app: any;
  index: number;
  isDragging: boolean;
  canAdvance: boolean;
  nextStage?: string;
  onOpen: () => void;
  onAdvance: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({
  app,
  index,
  isDragging,
  canAdvance,
  nextStage,
  onOpen,
  onAdvance,
  onDelete,
  onDragStart,
  onDragEnd,
}) => {
  const autoApplied = typeof app.notes === "string" && app.notes.startsWith("Auto-applied");
  const updated = app.updatedAt ? new Date(app.updatedAt) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.45 : 1, y: 0, scale: isDragging ? 0.98 : 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1], delay: Math.min(index * 0.03, 0.15) }}
    >
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="group relative flex cursor-grab flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-sm)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] active:cursor-grabbing"
      >
        <GripVertical
          className="absolute top-3 right-2 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex flex-col gap-1 rounded-sm pr-4 text-left"
          aria-label={`Open ${titleOf(app)} at ${companyOf(app)}`}
        >
          <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{titleOf(app)}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Building2 className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{companyOf(app)}</span>
          </span>
        </button>

        {autoApplied && (
          <Badge variant="emerald" className="gap-1">
            <Zap className="size-2.5" aria-hidden /> Auto-applied
          </Badge>
        )}

        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border pt-2">
          <time
            className="text-[11.5px] tabular-nums text-muted-foreground"
            dateTime={app.updatedAt}
            title={updated ? updated.toLocaleString() : undefined}
          >
            {updated ? updated.toLocaleDateString([], { month: "short", day: "numeric" }) : "—"}
          </time>
          <div className="flex items-center gap-0.5">
            {canAdvance && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" onClick={onAdvance} aria-label={`Move to ${nextStage ?? "next stage"}`}>
                    <ArrowRight />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Move to {nextStage ?? "next stage"}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onDelete}
                  aria-label="Remove application"
                  className="hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
