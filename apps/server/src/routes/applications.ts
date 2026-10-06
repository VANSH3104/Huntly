import { Router } from "express";
import { getDatabase, applications, jobs, companies, resumes } from "@agentforge/database";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

export const applicationsRouter = Router();

const APPLICATION_STATUSES = ["saved", "applied", "oa", "interview", "final", "offer", "rejected", "withdrawn"] as const;

// GET /api/applications
applicationsRouter.get("/", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select({
        application: applications,
        job: jobs,
        company: companies,
        resume: resumes,
      })
      .from(applications)
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(resumes, eq(applications.resumeVersionId, resumes.id))
      .orderBy(desc(applications.updatedAt));

    res.json(result.map(r => ({
      ...r.application,
      job: r.job ? {
        ...r.job,
        location: safeParseJSON(r.job.locationJson, {}),
      } : null,
      company: r.company,
      resumeVersion: r.resume,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/applications/board — kanban grouping
applicationsRouter.get("/board", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select({
        application: applications,
        job: jobs,
        company: companies,
      })
      .from(applications)
      .leftJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(desc(applications.updatedAt));

    // Group by status
    const board: Record<string, unknown[]> = {};
    for (const status of APPLICATION_STATUSES) {
      board[status] = [];
    }

    for (const r of result) {
      const status = r.application.status;
      if (!board[status]) board[status] = [];
      board[status]!.push({
        ...r.application,
        job: r.job ? { ...r.job, location: safeParseJSON(r.job.locationJson, {}) } : null,
        company: r.company,
      });
    }

    res.json(board);
  } catch (err) {
    next(err);
  }
});

// POST /api/applications
applicationsRouter.post("/", async (req, res, next) => {
  try {
    const schema = z.object({
      jobId: z.string(),
      resumeVersionId: z.string().optional(),
      notes: z.string().optional(),
      deadline: z.string().datetime().optional(),
    });
    const data = schema.parse(req.body);

    const db = getDatabase();
    const id = uuidv4();

    await db.insert(applications).values({
      id,
      jobId: data.jobId,
      resumeVersionId: data.resumeVersionId,
      status: "saved",
      notes: data.notes,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
    });

    res.json({ id });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/applications/:id
applicationsRouter.patch("/:id", async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(APPLICATION_STATUSES).optional(),
      notes: z.string().optional(),
      nextAction: z.string().optional(),
      deadline: z.string().datetime().optional(),
      resumeVersionId: z.string().optional(),
      appliedAt: z.string().datetime().optional(),
    });
    const data = schema.parse(req.body);

    const db = getDatabase();
    await db
      .update(applications)
      .set({
        ...data,
        appliedAt: data.appliedAt ? new Date(data.appliedAt) : undefined,
        deadline: data.deadline ? new Date(data.deadline) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, req.params["id"]!));

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}
