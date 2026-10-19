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
} from "@agentforge/shared";

export type NavTab =
  | "dashboard"
  | "jobs"
  | "radar"
  | "applications"
  | "discovery"
  | "resume"
  | "analytics"
  | "sandbox"
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
  sortBy: "matchScore" | "postedAt" | "company" | "salary" | "newest" | "views";
  sortOrder: "asc" | "desc";
  postedWithin?: string;
  hideApplied?: boolean;
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
