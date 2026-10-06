import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════
// Helper: timestamp fields
// ═══════════════════════════════════════════════════════════════
const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
};

// ═══════════════════════════════════════════════════════════════
// Users
// ═══════════════════════════════════════════════════════════════
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  ...timestamps,
});

// ═══════════════════════════════════════════════════════════════
// Resumes
// ═══════════════════════════════════════════════════════════════
export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  latex: text("latex").notNull(),
  parsedJson: text("parsed_json"),   // JSON string of ParsedResume
  hash: text("hash").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Resume Skills
// ═══════════════════════════════════════════════════════════════
export const resumeSkills = sqliteTable("resume_skills", {
  id: text("id").primaryKey(),
  resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
  skill: text("skill").notNull(),
  canonical: text("canonical").notNull(),
});

// ═══════════════════════════════════════════════════════════════
// Companies
// ═══════════════════════════════════════════════════════════════
export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  logoUrl: text("logo_url"),
  industry: text("industry"),
  companyType: text("company_type"),   // PRIVATE | PUBLIC | STARTUP …
  size: text("size"),                  // STARTUP | SMALL | MEDIUM …
  headquarters: text("headquarters"),
  website: text("website"),
  careerPage: text("career_page"),
  ats: text("ats"),
  linkedinUrl: text("linkedin_url"),
  description: text("description"),
  isBlocked: integer("is_blocked", { mode: "boolean" }).notNull().default(false),
  isPreferred: integer("is_preferred", { mode: "boolean" }).notNull().default(false),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  lastCrawledAt: integer("last_crawled_at", { mode: "timestamp_ms" }),
});

// ═══════════════════════════════════════════════════════════════
// Sources
// ═══════════════════════════════════════════════════════════════
export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  url: text("url").notNull().unique(),
  type: text("type").notNull(),   // company | ats | job_board | search
  ats: text("ats"),
  priority: real("priority").notNull().default(0.5),
  lastCrawledAt: integer("last_crawled_at", { mode: "timestamp_ms" }),
  lastJobCount: integer("last_job_count"),
  status: text("status").notNull().default("active"),
  crawlIntervalMinutes: integer("crawl_interval_minutes").notNull().default(360),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Jobs
// ═══════════════════════════════════════════════════════════════
export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),

  title: text("title").notNull(),
  normalizedTitle: text("normalized_title").notNull(),
  description: text("description").notNull().default(""),
  responsibilities: text("responsibilities").notNull().default("[]"),   // JSON array
  requirements: text("requirements").notNull().default("[]"),
  preferredQualifications: text("preferred_qualifications").notNull().default("[]"),
  skills: text("skills").notNull().default("[]"),

  // Location stored as JSON
  locationJson: text("location_json").notNull().default("{}"),

  employmentType: text("employment_type"),
  experienceLevel: text("experience_level"),
  salaryJson: text("salary_json"),   // JSON

  postedAt: integer("posted_at", { mode: "timestamp_ms" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),

  sourceUrl: text("source_url").notNull(),
  applyUrl: text("apply_url").notNull(),
  canonicalUrl: text("canonical_url"),
  sourceType: text("source_type").notNull(),
  ats: text("ats"),
  externalJobId: text("external_job_id"),

  contentHash: text("content_hash").notNull(),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  lastVerifiedAt: integer("last_verified_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  status: text("status").notNull().default("active"),
});

// ═══════════════════════════════════════════════════════════════
// Job Snapshots (change history)
// ═══════════════════════════════════════════════════════════════
export const jobSnapshots = sqliteTable("job_snapshots", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  snapshotData: text("snapshot_data").notNull(),   // JSON of Job at that time
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Job Skills
// ═══════════════════════════════════════════════════════════════
export const jobSkills = sqliteTable("job_skills", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  skill: text("skill").notNull(),
  canonical: text("canonical").notNull(),
  isRequired: integer("is_required", { mode: "boolean" }).notNull().default(true),
});

// ═══════════════════════════════════════════════════════════════
// Job Matches
// ═══════════════════════════════════════════════════════════════
export const jobMatches = sqliteTable("job_matches", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
  overallScore: real("overall_score").notNull(),
  skillScore: real("skill_score").notNull().default(0),
  roleScore: real("role_score").notNull().default(0),
  experienceScore: real("experience_score").notNull().default(0),
  locationScore: real("location_score").notNull().default(0),
  freshnessScore: real("freshness_score").notNull().default(0),
  sourceScore: real("source_score").notNull().default(0),
  companyScore: real("company_score").notNull().default(0),
  breakdownJson: text("breakdown_json"),
  computedAt: integer("computed_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// AI Analyses
// ═══════════════════════════════════════════════════════════════
export const aiAnalyses = sqliteTable("ai_analyses", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
  cacheKey: text("cache_key").notNull().unique(),
  matchScore: real("match_score").notNull(),
  summary: text("summary").notNull(),
  strongestMatches: text("strongest_matches").notNull().default("[]"),
  missingRequirements: text("missing_requirements").notNull().default("[]"),
  concerns: text("concerns").notNull().default("[]"),
  relevantResumeSections: text("relevant_resume_sections").notNull().default("[]"),
  recommendedKeywords: text("recommended_keywords").notNull().default("[]"),
  applicationPriority: text("application_priority").notNull().default("MEDIUM"),
  resumeTailoringSuggestions: text("resume_tailoring_suggestions").notNull().default("[]"),
  rawResponse: text("raw_response"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Applications
// ═══════════════════════════════════════════════════════════════
export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  resumeVersionId: text("resume_version_id").references(() => resumes.id, { onDelete: "set null" }),
  status: text("status").notNull().default("saved"),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
  notes: text("notes"),
  nextAction: text("next_action"),
  deadline: integer("deadline", { mode: "timestamp_ms" }),
  ...timestamps,
});

// ═══════════════════════════════════════════════════════════════
// Crawl Runs
// ═══════════════════════════════════════════════════════════════
export const crawlRuns = sqliteTable("crawl_runs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),    // search | career | verify | full
  status: text("status").notNull().default("pending"),
  statsJson: text("stats_json").notNull().default("{}"),
  startedAt: integer("started_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

// ═══════════════════════════════════════════════════════════════
// Crawl Events
// ═══════════════════════════════════════════════════════════════
export const crawlEvents = sqliteTable("crawl_events", {
  id: text("id").primaryKey(),
  crawlRunId: text("crawl_run_id").notNull().references(() => crawlRuns.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("info"),
  url: text("url"),
  jobId: text("job_id"),
  companyId: text("company_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Crawl Errors
// ═══════════════════════════════════════════════════════════════
export const crawlErrors = sqliteTable("crawl_errors", {
  id: text("id").primaryKey(),
  crawlRunId: text("crawl_run_id").references(() => crawlRuns.id, { onDelete: "set null" }),
  url: text("url"),
  errorCode: integer("error_code"),
  errorMessage: text("error_message"),
  retries: integer("retries").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Queue Jobs
// ═══════════════════════════════════════════════════════════════
export const queueJobs = sqliteTable("queue_jobs", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(5),
  retries: integer("retries").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  scheduledAt: integer("scheduled_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Notifications
// ═══════════════════════════════════════════════════════════════
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  jobId: text("job_id"),
  companyId: text("company_id"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});

// ═══════════════════════════════════════════════════════════════
// Settings (key-value)
// ═══════════════════════════════════════════════════════════════
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch('now') * 1000)`),
});
