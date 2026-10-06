import { Router } from "express";
import { getDatabase, jobs, applications, companies, jobMatches, jobSkills } from "@agentforge/database";
import { sql, eq, gte, and, desc } from "drizzle-orm";

export const analyticsRouter = Router();

// GET /api/analytics/overview
analyticsRouter.get("/overview", async (_req, res, next) => {
  try {
    const db = getDatabase();

    const [{ totalJobs }] = await db.select({ totalJobs: sql<number>`count(*)` }).from(jobs);
    const [{ activeJobs }] = await db.select({ activeJobs: sql<number>`count(*)` }).from(jobs).where(eq(jobs.status, "active"));
    const [{ totalCompanies }] = await db.select({ totalCompanies: sql<number>`count(*)` }).from(companies);

    // Application stats
    const appStats = await db
      .select({
        status: applications.status,
        count: sql<number>`count(*)`,
      })
      .from(applications)
      .groupBy(applications.status);

    const appMap: Record<string, number> = {};
    for (const s of appStats) appMap[s.status] = Number(s.count);

    // High match jobs (>80%)
    const [{ highMatch }] = await db
      .select({ highMatch: sql<number>`count(*)` })
      .from(jobMatches)
      .where(gte(jobMatches.overallScore, 80));

    // New jobs in last 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ newToday }] = await db
      .select({ newToday: sql<number>`count(*)` })
      .from(jobs)
      .where(gte(jobs.firstSeenAt, yesterday));

    res.json({
      totalJobs: Number(totalJobs),
      activeJobs: Number(activeJobs),
      totalCompanies: Number(totalCompanies),
      highMatchJobs: Number(highMatch),
      newToday: Number(newToday),
      applications: appMap,
      totalApplications: Object.values(appMap).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/skills — top skills in matching jobs
analyticsRouter.get("/skills", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const topSkills = await db
      .select({
        skill: jobSkills.canonical,
        count: sql<number>`count(*)`,
      })
      .from(jobSkills)
      .groupBy(jobSkills.canonical)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    res.json(topSkills.map(s => ({ skill: s.skill, count: Number(s.count) })));
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/companies — most hiring companies
analyticsRouter.get("/companies", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select({
        company: companies,
        jobCount: sql<number>`count(${jobs.id})`,
      })
      .from(companies)
      .leftJoin(jobs, and(eq(jobs.companyId, companies.id), eq(jobs.status, "active")))
      .groupBy(companies.id)
      .orderBy(desc(sql`count(${jobs.id})`))
      .limit(15);

    res.json(result.map(r => ({
      id: r.company.id,
      name: r.company.name,
      domain: r.company.domain,
      ats: r.company.ats,
      jobCount: Number(r.jobCount),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/applications/timeline
analyticsRouter.get("/applications/timeline", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select({
        date: sql<string>`date(applied_at / 1000, 'unixepoch')`,
        count: sql<number>`count(*)`,
      })
      .from(applications)
      .where(sql`applied_at IS NOT NULL`)
      .groupBy(sql`date(applied_at / 1000, 'unixepoch')`)
      .orderBy(sql`date(applied_at / 1000, 'unixepoch')`);

    res.json(result);
  } catch (err) {
    next(err);
  }
});
