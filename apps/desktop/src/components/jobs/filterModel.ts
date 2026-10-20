import type { AdvancedJobFilters, EmploymentType, JobFilterState } from "../../types";
import { defaultAdvancedFilters } from "../../store/useStore";

export interface Option<T extends string = string> {
  id: T;
  label: string;
}

export const ATS_OPTIONS: Option[] = [
  { id: "yc", label: "YC Startups" },
  { id: "greenhouse", label: "Greenhouse" },
  { id: "lever", label: "Lever" },
  { id: "ashby", label: "Ashby" },
  { id: "workday", label: "Workday" },
  { id: "workable", label: "Workable" },
  { id: "smartrecruiters", label: "SmartRecruiters" },
  { id: "recruitee", label: "Recruitee" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "remotive", label: "Remotive" },
  { id: "remoteok", label: "RemoteOK" },
  { id: "arbeitnow", label: "Arbeitnow" },
  { id: "jobicy", label: "Jobicy" },
  { id: "himalayas", label: "Himalayas" },
  { id: "themuse", label: "The Muse" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "workingnomads", label: "Working Nomads" },
  { id: "jobspresso", label: "Jobspresso" },
  { id: "authenticjobs", label: "Authentic Jobs" },
  { id: "nodesk", label: "NoDesk" },
  { id: "justremote", label: "JustRemote" },
  { id: "remote100k", label: "Remote100K" },
  { id: "remoteleaf", label: "RemoteLeaf" },
  { id: "landingjobs", label: "Landing.jobs" },
  { id: "hackernews", label: "Hacker News" },
  { id: "ycombinator", label: "Y Combinator jobs" },
  { id: "simplifyinternships", label: "Simplify internships" },
  { id: "simplifynewgrad", label: "Simplify new grad" },
  { id: "internshala", label: "Internshala" },
  { id: "cutshort", label: "Cutshort" },
  { id: "teamtailor", label: "Teamtailor" },
  { id: "bamboohr", label: "BambooHR" },
  { id: "personio", label: "Personio" },
  { id: "breezy", label: "Breezy HR" },
  { id: "rippling", label: "Rippling" },
  { id: "gemjobs", label: "Gem" },
  { id: "adzuna", label: "Adzuna" },
  { id: "jooble", label: "Jooble" },
  { id: "reed", label: "Reed" },
  { id: "usajobs", label: "USAJOBS" },
  { id: "careerjet", label: "Careerjet" },
  { id: "findwork", label: "Findwork" },
];

export const POSTED_OPTIONS: Option[] = [
  { id: "all", label: "Any time" },
  { id: "24h", label: "24 hours" },
  { id: "3d", label: "3 days" },
  { id: "7d", label: "Week" },
  { id: "30d", label: "Month" },
];

export const POSTED_LABELS: Record<string, string> = {
  "4h": "Past 4h",
  "9h": "Past 9h",
  "24h": "Past 24h",
  "3d": "Past 3 days",
  "7d": "Past week",
  "30d": "Past month",
};

export const EMPLOYMENT_OPTIONS: Option<EmploymentType>[] = [
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "freelance", label: "Freelance" },
];

export const SENIORITY_OPTIONS: Option[] = [
  { id: "intern", label: "Intern" },
  { id: "junior", label: "Junior" },
  { id: "mid", label: "Mid" },
  { id: "senior", label: "Senior" },
  { id: "lead", label: "Lead" },
  { id: "staff", label: "Staff" },
  { id: "principal", label: "Principal" },
];

export const WORK_FORMAT_OPTIONS: Option[] = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "on-site", label: "On-site" },
];

export const REGION_OPTIONS: Option[] = [
  { id: "worldwide", label: "Worldwide" },
  { id: "india", label: "India" },
  { id: "north america", label: "North America" },
  { id: "europe", label: "Europe" },
  { id: "uk", label: "UK" },
  { id: "apac", label: "APAC" },
  { id: "latam", label: "LATAM" },
  { id: "mena", label: "MENA" },
  { id: "africa", label: "Africa" },
];

export const ROLE_SUGGESTIONS = [
  "Backend",
  "Frontend",
  "Full stack",
  "Machine learning",
  "Data engineer",
  "DevOps",
  "Mobile",
  "Product designer",
  "Product manager",
  "Security",
];

export const INDUSTRY_OPTIONS: Option[] = [
  { id: "fintech", label: "Fintech" },
  { id: "ai", label: "AI" },
  { id: "saas", label: "SaaS" },
  { id: "developer tools", label: "Developer tools" },
  { id: "healthcare", label: "Healthcare" },
  { id: "e-commerce", label: "E-commerce" },
  { id: "security", label: "Security" },
  { id: "gaming", label: "Gaming" },
  { id: "edtech", label: "Edtech" },
  { id: "climate", label: "Climate" },
];

export const COLLECTION_OPTIONS: Option[] = [
  { id: "y combinator", label: "Y Combinator" },
  { id: "techstars", label: "Techstars" },
  { id: "a16z", label: "a16z" },
  { id: "big tech", label: "Big Tech" },
  { id: "unicorn", label: "Unicorns" },
];

export const MATCH_OPTIONS: Option[] = [
  { id: "0", label: "Any" },
  { id: "50", label: "50%+" },
  { id: "70", label: "70%+" },
  { id: "85", label: "85%+" },
];

export const STATUS_OPTIONS: Option<JobFilterState["status"]>[] = [
  { id: "active", label: "Active" },
  { id: "stale", label: "Stale" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

export const SORT_OPTIONS: Option<JobFilterState["sortBy"]>[] = [
  { id: "matchScore", label: "Best match" },
  { id: "postedAt", label: "Most recent" },
  { id: "salary", label: "Highest salary" },
  { id: "relevance", label: "Most relevant" },
];

export interface FilterChip {
  key: string;
  label: string;
  clear: Partial<JobFilterState>;
}

const labelOf = (options: Option[], id: string) => options.find((o) => o.id === id)?.label ?? id;

function listChips(
  f: JobFilterState,
  field: "seniorities" | "workFormats" | "regions" | "skillList" | "industries" | "collections" | "sourceList",
  prefix: string,
  options?: Option[]
): FilterChip[] {
  const values = f[field] ?? [];
  return values.map((v) => ({
    key: `${field}:${v}`,
    label: `${prefix}${options ? labelOf(options, v) : v}`,
    clear: { [field]: values.filter((x) => x !== v) },
  }));
}

export function describeAdvancedChips(a: AdvancedJobFilters): FilterChip[] {
  const patch = (p: Partial<AdvancedJobFilters>): Partial<JobFilterState> => ({ advanced: { ...a, ...p } });
  const chips: FilterChip[] = [];
  if (a.excludeKeywords) chips.push({ key: "excludeKeywords", label: `Exclude: ${a.excludeKeywords}`, clear: patch({ excludeKeywords: "" }) });
  if (a.includeCompanies) chips.push({ key: "includeCompanies", label: `Only: ${a.includeCompanies}`, clear: patch({ includeCompanies: "" }) });
  if (a.excludeCompanies) chips.push({ key: "excludeCompanies", label: `Not: ${a.excludeCompanies}`, clear: patch({ excludeCompanies: "" }) });
  if (a.titleOnly) chips.push({ key: "titleOnly", label: "Title only", clear: patch({ titleOnly: false }) });
  if (a.includeDescription) chips.push({ key: "includeDescription", label: "Role in description", clear: patch({ includeDescription: false }) });
  if (a.searchMode === "all") chips.push({ key: "searchMode", label: "All terms", clear: patch({ searchMode: "any" }) });
  if (a.exactWord) chips.push({ key: "exactWord", label: "Whole words", clear: patch({ exactWord: false }) });
  if (a.skillsMode === "all") chips.push({ key: "skillsMode", label: "All skills", clear: patch({ skillsMode: "any" }) });
  for (const t of a.employmentType) {
    chips.push({
      key: `employmentType:${t}`,
      label: labelOf(EMPLOYMENT_OPTIONS, t),
      clear: patch({ employmentType: a.employmentType.filter((x) => x !== t) }),
    });
  }
  if (a.experienceMin !== null || a.experienceMax !== null) {
    chips.push({
      key: "experience",
      label: `${a.experienceMin ?? 0}–${a.experienceMax ?? "15+"} yrs`,
      clear: patch({ experienceMin: null, experienceMax: null }),
    });
  }
  if (a.salaryMin !== null) chips.push({ key: "salaryMin", label: `Salary ≥ ${a.salaryMin.toLocaleString()}`, clear: patch({ salaryMin: null }) });
  if (a.hasSalary) chips.push({ key: "hasSalary", label: "Lists salary", clear: patch({ hasSalary: false }) });
  if (a.country) chips.push({ key: "country", label: `Country: ${a.country}`, clear: patch({ country: "" }) });
  if (a.visaSponsorship) chips.push({ key: "visaSponsorship", label: "Visa / relocation", clear: patch({ visaSponsorship: false }) });
  if (a.postedAfter) chips.push({ key: "postedAfter", label: `After ${a.postedAfter}`, clear: patch({ postedAfter: "" }) });
  return chips;
}

// One table drives the chips, the per-section counts and "Clear all", so they cannot drift.
export function describeFilterChips(f: JobFilterState): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.search) chips.push({ key: "search", label: `“${f.search}”`, clear: { search: "" } });
  if (f.role) chips.push({ key: "role", label: `Role: ${f.role}`, clear: { role: "" } });
  if (f.location) chips.push({ key: "location", label: `Location: ${f.location}`, clear: { location: "" } });
  if (f.ats) chips.push({ key: "ats", label: `Source: ${labelOf(ATS_OPTIONS, f.ats)}`, clear: { ats: "" } });
  chips.push(...listChips(f, "sourceList", "Source: ", ATS_OPTIONS));
  chips.push(...listChips(f, "seniorities", "", SENIORITY_OPTIONS));
  chips.push(...listChips(f, "workFormats", "", WORK_FORMAT_OPTIONS));
  chips.push(...listChips(f, "regions", "", REGION_OPTIONS));
  chips.push(...listChips(f, "skillList", "Skill: "));
  chips.push(...listChips(f, "industries", "", INDUSTRY_OPTIONS));
  chips.push(...listChips(f, "collections", "", COLLECTION_OPTIONS));
  if (f.postedWithin && f.postedWithin !== "all") {
    chips.push({ key: "postedWithin", label: POSTED_LABELS[f.postedWithin] ?? f.postedWithin, clear: { postedWithin: "all" } });
  }
  if (f.remoteOnly) chips.push({ key: "remoteOnly", label: "Remote only", clear: { remoteOnly: false } });
  if (f.minScore > 0) chips.push({ key: "minScore", label: `Match ≥ ${f.minScore}%`, clear: { minScore: 0 } });
  if (f.status !== "active") chips.push({ key: "status", label: `Status: ${labelOf(STATUS_OPTIONS, f.status)}`, clear: { status: "active" } });
  if (f.hideApplied === false) chips.push({ key: "hideApplied", label: "Showing applied", clear: { hideApplied: true } });
  chips.push(...describeAdvancedChips(f.advanced));
  return chips;
}

// Neutral values for every filter field; sort order is a view preference, so it survives.
export function clearedFilters(f: JobFilterState): JobFilterState {
  return {
    ...f,
    search: "",
    role: "",
    specialization: "",
    specializations: [],
    location: "",
    region: "",
    regions: [],
    remoteOnly: false,
    workFormat: "",
    workFormats: [],
    seniority: "",
    seniorities: [],
    sources: "",
    sourceList: [],
    skills: "",
    skillList: [],
    industry: "",
    industries: [],
    collection: "",
    collections: [],
    minScore: 0,
    ats: "",
    status: "active",
    postedWithin: "all",
    hideApplied: true,
    advanced: defaultAdvancedFilters,
  };
}

export function advancedToParams(a: AdvancedJobFilters): Record<string, string | number | undefined> {
  return {
    excludeKeywords: a.excludeKeywords || undefined,
    includeCompanies: a.includeCompanies || undefined,
    excludeCompanies: a.excludeCompanies || undefined,
    titleOnly: a.titleOnly ? 1 : undefined,
    includeDescription: a.includeDescription ? 1 : undefined,
    searchMode: a.searchMode === "all" ? "all" : undefined,
    exactWord: a.exactWord ? 1 : undefined,
    skillsMode: a.skillsMode === "all" ? "all" : undefined,
    employmentType: a.employmentType.length ? a.employmentType.join(",") : undefined,
    experienceMin: a.experienceMin ?? undefined,
    experienceMax: a.experienceMax ?? undefined,
    salaryMin: a.salaryMin ?? undefined,
    hasSalary: a.hasSalary ? 1 : undefined,
    country: a.country || undefined,
    visaSponsorship: a.visaSponsorship ? 1 : undefined,
    postedAfter: a.postedAfter || undefined,
  };
}

export function buildJobParams(filters: JobFilterState, page: number, limit: number) {
  return {
    search: filters.search,
    role: filters.role,
    specialization: filters.specialization || (filters.specializations || []).join(", "),
    seniority: filters.seniority || (filters.seniorities || []).join(", "),
    workFormat: filters.workFormat || (filters.workFormats || []).join(", "),
    region: filters.region || (filters.regions || []).join(", "),
    sources: filters.sources || (filters.sourceList || []).join(", "),
    skills: filters.skills || (filters.skillList || []).join(", "),
    industry: filters.industry || (filters.industries || []).join(", "),
    collection: filters.collection || (filters.collections || []).join(", "),
    location: filters.location,
    remoteOnly: filters.remoteOnly,
    minScore: filters.minScore > 0 ? filters.minScore : undefined,
    ats: filters.ats,
    status: filters.status,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    postedWithin: filters.postedWithin !== "all" ? filters.postedWithin : undefined,
    hideApplied: filters.hideApplied,
    ...advancedToParams(filters.advanced),
    page,
    limit,
  };
}

export function parseNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function splitCsv(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function toggleIn<T>(list: T[] | undefined, value: T): T[] {
  const cur = list ?? [];
  return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
}
