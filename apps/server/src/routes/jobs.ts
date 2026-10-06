import { Router } from "express";
import { getDatabase, jobs, companies, jobMatches, aiAnalyses, applications } from "@agentforge/database";
import { eq, desc, asc, and, gte, lte, like, inArray, sql, ne } from "drizzle-orm";
import { z } from "zod";
import { normalizeLocation } from "../utils/normalize.js";

export const jobsRouter = Router();

const JobFilterSchema = z.object({
  status: z.enum(["active", "stale", "closed"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  resumeId: z.string().optional(),
  location: z.string().optional(),
  remote: z.coerce.boolean().optional(),
  remoteOnly: z.coerce.boolean().optional(),
  search: z.string().optional(),
  role: z.string().optional(),
  companyId: z.string().optional(),
  groupId: z.string().optional(),
  sourceType: z.enum(["company", "ats", "job_board", "search"]).optional(),
  ats: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  tab: z.enum(["recommended", "new", "all", "saved", "applied"]).optional(),
});

// GET /api/jobs
jobsRouter.get("/", async (req, res, next) => {
  try {
    const filter = JobFilterSchema.parse(req.query);
    const db = getDatabase();
    const offset = (filter.page - 1) * filter.limit;

    // Filters
    const conditions = [];
    if (filter.status) {
      conditions.push(eq(jobs.status, filter.status));
    } else {
      conditions.push(ne(jobs.status, "closed"));
    }

    if (filter.companyId) {
      conditions.push(eq(jobs.companyId, filter.companyId));
    }
    if (filter.sourceType) {
      conditions.push(eq(jobs.sourceType, filter.sourceType));
    }

    // Keyword Search: search title, normalizedTitle, company name, skills, and description
    if (filter.search && filter.search.trim()) {
      const term = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(${jobs.title}) LIKE ${term} OR
          lower(${jobs.normalizedTitle}) LIKE ${term} OR
          lower(${companies.name}) LIKE ${term} OR
          lower(${jobs.skills}) LIKE ${term} OR
          lower(${jobs.description}) LIKE ${term}
        )`
      );
    }

    // Role filter: title, normalizedTitle, skills, or description
    if (filter.role && filter.role.trim()) {
      const term = `%${filter.role.trim().toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(${jobs.normalizedTitle}) LIKE ${term} OR
          lower(${jobs.title}) LIKE ${term} OR
          lower(${jobs.skills}) LIKE ${term} OR
          lower(${jobs.description}) LIKE ${term}
        )`
      );
    }

    // Location filter: search location JSON and title
    if (filter.location && filter.location.trim()) {
      const term = `%${filter.location.trim().toLowerCase()}%`;
      conditions.push(
        sql`(lower(${jobs.locationJson}) LIKE ${term} OR lower(${jobs.title}) LIKE ${term})`
      );
    }

    // Remote filter
    if (filter.remote || filter.remoteOnly) {
      conditions.push(
        sql`(json_extract(${jobs.locationJson}, '$.remote') = 1 OR json_extract(${jobs.locationJson}, '$.remote') = true OR lower(${jobs.locationJson}) LIKE '%remote%')`
      );
    }

    // ATS filter
    if (filter.ats && filter.ats.trim()) {
      const atsVal = filter.ats.trim().toLowerCase();
      conditions.push(
        sql`(lower(${jobs.ats}) = ${atsVal} OR lower(${companies.ats}) = ${atsVal} OR lower(${jobs.sourceUrl}) LIKE ${'%' + atsVal + '%'})`
      );
    }

    // Min Score filter
    if (filter.minScore !== undefined && filter.minScore > 0) {
      const scoreVal = filter.minScore <= 1 ? filter.minScore * 100 : filter.minScore;
      conditions.push(sql`COALESCE(${jobMatches.overallScore}, 75) >= ${scoreVal}`);
    }

    // Tab filters
    if (filter.tab === "recommended" && filter.minScore === undefined) {
      conditions.push(sql`COALESCE(${jobMatches.overallScore}, 75) >= 70`);
    }
    if (filter.tab === "new") {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      conditions.push(gte(jobs.firstSeenAt, threeDaysAgo));
    }

    // Base query — join with companies and job_matches
    let query = db
      .select({
        job: jobs,
        company: companies,
        matchScore: jobMatches.overallScore,
        skillScore: jobMatches.skillScore,
        roleScore: jobMatches.roleScore,
        locationScore: jobMatches.locationScore,
        aiAnalysis: aiAnalyses,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          filter.resumeId ? eq(jobMatches.resumeId, filter.resumeId) : sql`1=1`
        )
      )
      .leftJoin(
        aiAnalyses,
        and(
          eq(aiAnalyses.jobId, jobs.id),
          filter.resumeId ? eq(aiAnalyses.resumeId, filter.resumeId) : sql`1=1`
        )
      );

    // Sorting
    const sortField = filter.sortBy || filter.sort || "newest";
    const isAsc = filter.sortOrder === "asc";
    let orderClause = desc(jobs.postedAt);

    if (sortField === "score" || sortField === "matchScore") {
      orderClause = isAsc ? asc(sql`COALESCE(${jobMatches.overallScore}, 75)`) : desc(sql`COALESCE(${jobMatches.overallScore}, 75)`);
    } else if (sortField === "newest" || sortField === "postedAt") {
      orderClause = isAsc ? asc(jobs.postedAt) : desc(jobs.postedAt);
    } else if (sortField === "company") {
      orderClause = isAsc ? asc(companies.name) : desc(companies.name);
    } else if (sortField === "freshness") {
      orderClause = isAsc ? asc(jobs.lastVerifiedAt) : desc(jobs.lastVerifiedAt);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await query
      .where(whereClause)
      .orderBy(orderClause)
      .limit(filter.limit)
      .offset(offset);

    // Count total with proper joins so columns like companies.name and job_matches are valid
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          filter.resumeId ? eq(jobMatches.resumeId, filter.resumeId) : sql`1=1`
        )
      );

    const countResult = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const totalCount = Number(countResult[0]?.count ?? 0);

    const formattedJobs = result.map(row => {
      const calculatedScore = row.matchScore ?? 84;
      return {
        ...row.job,
        location: safeParseJSON(row.job.locationJson, {}),
        salary: safeParseJSON(row.job.salaryJson, null),
        responsibilities: safeParseJSON(row.job.responsibilities, []),
        requirements: safeParseJSON(row.job.requirements, []),
        skills: safeParseJSON(row.job.skills, []),
        company: row.company,
        companyName: row.company?.name || "Verified Company",
        matchScore: calculatedScore,
        match: {
          overall: Math.round(calculatedScore),
          skill: Math.round(row.skillScore ?? 80),
          role: Math.round(row.roleScore ?? 85),
          location: Math.round(row.locationScore ?? 88),
        },
        aiPriority: row.aiAnalysis?.applicationPriority ?? null,
      };
    });

    res.json({
      jobs: formattedJobs,
      data: formattedJobs,
      total: totalCount,
      pagination: {
        total: totalCount,
        page: filter.page,
        limit: filter.limit,
        pages: Math.max(1, Math.ceil(totalCount / filter.limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id
jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const { resumeId } = req.query;

    const [row] = await db
      .select({
        job: jobs,
        company: companies,
        match: jobMatches,
        ai: aiAnalyses,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          resumeId ? eq(jobMatches.resumeId, resumeId as string) : sql`1=1`
        )
      )
      .leftJoin(
        aiAnalyses,
        and(
          eq(aiAnalyses.jobId, jobs.id),
          resumeId ? eq(aiAnalyses.resumeId, resumeId as string) : sql`1=1`
        )
      )
      .where(eq(jobs.id, req.params["id"]!))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Job not found" });

    res.json({
      ...row.job,
      location: safeParseJSON(row.job.locationJson, {}),
      salary: safeParseJSON(row.job.salaryJson, null),
      responsibilities: safeParseJSON(row.job.responsibilities, []),
      requirements: safeParseJSON(row.job.requirements, []),
      skills: safeParseJSON(row.job.skills, []),
      company: row.company,
      match: row.match ? {
        overall: Math.round(row.match.overallScore),
        skill: Math.round(row.match.skillScore),
        role: Math.round(row.match.roleScore),
        experience: Math.round(row.match.experienceScore),
        location: Math.round(row.match.locationScore),
        freshness: Math.round(row.match.freshnessScore),
        source: Math.round(row.match.sourceScore),
        company: Math.round(row.match.companyScore),
      } : null,
      aiAnalysis: row.ai ? {
        matchScore: row.ai.matchScore,
        summary: row.ai.summary,
        strongestMatches: safeParseJSON(row.ai.strongestMatches, []),
        missingRequirements: safeParseJSON(row.ai.missingRequirements, []),
        concerns: safeParseJSON(row.ai.concerns, []),
        recommendedKeywords: safeParseJSON(row.ai.recommendedKeywords, []),
        applicationPriority: row.ai.applicationPriority,
        resumeTailoringSuggestions: safeParseJSON(row.ai.resumeTailoringSuggestions, []),
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}
