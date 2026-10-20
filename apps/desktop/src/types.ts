import type {
  Job,
  Company,
  Source,
  Application,
  JobMatch,
  AIAnalysis,
  CrawlRun,
  CrawlEvent,
  ParsedResume,
} from "@huntly/shared";

export type NavTab =
  | "dashboard"
  | "jobs"
  | "radar"
  | "applications"
  | "discovery"
  | "resume"
  | "analytics"
  | "settings";

export interface JobWithMatch extends Job {
  company?: Company;
  match?: JobMatch;
  aiAnalysis?: AIAnalysis;
  application?: Application;
}

export interface JobFilterState {
  search: string;
  role: string;
  specialization?: string;
  specializations?: string[];
  location: string;
  region?: string;
  regions?: string[];
  remoteOnly: boolean;
  workFormat?: string;
  workFormats?: string[];
  seniority?: string;
  seniorities?: string[];
  sources?: string;
  sourceList?: string[];
  skills?: string;
  skillList?: string[];
  industry?: string;
  industries?: string[];
  collection?: string;
  collections?: string[];
  minScore: number;
  ats: string;
  status: "all" | "active" | "stale" | "closed";
  sortBy: "matchScore" | "postedAt" | "company" | "salary" | "newest" | "views" | "relevance";
  sortOrder: "asc" | "desc";
  postedWithin?: string;
  hideApplied?: boolean;
  advanced: AdvancedJobFilters;
}

export type EmploymentType = "full-time" | "part-time" | "contract" | "internship" | "freelance";

// Mirrors the advanced query params of GET /api/jobs; list fields are sent comma-joined.
export interface AdvancedJobFilters {
  excludeKeywords: string;
  includeCompanies: string;
  excludeCompanies: string;
  titleOnly: boolean;
  includeDescription: boolean;
  searchMode: "any" | "all";
  exactWord: boolean;
  skillsMode: "any" | "all";
  employmentType: EmploymentType[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  hasSalary: boolean;
  country: string;
  visaSponsorship: boolean;
  postedAfter: string;
}

export interface DashboardStats {
  totalJobs: number;
  activeJobs: number;
  highMatchJobs: number;
  sourcesMonitored: number;
  activeCrawls: number;
  applicationsCount: {
    saved: number;
    applied: number;
    interview: number;
    offer: number;
    rejected: number;
  };
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  jobId?: string;
  companyId?: string;
  read: boolean;
  createdAt: string;
}
