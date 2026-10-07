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

    // 1. Keyword Multi-Search: supports comma-separated (e.g. "software engineer, backend, intern")
    if (filter.search && filter.search.trim()) {
      const rawTerms = filter.search
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (rawTerms.length > 0) {
        const termConditions = rawTerms.map((term) => {
          const exactLike = `%${term}%`;
          const words = term.split(/\s+/).filter((w) => w.length > 1);
          if (words.length > 1) {
            const wordLikes = words.map((w) => `%${w}%`);
            return sql`(
              lower(${jobs.title}) LIKE ${exactLike} OR
              lower(${jobs.normalizedTitle}) LIKE ${exactLike} OR
              lower(${companies.name}) LIKE ${exactLike} OR
              lower(${jobs.skills}) LIKE ${exactLike} OR
              lower(${jobs.description}) LIKE ${exactLike} OR
              (${sql.join(
                wordLikes.map(
                  (w) =>
                    sql`(lower(${jobs.title}) LIKE ${w} OR lower(${jobs.skills}) LIKE ${w} OR lower(${companies.name}) LIKE ${w})`
                ),
                sql` AND `
              )})
            )`;
          }

          return sql`(
            lower(${jobs.title}) LIKE ${exactLike} OR
            lower(${jobs.normalizedTitle}) LIKE ${exactLike} OR
            lower(${companies.name}) LIKE ${exactLike} OR
            lower(${jobs.skills}) LIKE ${exactLike} OR
            lower(${jobs.description}) LIKE ${exactLike}
          )`;
        });

        conditions.push(sql`(${sql.join(termConditions, sql` OR `)})`);
      }
    }

    // 2. Role Multi-Filter: supports comma-separated (e.g. "Backend, Frontend, Full Stack")
    if (filter.role && filter.role.trim()) {
      const rawRoles = filter.role
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);

      if (rawRoles.length > 0) {
        const roleConditions = rawRoles.map((role) => {
          const roleLike = `%${role}%`;
          return sql`(
            lower(${jobs.normalizedTitle}) LIKE ${roleLike} OR
            lower(${jobs.title}) LIKE ${roleLike} OR
            lower(${jobs.skills}) LIKE ${roleLike} OR
            lower(${jobs.description}) LIKE ${roleLike}
          )`;
        });
        conditions.push(sql`(${sql.join(roleConditions, sql` OR `)})`);
      }
    }

    // 3. Location Multi-Filter: supports comma-separated (e.g. "Bengaluru, Remote, Chennai")
    if (filter.location && filter.location.trim()) {
      const rawLocs = filter.location
        .split(",")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);

      if (rawLocs.length > 0) {
        const locConditions = rawLocs.map((loc) => {
          const locLike = `%${loc}%`;
          return sql`(lower(${jobs.locationJson}) LIKE ${locLike} OR lower(${jobs.title}) LIKE ${locLike} OR lower(${jobs.description}) LIKE ${locLike})`;
        });
        conditions.push(sql`(${sql.join(locConditions, sql` OR `)})`);
      }
    }

    // Remote filter
    if (filter.remote || filter.remoteOnly) {
      conditions.push(
        sql`(json_extract(${jobs.locationJson}, '$.remote') = 1 OR json_extract(${jobs.locationJson}, '$.remote') = true OR lower(${jobs.locationJson}) LIKE '%remote%')`
      );
    }

    // ATS / Platform filter (supports Greenhouse, Lever, Ashby, Workday, and YC Startups)
    if (filter.ats && filter.ats.trim()) {
      const atsVal = filter.ats.trim().toLowerCase();
      if (atsVal === "yc") {
        conditions.push(
          sql`(
            lower(${jobs.description}) LIKE '%y combinator%' OR
            lower(${jobs.title}) LIKE '%yc%' OR
            lower(${companies.name}) LIKE '%yc%' OR
            lower(${jobs.sourceUrl}) LIKE '%workatastartup%' OR
            lower(${jobs.applyUrl}) LIKE '%workatastartup%' OR
            lower(${jobs.ats}) = 'ashby' OR
            lower(${companies.ats}) = 'ashby'
          )`
        );
      } else {
        conditions.push(
          sql`(lower(${jobs.ats}) = ${atsVal} OR lower(${companies.ats}) = ${atsVal} OR lower(${jobs.sourceUrl}) LIKE ${'%' + atsVal + '%'})`
        );
      }
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

    // On-demand description enrichment if job has placeholder description
    // On-demand description enrichment if job has placeholder/stub description
    let jobData = { ...row.job };
    const rawDesc = jobData.description || "";
    const cleanDesc = rawDesc.replace(/\s+/g, " ").trim();
    const isStub =
      !cleanDesc ||
      cleanDesc.startsWith("Direct verified job posting") ||
      cleanDesc.length < 150 ||
      cleanDesc === jobData.title.trim() ||
      (cleanDesc.startsWith(jobData.title.trim()) && cleanDesc.length < jobData.title.length + 50);

    if (
      isStub &&
      (jobData.applyUrl?.includes("linkedin.com") || jobData.sourceUrl?.includes("linkedin.com"))
    ) {
      const targetUrl = jobData.applyUrl || jobData.sourceUrl || "";
      const idMatch = targetUrl.match(/-([0-9]{8,15})/) || targetUrl.match(/\/([0-9]{8,15})/);
      const linkedinId = idMatch ? idMatch[1] : (jobData.externalJobId || "");
      if (linkedinId) {
        try {
          const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedinId}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(apiUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (response.ok) {
            const html = await response.text();
            const idx = html.indexOf("show-more-less-html__markup");
            if (idx !== -1) {
              const startTagEnd = html.indexOf(">", idx);
              const endTag = html.indexOf("</section>", startTagEnd);
              let rawMarkup = "";
              if (startTagEnd !== -1 && endTag !== -1) {
                rawMarkup = html.slice(startTagEnd + 1, endTag);
              } else if (startTagEnd !== -1) {
                rawMarkup = html.slice(startTagEnd + 1, startTagEnd + 8000);
              }

              if (rawMarkup) {
                const fullText = rawMarkup
                  .replace(/&amp;/g, "&")
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">")
                  .replace(/&quot;/g, "\"")
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, " ")
                  .replace(/<br\s*\/?>/gi, "\n")
                  .replace(/<\/p>/gi, "\n\n")
                  .replace(/<li>/gi, "\n• ")
                  .replace(/<\/?[^>]+(>|$)/g, "")
                  .replace(/[ \t]+/g, " ")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();

                if (fullText.length > 100) {
                  jobData.description = fullText;

                  // Infer experience level properly
                  const tLower = jobData.title.toLowerCase();
                  let exp = jobData.experienceLevel;
                  if (!exp || exp === "Mid - Senior") {
                    if (tLower.includes("intern")) exp = "Internship";
                    else if (tLower.includes("associate") || tLower.includes("junior") || tLower.includes("fresher")) exp = "Entry Level (0-2 yrs)";
                    else if (tLower.includes("senior") || tLower.includes("lead") || tLower.includes("staff")) exp = "Senior / Lead";
                    else exp = "Mid Level (2-5 yrs)";
                    jobData.experienceLevel = exp;
                  }

                  // Parse responsibilities
                  let parsedResponsibilities: string[] = [];
                  const respMatch = fullText.match(/(?:Responsibilities|Key Responsibilities|What you'll do|What you will do)[\s\S]*?(?=(?:Requirements|Qualifications|Basic Qualifications|Preferred Qualifications|What We Offer|Benefits|$))/i);
                  if (respMatch) {
                    parsedResponsibilities = respMatch[0]
                      .split("\n")
                      .filter((l) => l.trim().startsWith("•"))
                      .map((l) => l.replace(/^[•\s-]+/, "").trim())
                      .filter((l) => l.length > 5);
                  }

                  // Parse requirements
                  let parsedRequirements: string[] = [];
                  const reqMatch = fullText.match(/(?:Requirements|Qualifications|Basic Qualifications|What you'll need|What you bring)[\s\S]*?(?=(?:Preferred Qualifications|Nice to Have|What We Offer|Benefits|The duties|$))/i);
                  if (reqMatch) {
                    parsedRequirements = reqMatch[0]
                      .split("\n")
                      .filter((l) => l.trim().startsWith("•"))
                      .map((l) => l.replace(/^[•\s-]+/, "").trim())
                      .filter((l) => l.length > 5);
                  }

                  if (parsedResponsibilities.length > 0) {
                    jobData.responsibilities = JSON.stringify(parsedResponsibilities);
                  }
                  if (parsedRequirements.length > 0) {
                    jobData.requirements = JSON.stringify(parsedRequirements);
                  }

                  // Update database
                  db.update(jobs)
                    .set({
                      description: fullText,
                      experienceLevel: exp,
                      responsibilities: jobData.responsibilities,
                      requirements: jobData.requirements,
                    })
                    .where(eq(jobs.id, jobData.id))
                    .run();
                }
              }
            }
          }
        } catch {
          // Graceful timeout
        }
      }
    }

    // Always ensure experienceLevel is accurate based on title
    if (!jobData.experienceLevel) {
      const tLower = jobData.title.toLowerCase();
      if (tLower.includes("intern")) jobData.experienceLevel = "Internship";
      else if (tLower.includes("associate") || tLower.includes("junior") || tLower.includes("fresher")) jobData.experienceLevel = "Entry Level (0-2 yrs)";
      else if (tLower.includes("senior") || tLower.includes("lead") || tLower.includes("staff")) jobData.experienceLevel = "Senior / Lead";
      else jobData.experienceLevel = "Mid Level (2-5 yrs)";
    }

    res.json({
      ...jobData,
      location: safeParseJSON(jobData.locationJson, {}),
      salary: safeParseJSON(jobData.salaryJson, null),
      responsibilities: safeParseJSON(jobData.responsibilities, []),
      requirements: safeParseJSON(jobData.requirements, []),
      skills: safeParseJSON(jobData.skills, []),
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
