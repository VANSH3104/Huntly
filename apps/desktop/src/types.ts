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
  location: string;
  remoteOnly: boolean;
  minScore: number;
  ats: string;
  status: "all" | "active" | "stale" | "closed";
  sortBy: "matchScore" | "postedAt" | "company" | "salary";
  sortOrder: "asc" | "desc";
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
