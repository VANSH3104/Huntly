import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Briefcase,
  Building2,
  CalendarClock,
  Code2,
  Globe2,
  Laptop,
  Loader2,
  MapPin,
  Plus,
  Search,
  TextSearch,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { api, type JobFacets } from "../../lib/api";
import type { AdvancedJobFilters, JobFilterState } from "../../types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { FilterPill } from "./AdvancedFilters";
import {
  ATS_OPTIONS,
  COLLECTION_OPTIONS,
  EMPLOYMENT_OPTIONS,
  INDUSTRY_OPTIONS,
  MATCH_OPTIONS,
  POSTED_OPTIONS,
  REGION_OPTIONS,
  ROLE_SUGGESTIONS,
  SENIORITY_OPTIONS,
  STATUS_OPTIONS,
  WORK_FORMAT_OPTIONS,
  buildJobParams,
  clearedFilters,
  describeFilterChips,
  parseNumber,
  splitCsv,
  toggleIn,
} from "./filterModel";

export type FilterSectionId =
  | "keywords"
  | "role"
  | "experience"
  | "location"
  | "workFormat"
  | "skills"
  | "company"
  | "source"
  | "salary"
  | "posted";

const SECTIONS: Array<{ id: FilterSectionId; label: string; icon: LucideIcon }> = [
  { id: "keywords", label: "Keywords", icon: TextSearch },
  { id: "role", label: "Role", icon: Briefcase },
  { id: "experience", label: "Experience", icon: TrendingUp },
  { id: "location", label: "Location", icon: MapPin },
  { id: "workFormat", label: "Work format", icon: Laptop },
  { id: "skills", label: "Skills", icon: Code2 },
  { id: "company", label: "Company", icon: Building2 },
  { id: "source", label: "Source", icon: Globe2 },
  { id: "salary", label: "Salary", icon: BadgeDollarSign },
  { id: "posted", label: "Posted & status", icon: CalendarClock },
];

// Chip key (before any ":value") to the section that edits it; drives the rail counts.
const CHIP_SECTION: Record<string, FilterSectionId> = {
  search: "keywords",
  excludeKeywords: "keywords",
  titleOnly: "keywords",
  searchMode: "keywords",
  exactWord: "keywords",
  role: "role",
  includeDescription: "role",
  seniorities: "experience",
  employmentType: "experience",
  experience: "experience",
  location: "location",
  country: "location",
  regions: "location",
  visaSponsorship: "location",
  workFormats: "workFormat",
  remoteOnly: "workFormat",
  skillList: "skills",
  skillsMode: "skills",
  includeCompanies: "company",
  excludeCompanies: "company",
  industries: "company",
  collections: "company",
  ats: "source",
  sourceList: "source",
  salaryMin: "salary",
  hasSalary: "salary",
  postedWithin: "posted",
  postedAfter: "posted",
  minScore: "posted",
  status: "posted",
  hideApplied: "posted",
};

const SKILL_SUGGESTIONS = ["Python", "TypeScript", "React", "Node.js", "Go", "Java", "AWS", "Kubernetes", "SQL", "PyTorch", "Rust"];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function csvHas(csv: string, value: string): boolean {
  return splitCsv(csv).some((x) => x.toLowerCase() === value.toLowerCase());
}

function csvToggle(csv: string, value: string): string {
  const list = splitCsv(csv);
  const has = list.some((x) => x.toLowerCase() === value.toLowerCase());
  return (has ? list.filter((x) => x.toLowerCase() !== value.toLowerCase()) : [...list, value]).join(", ");
}

export interface FiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: JobFilterState;
  onApply: (next: JobFilterState) => void;
  facets?: JobFacets;
  initialSection?: FilterSectionId;
}

export function FiltersDialog({ open, onOpenChange, filters, onApply, facets, initialSection = "keywords" }: FiltersDialogProps) {
  const [draft, setDraft] = React.useState(filters);
  const [section, setSection] = React.useState<FilterSectionId>(initialSection);

  // Each opening starts from the applied filters; closing without "Show" discards the draft.
  React.useEffect(() => {
    if (open) {
      setDraft(filters);
      setSection(initialSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (patch: Partial<JobFilterState>) => setDraft((d) => ({ ...d, ...patch }));
  const setAdv = (patch: Partial<AdvancedJobFilters>) => setDraft((d) => ({ ...d, advanced: { ...d.advanced, ...patch } }));

  const debounced = useDebounced(draft, 250);
  const countParams = buildJobParams(debounced, 1, 1);
  const { data: countData, isFetching: counting, isError: countFailed } = useQuery({
    queryKey: ["jobs-count", countParams],
    queryFn: () => api.jobs.list(countParams),
    enabled: open,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
  const liveCount = countData?.pagination?.total ?? countData?.total;
  const pending = counting || debounced !== draft;

  const chips = describeFilterChips(draft);
  const sectionCounts = chips.reduce<Partial<Record<FilterSectionId, number>>>((acc, c) => {
    const s = CHIP_SECTION[c.key.split(":")[0]];
    if (s) acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const apply = () => {
    onApply(draft);
    onOpenChange(false);
  };

  const showLabel =
    liveCount === undefined ? "Show jobs" : `Show ${liveCount.toLocaleString()} ${liveCount === 1 ? "job" : "jobs"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(680px,calc(100vh-3rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[860px]"
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <DialogHeader className="flex-row items-center justify-between gap-4 border-b border-border px-5 py-4 text-left">
            <div className="flex flex-col gap-0.5">
              <DialogTitle className="font-sans text-lg font-semibold tracking-tight">Filters</DialogTitle>
              <DialogDescription>Combine filters to narrow the feed. Nothing changes until you apply.</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Close filters">
                <X />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav
              aria-label="Filter sections"
              className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-border bg-muted/50 p-2 sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => {
                const active = section === id;
                const n = sectionCounts[id] ?? 0;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                      active
                        ? "bg-card font-medium text-foreground shadow-[var(--shadow-sm)]"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "opacity-70")} aria-hidden />
                    <span className="flex-1">{label}</span>
                    {n > 0 && (
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--brand-soft)] px-1.5 text-[10.5px] font-semibold text-[var(--brand-strong)] tabular-nums">
                        {n}
                        <span className="sr-only"> active</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
              <SectionBody
                section={section}
                draft={draft}
                set={set}
                setAdv={setAdv}
                facets={facets}
              />
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(clearedFilters(draft))}
              disabled={chips.length === 0}
            >
              Clear all
            </Button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
                {countFailed
                  ? "Could not count matches"
                  : chips.length > 0
                    ? `${chips.length} filter${chips.length === 1 ? "" : "s"} selected`
                    : "No filters selected"}
              </span>
              <Button type="submit" className="min-w-36">
                {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
                <span className="tabular-nums">{showLabel}</span>
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Group({ label, hint, children, id }: { label: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span id={id} className="text-sm font-medium text-foreground">
          {label}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function TextField({
  id,
  label,
  hint,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} aria-describedby={hint ? `${id}-hint` : undefined} />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function SwitchRow({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Pills({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="flex-wrap"
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.id} value={o.id} className="px-3 text-xs data-[state=on]:bg-[var(--brand-soft)] data-[state=on]:text-[var(--brand-strong)]">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function TagInput({
  id,
  label,
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [text, setText] = React.useState("");
  const add = (raw: string) => {
    const parts = splitCsv(raw).filter((p) => !values.some((v) => v.toLowerCase() === p.toLowerCase()));
    if (parts.length) onChange([...values, ...parts]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-2">
          <Input
            id={id}
            value={text}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && text.trim()) {
                e.preventDefault();
                add(text);
              } else if (e.key === "Backspace" && !text && values.length) {
                onChange(values.slice(0, -1));
              }
            }}
          />
          <Button type="button" variant="outline" onClick={() => add(text)} disabled={!text.trim()}>
            <Plus data-icon="inline-start" aria-hidden />
            Add
          </Button>
        </div>
      </div>
      {values.length > 0 && (
        <ul aria-label={`Selected ${label.toLowerCase()}`} className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li
              key={v}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--brand-line)] bg-[var(--brand-soft)] py-0 pr-1 pl-2.5 text-xs font-medium text-[var(--brand-strong)]"
            >
              {v}
              <button
                type="button"
                aria-label={`Remove ${v}`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="inline-flex size-5 items-center justify-center rounded-full outline-none hover:bg-[var(--brand-soft)] focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {suggestions && suggestions.length > 0 && (
        <Group label="Suggestions">
          <Pills>
            {suggestions
              .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
              .map((s) => (
                <FilterPill key={s} pressed={false} onPressedChange={() => onChange([...values, s])} aria-label={`Add ${s}`}>
                  <Plus className="size-3" aria-hidden />
                  {s}
                </FilterPill>
              ))}
          </Pills>
        </Group>
      )}
    </div>
  );
}

interface BodyProps {
  section: FilterSectionId;
  draft: JobFilterState;
  set: (p: Partial<JobFilterState>) => void;
  setAdv: (p: Partial<AdvancedJobFilters>) => void;
  facets?: JobFacets;
}

function SectionBody({ section, draft, set, setAdv, facets }: BodyProps) {
  const a = draft.advanced;

  switch (section) {
    case "keywords":
      return (
        <Section title="Keywords" description="Search titles, companies, skills and descriptions.">
          <TextField
            id="f-search"
            label="Search terms"
            placeholder="e.g. react, payments, distributed systems"
            value={draft.search}
            onChange={(e) => set({ search: e.target.value })}
            hint="Separate terms with commas."
          />
          <Group label="Match" id="f-search-mode">
            <Segmented
              label="Search term matching"
              value={a.searchMode}
              onChange={(v) => setAdv({ searchMode: v as "any" | "all" })}
              options={[
                { id: "any", label: "Any term" },
                { id: "all", label: "All terms" },
              ]}
            />
          </Group>
          <div className="flex flex-col gap-4">
            <CheckRow id="f-title-only" checked={a.titleOnly} onChange={(v) => setAdv({ titleOnly: v })} label="Match in job title only" />
            <CheckRow
              id="f-exact"
              checked={a.exactWord}
              onChange={(v) => setAdv({ exactWord: v })}
              label="Whole words only"
              description="“intern” will not match “internal”."
            />
          </div>
          <TextField
            id="f-exclude"
            label="Exclude keywords"
            placeholder="e.g. clearance, unpaid"
            value={a.excludeKeywords}
            onChange={(e) => setAdv({ excludeKeywords: e.target.value })}
            hint="Hide jobs that mention any of these."
          />
        </Section>
      );

    case "role":
      return (
        <Section title="Role" description="Match job titles and listed skills.">
          <TextField
            id="f-role"
            label="Roles"
            placeholder="e.g. Backend, Platform engineer"
            value={draft.role}
            onChange={(e) => set({ role: e.target.value })}
            hint="Separate roles with commas."
          />
          <Group label="Popular roles">
            <Pills>
              {ROLE_SUGGESTIONS.map((r) => (
                <FilterPill key={r} pressed={csvHas(draft.role, r)} onPressedChange={() => set({ role: csvToggle(draft.role, r) })}>
                  {r}
                </FilterPill>
              ))}
            </Pills>
          </Group>
          <CheckRow
            id="f-role-desc"
            checked={a.includeDescription}
            onChange={(v) => setAdv({ includeDescription: v })}
            label="Also match job descriptions"
            description="Broader results; descriptions often mention other roles."
          />
        </Section>
      );

    case "experience": {
      const employmentCount = (id: string) =>
        facets?.employmentType.find((b) => b.value.replace(/\s+/g, "-") === id)?.count;
      return (
        <Section title="Experience" description="Seniority, years of experience and employment type.">
          <Group label="Seniority">
            <Pills>
              {SENIORITY_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={(draft.seniorities ?? []).includes(o.id)}
                  onPressedChange={() => set({ seniorities: toggleIn(draft.seniorities, o.id) })}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
          <Group label="Years of experience" hint="From “N+ years” in the posting">
            <div className="grid max-w-sm grid-cols-2 gap-3">
              <TextField
                id="f-exp-min"
                label="Minimum"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                placeholder="0"
                value={a.experienceMin ?? ""}
                onChange={(e) => setAdv({ experienceMin: parseNumber(e.target.value) })}
              />
              <TextField
                id="f-exp-max"
                label="Maximum"
                type="number"
                min={0}
                max={30}
                inputMode="numeric"
                placeholder="15+"
                value={a.experienceMax ?? ""}
                onChange={(e) => setAdv({ experienceMax: parseNumber(e.target.value) })}
              />
            </div>
          </Group>
          <Group label="Employment type">
            <Pills>
              {EMPLOYMENT_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={a.employmentType.includes(o.id)}
                  onPressedChange={() => setAdv({ employmentType: toggleIn(a.employmentType, o.id) })}
                  count={employmentCount(o.id)}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
        </Section>
      );
    }

    case "location": {
      const countries = (facets?.country ?? []).filter((c) => c.value.length > 1).slice(0, 10);
      return (
        <Section title="Location" description="Where the job is based.">
          <TextField
            id="f-location"
            label="City or place"
            placeholder="e.g. Bengaluru, Berlin, Remote"
            value={draft.location}
            onChange={(e) => set({ location: e.target.value })}
            hint="Separate places with commas. Matches location, title and description."
          />
          <div className="flex flex-col gap-3">
            <TextField
              id="f-country"
              label="Country"
              placeholder="e.g. India, Singapore"
              value={a.country}
              onChange={(e) => setAdv({ country: e.target.value })}
            />
            {countries.length > 0 && (
              <Pills>
                {countries.map((c) => (
                  <FilterPill
                    key={c.value}
                    pressed={csvHas(a.country, c.value)}
                    onPressedChange={() => setAdv({ country: csvToggle(a.country, c.value) })}
                    count={c.count}
                  >
                    {c.value}
                  </FilterPill>
                ))}
              </Pills>
            )}
          </div>
          <Group label="Region">
            <Pills>
              {REGION_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={(draft.regions ?? []).includes(o.id)}
                  onPressedChange={() => set({ regions: toggleIn(draft.regions, o.id) })}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
          <CheckRow
            id="f-visa"
            checked={a.visaSponsorship}
            onChange={(v) => setAdv({ visaSponsorship: v })}
            label="Mentions visa sponsorship or relocation"
          />
        </Section>
      );
    }

    case "workFormat":
      return (
        <Section title="Work format" description="Remote, hybrid or in the office.">
          <Group label="Format">
            <Pills>
              {WORK_FORMAT_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={(draft.workFormats ?? []).includes(o.id)}
                  onPressedChange={() => set({ workFormats: toggleIn(draft.workFormats, o.id) })}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
          <SwitchRow
            id="f-remote-only"
            checked={draft.remoteOnly}
            onChange={(v) => set({ remoteOnly: v })}
            label="Remote only"
            description="Strict: only postings marked remote."
          />
        </Section>
      );

    case "skills":
      return (
        <Section title="Skills" description="Jobs that list these skills or mention them.">
          <TagInput
            id="f-skills"
            label="Skills"
            placeholder="Type a skill and press Enter"
            values={draft.skillList ?? []}
            onChange={(skillList) => set({ skillList, skills: "" })}
            suggestions={SKILL_SUGGESTIONS}
          />
          <Group label="Match">
            <Segmented
              label="Skill matching"
              value={a.skillsMode}
              onChange={(v) => setAdv({ skillsMode: v as "any" | "all" })}
              options={[
                { id: "any", label: "Any skill" },
                { id: "all", label: "All skills" },
              ]}
            />
          </Group>
        </Section>
      );

    case "company": {
      const companies = (facets?.company ?? []).filter((c) => c.value.length > 2).slice(0, 12);
      return (
        <Section title="Company" description="Pick or exclude employers, industries and backers.">
          <div className="flex flex-col gap-3">
            <TextField
              id="f-include-co"
              label="Only these companies"
              placeholder="e.g. Stripe, Notion"
              value={a.includeCompanies}
              onChange={(e) => setAdv({ includeCompanies: e.target.value })}
            />
            {companies.length > 0 && (
              <Pills>
                {companies.map((c) => (
                  <FilterPill
                    key={c.value}
                    pressed={csvHas(a.includeCompanies, c.value)}
                    onPressedChange={() => setAdv({ includeCompanies: csvToggle(a.includeCompanies, c.value) })}
                    count={c.count}
                  >
                    {c.value}
                  </FilterPill>
                ))}
              </Pills>
            )}
          </div>
          <TextField
            id="f-exclude-co"
            label="Exclude companies"
            placeholder="e.g. Acme, Contoso"
            value={a.excludeCompanies}
            onChange={(e) => setAdv({ excludeCompanies: e.target.value })}
          />
          <Group label="Industry">
            <Pills>
              {INDUSTRY_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={(draft.industries ?? []).includes(o.id)}
                  onPressedChange={() => set({ industries: toggleIn(draft.industries, o.id) })}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
          <Group label="Collections">
            <Pills>
              {COLLECTION_OPTIONS.map((o) => (
                <FilterPill
                  key={o.id}
                  pressed={(draft.collections ?? []).includes(o.id)}
                  onPressedChange={() => set({ collections: toggleIn(draft.collections, o.id) })}
                >
                  {o.label}
                </FilterPill>
              ))}
            </Pills>
          </Group>
        </Section>
      );
    }

    case "source":
      return <SourceSection draft={draft} set={set} facets={facets} />;

    case "salary":
      return (
        <Section title="Salary" description="Only postings that publish pay can be filtered by amount.">
          <div className="max-w-xs">
            <TextField
              id="f-salary"
              label="Minimum salary"
              type="number"
              min={0}
              step={1000}
              inputMode="numeric"
              placeholder="e.g. 100000"
              value={a.salaryMin ?? ""}
              onChange={(e) => setAdv({ salaryMin: parseNumber(e.target.value) })}
              hint="Compared with the posted amount, in the posting's currency."
            />
          </div>
          <SwitchRow
            id="f-has-salary"
            checked={a.hasSalary}
            onChange={(v) => setAdv({ hasSalary: v })}
            label="Lists a salary"
            description="Hide postings without pay information."
          />
        </Section>
      );

    case "posted":
      return (
        <Section title="Posted & status" description="Freshness, match quality and what you have already seen.">
          <Group label="Posted within">
            <Segmented
              label="Posted within"
              value={POSTED_OPTIONS.some((o) => o.id === draft.postedWithin) ? draft.postedWithin ?? "all" : "all"}
              onChange={(v) => set({ postedWithin: v })}
              options={POSTED_OPTIONS}
            />
          </Group>
          <div className="max-w-xs">
            <TextField
              id="f-posted-after"
              label="Posted after"
              type="date"
              value={a.postedAfter}
              onChange={(e) => setAdv({ postedAfter: e.target.value })}
            />
          </div>
          <Group label="Minimum match">
            <Segmented
              label="Minimum match score"
              value={String(draft.minScore)}
              onChange={(v) => set({ minScore: Number(v) })}
              options={
                MATCH_OPTIONS.some((o) => o.id === String(draft.minScore))
                  ? MATCH_OPTIONS
                  : [...MATCH_OPTIONS, { id: String(draft.minScore), label: `${draft.minScore}%+` }]
              }
            />
          </Group>
          <div className="flex max-w-xs flex-col gap-2">
            <Label htmlFor="f-status">Listing status</Label>
            <Select value={draft.status} onValueChange={(v) => set({ status: v as JobFilterState["status"] })}>
              <SelectTrigger id="f-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <SwitchRow
            id="f-hide-applied"
            checked={draft.hideApplied !== false}
            onChange={(v) => set({ hideApplied: v })}
            label="Hide jobs already on your board"
            description="Skips jobs you saved, applied to or are tracking."
          />
        </Section>
      );
  }
}

function SourceSection({
  draft,
  set,
  facets,
}: {
  draft: JobFilterState;
  set: (p: Partial<JobFilterState>) => void;
  facets?: JobFacets;
}) {
  const [query, setQuery] = React.useState("");
  const countOf = (id: string) => facets?.ats.find((b) => b.value === id)?.count;
  const selected = new Set([...(draft.sourceList ?? []), ...(draft.ats ? [draft.ats] : [])]);
  const options = ATS_OPTIONS.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())).sort(
    (x, y) => (countOf(y.id) ?? -1) - (countOf(x.id) ?? -1)
  );

  // The legacy single "ats" value folds into the list on first edit, so both never apply at once.
  const toggle = (id: string) => {
    const base = [...(draft.sourceList ?? []), ...(draft.ats && !(draft.sourceList ?? []).includes(draft.ats) ? [draft.ats] : [])];
    set({ sourceList: toggleIn(base, id), ats: "", sources: "" });
  };

  return (
    <Section title="Source" description="ATS platforms and job boards the posting came from.">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          aria-label="Find a source"
          placeholder="Find a source"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sources match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {options.map((o) => {
            const count = countOf(o.id);
            const id = `f-src-${o.id}`;
            return (
              <div key={o.id} className="flex h-9 items-center gap-3 rounded-md px-2 hover:bg-accent">
                <Checkbox id={id} checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                <Label htmlFor={id} className="flex-1 cursor-pointer font-normal">
                  {o.label}
                </Label>
                {count !== undefined && (
                  <span className="text-xs text-muted-foreground tabular-nums">{count.toLocaleString()}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
