import { Router } from "express";
import { getDatabase, sources, companies, crawlRuns, queueJobs } from "@huntly/database";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { extractDomain } from "../utils/normalize.js";

export const sourcesRouter = Router();

sourcesRouter.get("/", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .orderBy(desc(sources.lastCrawledAt));
    res.json(result.map(r => ({ ...r.source, company: r.company })));
  } catch (err) {
    next(err);
  }
});

sourcesRouter.get("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const [result] = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(eq(sources.id, req.params["id"]!))
      .limit(1);

    if (!result) {
      return res.status(404).json({ error: "Source not found" });
    }
    res.json({ ...result.source, company: result.company });
  } catch (err) {
    next(err);
  }
});

// POST /api/sources/:id/crawl — queue high-priority crawl for this specific source
sourcesRouter.post("/:id/crawl", async (req, res, next) => {
  try {
    const sourceId = req.params["id"]!;
    const db = getDatabase();

    const [row] = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(eq(sources.id, sourceId))
      .limit(1);

    if (!row) {
      return res.status(404).json({ error: `Source "${sourceId}" not found` });
    }

    const { source, company } = row;
    const runId = uuidv4();
    const domain = company?.domain || extractDomain(source.url) || new URL(source.url).hostname;

    // Create crawl run record
    await db.insert(crawlRuns).values({
      id: runId,
      type: "career",
      status: "pending",
    });

    // Enqueue job with priority 0 (immediate execution by worker orchestrator)
    const queueJobId = uuidv4();
    await db.insert(queueJobs).values({
      id: queueJobId,
      type: "crawl_career_page",
      payloadJson: JSON.stringify({
        runId,
        domain,
        url: source.url,
        companyName: company?.name || domain,
        sourceId: source.id,
        ats: source.type === "ats" ? (company?.ats ?? undefined) : undefined,
      }),
      status: "pending",
      priority: 0,
    });

    res.json({
      success: true,
      queued: true,
      runId,
      jobId: queueJobId,
      sourceId: source.id,
      url: source.url,
      company: company?.name || domain,
    });
  } catch (err) {
    next(err);
  }
});

sourcesRouter.post("/", async (req, res, next) => {
  try {
    const schema = z.object({
      url: z.string().url(),
      type: z.enum(["company", "ats", "job_board", "search"]),
      companyId: z.string().optional(),
      crawlIntervalMinutes: z.number().default(360),
    });
    const data = schema.parse(req.body);

    const db = getDatabase();
    const id = uuidv4();
    await db.insert(sources).values({ id, ...data, isActive: true });
    res.json({ id });
  } catch (err) {
    next(err);
  }
});

sourcesRouter.patch("/:id", async (req, res, next) => {
  try {
    const schema = z.object({
      isActive: z.boolean().optional(),
      crawlIntervalMinutes: z.number().optional(),
    });
    const data = schema.parse(req.body);
    const db = getDatabase();
    await db.update(sources).set(data).where(eq(sources.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

sourcesRouter.delete("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    await db.delete(sources).where(eq(sources.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
