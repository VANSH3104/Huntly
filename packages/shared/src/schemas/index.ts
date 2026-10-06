import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Job Schemas
// ═══════════════════════════════════════════════════════════════

export const JobLocationSchema = z.object({
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  remote: z.boolean().optional(),
  remoteType: z.enum(["FULLY_REMOTE", "HYBRID", "ON_SITE"]).optional(),
});

export const SalarySchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
  period: z.enum(["ANNUAL", "MONTHLY", "HOURLY"]).optional(),
});

export const JobSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  sourceId: z.string().optional(),
  title: z.string().min(1),
  normalizedTitle: z.string(),
  description: z.string(),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  preferredQualifications: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  location: JobLocationSchema,
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "INTERN", "CONTRACT", "VOLUNTEER", "OTHER"]).optional(),
  experienceLevel: z.enum(["INTERNSHIP", "ENTRY", "MID", "SENIOR", "EXECUTIVE"]).optional(),
  salary: SalarySchema.optional(),
  postedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  sourceUrl: z.string().url(),
  applyUrl: z.string().url(),
  canonicalUrl: z.string().url().optional(),
  sourceType: z.enum(["company", "ats", "job_board", "search"]),
  ats: z.string().optional(),
  externalJobId: z.string().optional(),
  firstSeenAt: z.date(),
  lastVerifiedAt: z.date(),
  status: z.enum(["active", "stale", "closed"]),
  contentHash: z.string(),
});

// ═══════════════════════════════════════════════════════════════
// AI Analysis Schema (Gemini output validation)
// ═══════════════════════════════════════════════════════════════

export const AIAnalysisResponseSchema = z.object({
  matchScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  strongestMatches: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  concerns: z.array(z.string()),
  relevantResumeSections: z.array(z.string()),
  recommendedKeywords: z.array(z.string()),
  applicationPriority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  resumeTailoringSuggestions: z.array(z.string()),
});

export type AIAnalysisResponse = z.infer<typeof AIAnalysisResponseSchema>;

// ═══════════════════════════════════════════════════════════════
// Match Breakdown Schema
// ═══════════════════════════════════════════════════════════════

export const MatchBreakdownSchema = z.object({
  overall: z.number().min(0).max(100),
  skill: z.number().min(0).max(100),
  role: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  location: z.number().min(0).max(100),
  freshness: z.number().min(0).max(100),
  source: z.number().min(0).max(100),
  company: z.number().min(0).max(100),
});

export type MatchBreakdownOutput = z.infer<typeof MatchBreakdownSchema>;

// ═══════════════════════════════════════════════════════════════
// Settings Schema
// ═══════════════════════════════════════════════════════════════

export const UserSettingsSchema = z.object({
  profile: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
  }),
  jobPreferences: z.object({
    roles: z.array(z.string()),
    locations: z.array(z.string()),
    experience: z.array(z.string()),
    remote: z.boolean(),
    salaryMin: z.number().optional(),
    skills: z.array(z.string()),
    excludeKeywords: z.array(z.string()),
  }),
  crawler: z.object({
    concurrency: z.number().min(1).max(10),
    delayMs: z.number().min(500),
    defaultIntervalMinutes: z.number().min(30),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    minMatchScore: z.number().min(0).max(100),
    onlyDirectCompany: z.boolean(),
    onlyNew: z.boolean(),
    digestMode: z.enum(["immediate", "hourly", "daily", "weekly"]),
  }),
  appearance: z.object({
    theme: z.enum(["dark", "light", "system"]),
  }),
  gemini: z.object({
    model: z.string(),
    maxJobsPerBatch: z.number().min(1).max(100),
    minScoreForAI: z.number().min(0).max(100),
  }),
});

export type UserSettingsData = z.infer<typeof UserSettingsSchema>;
