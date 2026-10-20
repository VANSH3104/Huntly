import React, { useEffect, useState } from "react";
import { animate, motion, useReducedMotion, type Variants } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/* Shared page chrome for the workspace views: one surface, one heading rhythm, one stat tile. */

// Parent only orchestrates; each item staggers by its `custom` index, capped so long lists never lag.
export const listContainer: Variants = {
  hidden: {},
  show: {},
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 10) * 0.04 },
  }),
};

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("page-container", className)} {...props} />;
}

export function PageIntro({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="max-w-2xl text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-[var(--shadow-sm),var(--edge-highlight)]",
        className
      )}
      {...props}
    />
  );
}

export function PanelHeader({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon && (
          <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate text-[14px] font-semibold leading-7 tracking-tight text-foreground">{title}</h2>
          {description && <p className="text-[12.5px] leading-snug text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-3 p-5", className)} {...props} />;
}

/** Counts up to `value` once on mount and whenever it changes. Under 600ms, skipped for reduced motion. */
export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 0.55,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [value, reduce, duration]);

  return <>{format(display)}</>;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  format,
  loading,
  accent = false,
  index = 0,
}: {
  label: string;
  value: number | null | undefined;
  hint?: string;
  icon: LucideIcon;
  format?: (n: number) => string;
  loading?: boolean;
  accent?: boolean;
  index?: number;
}) {
  return (
    <motion.div variants={listItem} custom={index} className="h-full">
      <Panel className="h-full gap-3 p-5 transition-[border-color,box-shadow] duration-200 hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md),var(--edge-highlight)]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
          <Icon className={cn("size-4", accent ? "text-primary" : "text-muted-foreground")} aria-hidden />
        </div>
        <div className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
          {loading ? (
            <Skeleton className="h-7 w-20" aria-label="Loading" />
          ) : value == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <CountUp value={value} format={format} />
          )}
        </div>
        {hint && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      </Panel>
    </motion.div>
  );
}

function humanize(type: string): string {
  const s = type.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short timestamp used in event streams. */
export function formatTime(iso?: string): string {
  if (!iso) return "now";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "now" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const EventTimeline: React.FC<{ events: any[]; className?: string }> = ({ events, className }) => (
  <motion.ol
    variants={listContainer}
    initial="hidden"
    animate="show"
    className={cn("relative flex flex-col", className)}
    aria-label="Crawler events"
  >
    {events.map((ev, i) => {
      const isError = ev.severity === "error";
      return (
        <motion.li key={ev.id || i} variants={listItem} custom={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < events.length - 1 && (
            <span className="absolute top-3.5 bottom-0 left-[3.5px] w-px bg-border" aria-hidden />
          )}
          <span
            className={cn(
              "relative mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-card",
              isError ? "bg-destructive" : i === 0 ? "bg-primary" : "bg-[var(--border-hover)]"
            )}
            aria-hidden
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("truncate text-[12.5px] font-medium", isError ? "text-destructive" : "text-foreground")}>
                {humanize(ev.type || "event")}
              </span>
              <time className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                {formatTime(ev.createdAt)}
              </time>
            </div>
            <p className="break-words text-[12px] leading-snug text-muted-foreground [overflow-wrap:anywhere]">
              {ev.message || "Event recorded"}
            </p>
          </div>
        </motion.li>
      );
    })}
  </motion.ol>
);
