import * as React from "react";
import { ArrowDownWideNarrow, ListFilter, Loader2, Search, X } from "lucide-react";
import type { JobFilterState } from "../../types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ActiveFilterChips, FilterPill } from "./AdvancedFilters";
import { SORT_OPTIONS, toggleIn, type FilterChip } from "./filterModel";

interface QuickFilter {
  id: string;
  label: string;
  isOn: (f: JobFilterState) => boolean;
  toggle: (f: JobFilterState) => Partial<JobFilterState>;
}

const QUICK_FILTERS: QuickFilter[] = [
  {
    id: "remote",
    label: "Remote",
    isOn: (f) => f.remoteOnly,
    toggle: (f) => ({ remoteOnly: !f.remoteOnly }),
  },
  {
    id: "24h",
    label: "Last 24h",
    isOn: (f) => f.postedWithin === "24h",
    toggle: (f) => ({ postedWithin: f.postedWithin === "24h" ? "all" : "24h" }),
  },
  {
    id: "7d",
    label: "This week",
    isOn: (f) => f.postedWithin === "7d",
    toggle: (f) => ({ postedWithin: f.postedWithin === "7d" ? "all" : "7d" }),
  },
  {
    id: "match",
    label: "70%+ match",
    isOn: (f) => f.minScore >= 70,
    toggle: (f) => ({ minScore: f.minScore >= 70 ? 0 : 70 }),
  },
  {
    id: "salary",
    label: "Lists salary",
    isOn: (f) => f.advanced.hasSalary,
    toggle: (f) => ({ advanced: { ...f.advanced, hasSalary: !f.advanced.hasSalary } }),
  },
  {
    id: "intern",
    label: "Internships",
    isOn: (f) => f.advanced.employmentType.includes("internship"),
    toggle: (f) => ({ advanced: { ...f.advanced, employmentType: toggleIn(f.advanced.employmentType, "internship") } }),
  },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export interface JobsToolbarProps {
  filters: JobFilterState;
  setFilters: (patch: Partial<JobFilterState>) => void;
  chips: FilterChip[];
  onClearAll: () => void;
  onOpenFilters: () => void;
  total: number;
  fetching: boolean;
}

export function JobsToolbar({ filters, setFilters, chips, onClearAll, onOpenFilters, total, fetching }: JobsToolbarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState(filters.search);

  // Keep the box in sync when search changes elsewhere (a removed chip, the dialog, Clear all).
  React.useEffect(() => {
    setSearch((cur) => (cur === filters.search ? cur : filters.search));
  }, [filters.search]);

  React.useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => setFilters({ search }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const dialogChipCount = chips.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={inputRef}
            type="search"
            aria-label="Search jobs"
            aria-keyshortcuts="/"
            placeholder="Search titles, companies, skills"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.preventDefault();
                setSearch("");
                setFilters({ search: "" });
              }
            }}
            className="bg-card pr-10 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setSearch("");
                setFilters({ search: "" });
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : (
            <kbd
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 inline-flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded border border-border bg-secondary px-1 text-[11px] text-muted-foreground"
            >
              /
            </kbd>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onOpenFilters} className="bg-card" aria-label={`All filters${dialogChipCount ? `, ${dialogChipCount} active` : ""}`}>
            <ListFilter data-icon="inline-start" aria-hidden />
            All filters
            {dialogChipCount > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10.5px] font-semibold text-primary-foreground tabular-nums">
                {dialogChipCount}
              </span>
            )}
          </Button>
          <Select value={filters.sortBy} onValueChange={(v) => setFilters({ sortBy: v as JobFilterState["sortBy"] })}>
            <SelectTrigger size="sm" aria-label="Sort jobs" className="w-[158px] bg-card">
              <ArrowDownWideNarrow className="text-muted-foreground" aria-hidden />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Quick filters" className="flex flex-wrap items-center gap-1.5">
          {QUICK_FILTERS.map((q) => (
            <FilterPill key={q.id} pressed={q.isOn(filters)} onPressedChange={() => setFilters(q.toggle(filters))}>
              {q.label}
            </FilterPill>
          ))}
        </div>
        <p className="ml-auto flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span className="text-base font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span>
          {total === 1 ? "job" : "jobs"}
          <Loader2
            className={cn("size-3.5 animate-spin transition-opacity", fetching ? "opacity-100" : "opacity-0")}
            aria-hidden
          />
        </p>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Filtered by</span>
          <ActiveFilterChips chips={chips} onClear={(chip) => setFilters(chip.clear)} />
          <Button variant="link" size="sm" onClick={onClearAll} className="h-7 px-1 text-muted-foreground hover:text-foreground">
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
