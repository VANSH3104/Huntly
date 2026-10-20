import * as React from "react";
import { X } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { FilterChip } from "./filterModel";

export { advancedToParams, describeAdvancedChips, type FilterChip } from "./filterModel";

const pillClass =
  "h-7 min-w-0 gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-none " +
  "hover:border-[var(--border-hover)] hover:bg-accent hover:text-foreground " +
  "data-[state=on]:border-[var(--brand-line)] data-[state=on]:bg-[var(--brand-soft)] data-[state=on]:text-[var(--brand-strong)]";

// A single on/off filter rendered as a pill. aria-pressed comes from Radix Toggle.
export function FilterPill({
  pressed,
  onPressedChange,
  count,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Toggle> & { count?: number }) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={onPressedChange}
      className={cn(pillClass, className)}
      {...props}
    >
      {children}
      {count !== undefined && <span className="text-[10.5px] tabular-nums opacity-70">{count.toLocaleString()}</span>}
    </Toggle>
  );
}

export function ActiveFilterChips({
  chips,
  onClear,
  className,
}: {
  chips: FilterChip[];
  onClear: (chip: FilterChip) => void;
  className?: string;
}) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <li
          key={chip.key}
          className="inline-flex h-7 max-w-[260px] items-center gap-1 rounded-full border border-border bg-secondary py-0 pr-1 pl-2.5 text-xs text-foreground"
        >
          <span className="truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onClear(chip)}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <X className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
