import { Router } from "express";
import { getDatabase, sources, companies } from "@agentforge/database";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

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
