// ═══════════════════════════════════════════════════════════════
// Job Types
// ═══════════════════════════════════════════════════════════════

export type JobStatus = "active" | "stale" | "closed";
export type SourceType = "company" | "ats" | "job_board" | "search";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "INTERN" | "CONTRACT" | "VOLUNTEER" | "OTHER";
export type ExperienceLevel = "INTERNSHIP" | "ENTRY" | "MID" | "SENIOR" | "EXECUTIVE";
export type ApplicationPriority = "HIGH" | "MEDIUM" | "LOW";

export interface JobLocation {
  city?: string;
  state?: string;
  country?: string;
  remote?: boolean;
  remoteType?: "FULLY_REMOTE" | "HYBRID" | "ON_SITE";
}

export interface Salary {
  min?: number;
  max?: number;
  currency?: string;
  period?: "ANNUAL" | "MONTHLY" | "HOURLY";
}

export interface Job {
  id: string;
  companyId: string;
  sourceId?: string;

  title: string;
  normalizedTitle: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  skills: string[];

  location: JobLocation;
  employmentType?: EmploymentType;
  experienceLevel?: ExperienceLevel;
  salary?: Salary;

  postedAt?: Date;
  expiresAt?: Date;

  sourceUrl: string;
  applyUrl: string;
  canonicalUrl?: string;
  sourceType: SourceType;
  ats?: string;
  externalJobId?: string;

  firstSeenAt: Date;
  lastVerifiedAt: Date;
  status: JobStatus;
  contentHash: string;

  ghostRisk?: "none" | "low" | "medium" | "high";
  ghostScore?: number;
  isGhost?: boolean;
  ghostReasons?: string[];
}

// ═══════════════════════════════════════════════════════════════
// Company Types
// ═══════════════════════════════════════════════════════════════

export type CompanySize = "STARTUP" | "SMALL" | "MEDIUM" | "LARGE" | "ENTERPRISE";
export type CompanyType = "PRIVATE" | "PUBLIC" | "NONPROFIT" | "GOVERNMENT" | "STARTUP";

export interface Company {
  id: string;
  name: string;
  domain: string;
  logoUrl?: string;
  industry?: string;
  companyType?: CompanyType;
  size?: CompanySize;
  headquarters?: string;
  website?: string;
  careerPage?: string;
  ats?: string;
  linkedinUrl?: string;
  description?: string;
  firstSeenAt: Date;
  lastCrawledAt?: Date;
  isBlocked: boolean;
  isPreferred: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Source Types
// ═══════════════════════════════════════════════════════════════

export type SourceStatus = "active" | "paused" | "error" | "unavailable";

export interface Source {
  id: string;
  companyId?: string;
  url: string;
  type: SourceType;
  ats?: string;
  priority: number;
  lastCrawledAt?: Date;
  lastJobCount?: number;
  status: SourceStatus;
  crawlIntervalMinutes: number;
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Resume Types
// ═══════════════════════════════════════════════════════════════

export interface ResumeEducation {
  institution: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: number;
  achievements?: string[];
}

export interface ResumeExperience {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  location?: string;
  description: string[];
  technologies?: string[];
}

export interface ResumeProject {
  name: string;
  description: string[];
  technologies?: string[];
  url?: string;
  highlights?: string[];
}

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary?: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: string[];
  certifications?: string[];
  achievements?: string[];
}

export interface Resume {
  id: string;
  name: string;
  latex: string;
  parsed?: ParsedResume;
  hash: string;
  createdAt: Date;
  isActive: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Job Match Types
// ═══════════════════════════════════════════════════════════════

export interface MatchBreakdown {
  overall: number;
  skill: number;
  role: number;
  experience: number;
  location: number;
  freshness: number;
  source: number;
  company: number;
}

export interface JobMatch {
  id: string;
  jobId: string;
  resumeId: string;
  breakdown: MatchBreakdown;
  computedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// AI Analysis Types
// ═══════════════════════════════════════════════════════════════

export interface AIAnalysis {
  id: string;
  jobId: string;
  resumeId: string;
  cacheKey: string;
  matchScore: number;
  summary: string;
  strongestMatches: string[];
  missingRequirements: string[];
  concerns: string[];
  relevantResumeSections: string[];
  recommendedKeywords: string[];
  applicationPriority: ApplicationPriority;
  resumeTailoringSuggestions: string[];
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Application Tracker Types
// ═══════════════════════════════════════════════════════════════

export type ApplicationStatus =
  | "saved"
  | "applied"
  | "oa"
  | "interview"
  | "final"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface Application {
  id: string;
  jobId: string;
  resumeVersionId?: string;
  status: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
  nextAction?: string;
  deadline?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Crawler Types
// ═══════════════════════════════════════════════════════════════

export type CrawlRunType = "search" | "career" | "verify" | "full";
export type CrawlRunStatus = "pending" | "running" | "completed" | "failed";
export type CrawlEventSeverity = "info" | "warn" | "error";

export interface CrawlRun {
  id: string;
  type: CrawlRunType;
  status: CrawlRunStatus;
  startedAt: Date;
  finishedAt?: Date;
  stats: CrawlStats;
}

export interface CrawlStats {
  urlsDiscovered: number;
  urlsCrawled: number;
  jobsExtracted: number;
  duplicatesRemoved: number;
  jobsUpdated: number;
  errors: number;
}

export interface CrawlEvent {
  id: string;
  crawlRunId: string;
  type: string;
  message: string;
  severity: CrawlEventSeverity;
  url?: string;
  jobId?: string;
  companyId?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Search Types
// ═══════════════════════════════════════════════════════════════

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  position: number;
}

// ═══════════════════════════════════════════════════════════════
// Settings Types
// ═══════════════════════════════════════════════════════════════

export interface UserSettings {
  profile: {
    name?: string;
    email?: string;
  };
  jobPreferences: {
    roles: string[];
    locations: string[];
    experience: string[];
    remote: boolean;
    salaryMin?: number;
    skills: string[];
    excludeKeywords: string[];
  };
  crawler: {
    concurrency: number;
    delayMs: number;
    defaultIntervalMinutes: number;
  };
  notifications: {
    enabled: boolean;
    minMatchScore: number;
    onlyDirectCompany: boolean;
    onlyNew: boolean;
    digestMode: "immediate" | "hourly" | "daily" | "weekly";
  };
  appearance: {
    theme: "dark" | "light" | "system";
  };
  gemini: {
    model: string;
    maxJobsPerBatch: number;
    minScoreForAI: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// Queue Types
// ═══════════════════════════════════════════════════════════════

export type QueueJobType =
  | "search_discovery"
  | "crawl_career_page"
  | "crawl_ats"
  | "verify_job"
  | "extract_jobs"
  | "ai_analysis"
  | "match_jobs"
  | "notify";

export type QueueJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface QueueJob<T = unknown> {
  id: string;
  type: QueueJobType;
  payload: T;
  status: QueueJobStatus;
  priority: number;
  retries: number;
  maxRetries: number;
  scheduledAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  createdAt: Date;
}
