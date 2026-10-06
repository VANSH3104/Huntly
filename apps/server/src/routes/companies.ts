import { Router } from "express";
import { getDatabase, companies, sources, jobs } from "@agentforge/database";
import { eq, desc, sql, like, and } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

export const companiesRouter = Router();

// GET /api/companies
companiesRouter.get("/", async (req, res, next) => {
  try {
    const db = getDatabase();
    const search = req.query["search"] as string | undefined;

    const result = await db
      .select({
        company: companies,
        activeJobCount: sql<number>`(SELECT COUNT(*) FROM jobs WHERE company_id = ${companies.id} AND status = 'active')`,
        sourceCount: sql<number>`(SELECT COUNT(*) FROM sources WHERE company_id = ${companies.id})`,
      })
      .from(companies)
      .where(
        search ? like(companies.name, `%${search}%`) : undefined
      )
      .orderBy(desc(companies.lastCrawledAt))
      .limit(100);

    res.json(result.map(r => ({
      ...r.company,
      activeJobCount: Number(r.activeJobCount),
      sourceCount: Number(r.sourceCount),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id
companiesRouter.get("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, req.params["id"]!))
      .limit(1);

    if (!company) return res.status(404).json({ error: "Company not found" });

    const companySources = await db
      .select()
      .from(sources)
      .where(eq(sources.companyId, company.id));

    const recentJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, company.id), eq(jobs.status, "active")))
      .orderBy(desc(jobs.postedAt))
      .limit(10);

    res.json({ ...company, sources: companySources, recentJobs });
  } catch (err) {
    next(err);
  }
});

// POST /api/companies (manually add)
companiesRouter.post("/", async (req, res, next) => {
  try {
    const db = getDatabase();
    const schema = z.object({
      name: z.string().min(1),
      domain: z.string().min(1),
      careerPage: z.string().url().optional(),
      website: z.string().url().optional(),
      isPreferred: z.boolean().optional(),
    });
    const data = schema.parse(req.body);

    const id = uuidv4();
    await db.insert(companies).values({
      id,
      name: data.name,
      domain: data.domain,
      careerPage: data.careerPage,
      website: data.website,
      isPreferred: data.isPreferred ?? false,
    });

    // If career page provided, add as source
    if (data.careerPage) {
      await db.insert(sources).values({
        id: uuidv4(),
        companyId: id,
        url: data.careerPage,
        type: "company",
        priority: 1.0,
        isActive: true,
      });
    }

    res.json({ id, ...data });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/companies/:id (block/prefer)
companiesRouter.patch("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const schema = z.object({
      isBlocked: z.boolean().optional(),
      isPreferred: z.boolean().optional(),
    });
    const data = schema.parse(req.body);

    await db.update(companies).set(data).where(eq(companies.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
