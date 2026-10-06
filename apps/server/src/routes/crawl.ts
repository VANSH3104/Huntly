import { Router } from "express";
import { getDatabase, crawlRuns, crawlEvents, crawlErrors, sources, companies, jobs, queueJobs, resumes } from "@agentforge/database";
import { eq, desc, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { LinkedInScraper } from "../crawler/linkedin-scraper.js";
import { createSearchProvider } from "../crawler/search-provider.js";
import { detectATS } from "../crawler/career-discovery.js";
import { getATSAdapter, extractATSSlug } from "../crawler/ats-adapters.js";
import { processExtractedJob } from "../crawler/job-processor.js";

export const crawlRouter = Router();

// GET /api/crawl/runs — recent crawl runs
crawlRouter.get("/runs", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const runs = await db
      .select()
      .from(crawlRuns)
      .orderBy(desc(crawlRuns.startedAt))
      .limit(20);

    res.json(runs.map(r => ({
      ...r,
      stats: safeParseJSON(r.statsJson, {}),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/crawl/events — recent events with SSE support
crawlRouter.get("/events/stream", (req, res, next) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Poll DB for new events every second
  let lastId = "0";
  const interval = setInterval(async () => {
    try {
      const db = getDatabase();
      const events = await db
        .select()
        .from(crawlEvents)
        .where(sql`${crawlEvents.id} > ${lastId}`)
        .orderBy(crawlEvents.createdAt)
        .limit(50);

      for (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        lastId = event.id;
      }
    } catch (_e) {
      // Ignore errors in SSE polling
    }
  }, 1000);

  req.on("close", () => {
    clearInterval(interval);
  });
});

// GET /api/crawl/events — recent events as JSON
crawlRouter.get("/events", async (req, res, next) => {
  try {
    const db = getDatabase();
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "50"), 10));
    const events = await db
      .select()
      .from(crawlEvents)
      .orderBy(desc(crawlEvents.createdAt))
      .limit(limit);

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// GET /api/crawl/stats
crawlRouter.get("/stats", async (_req, res, next) => {
  try {
    const db = getDatabase();

    const [latestRun] = await db
      .select()
      .from(crawlRuns)
      .where(eq(crawlRuns.status, "running"))
      .limit(1);

    const [{ totalJobs }] = await db
      .select({ totalJobs: sql<number>`count(*)` })
      .from(jobs);

    const [{ activeJobs }] = await db
      .select({ activeJobs: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, "active"));

    const [{ totalCompanies }] = await db
      .select({ totalCompanies: sql<number>`count(*)` })
      .from(companies);

    const [{ totalSources }] = await db
      .select({ totalSources: sql<number>`count(*)` })
      .from(sources)
      .where(eq(sources.isActive, true));

    const [{ queuedJobs }] = await db
      .select({ queuedJobs: sql<number>`count(*)` })
      .from(queueJobs)
      .where(eq(queueJobs.status, "pending"));

    res.json({
      currentRun: latestRun ? {
        ...latestRun,
        stats: safeParseJSON(latestRun.statsJson, {}),
      } : null,
      totals: {
        jobs: Number(totalJobs),
        activeJobs: Number(activeJobs),
        companies: Number(totalCompanies),
        sources: Number(totalSources),
        queuedJobs: Number(queuedJobs),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/start — trigger a crawl
crawlRouter.post("/start", async (req, res, next) => {
  try {
    const schema = z.object({
      type: z.enum(["search", "career", "verify", "full"]).default("full"),
      sourceIds: z.array(z.string()).optional(),
    });
    const data = schema.parse(req.body);

    const db = getDatabase();
    const runId = uuidv4();

    await db.insert(crawlRuns).values({
      id: runId,
      type: data.type,
      status: "pending",
      statsJson: JSON.stringify({
        urlsDiscovered: 0,
        urlsCrawled: 0,
        jobsExtracted: 0,
        duplicatesRemoved: 0,
        jobsUpdated: 0,
        errors: 0,
      }),
    });

    // Enqueue
    await db.insert(queueJobs).values({
      id: uuidv4(),
      type: data.type === "full" ? "search_discovery" : `crawl_career_page`,
      payloadJson: JSON.stringify({ runId, sourceIds: data.sourceIds }),
      status: "pending",
      priority: 1,
    });

    res.json({ runId });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/linkedin — scrape live LinkedIn job postings
crawlRouter.post("/linkedin", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().default("Software Engineer"),
      location: z.string().default("India"),
      remoteOnly: z.coerce.boolean().optional(),
      limit: z.coerce.number().optional().default(25),
    });
    const { keywords, location, remoteOnly, limit } = schema.parse(req.body);

    const scraper = new LinkedInScraper();
    const items = await scraper.scrapeJobs({ keywords, location, remoteOnly, limit });
    const result = await scraper.ingestJobs(items);

    res.json({
      success: true,
      scraped: items.length,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/discover — discover live career pages via Google + LinkedIn for given keywords
crawlRouter.post("/discover", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().optional(),
      role: z.string().optional(),
      location: z.string().optional(),
      remoteOnly: z.coerce.boolean().optional(),
      limit: z.coerce.number().optional().default(30),
    });
    const { keywords, role, location, remoteOnly, limit } = schema.parse(req.body);
    const searchTerm = (keywords || role || "Software Engineer").trim();
    const loc = (location || "India").trim();

    const db = getDatabase();
    const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);

    let linkedinCount = 0;
    let atsCount = 0;

    // 1. Scrape live LinkedIn jobs
    try {
      const scraper = new LinkedInScraper();
      const linkedinJobs = await scraper.scrapeJobs({
        keywords: searchTerm,
        location: loc,
        remoteOnly: !!remoteOnly,
        limit,
      });
      const ingested = await scraper.ingestJobs(linkedinJobs);
      linkedinCount = ingested.inserted;
    } catch (e) {
      console.error("[Crawl Route] LinkedIn scrape error:", e);
    }

    // 2. Discover official ATS career pages via Google / Serper search
    try {
      const searchProvider = createSearchProvider();
      const searchQuery = `"${searchTerm}" ${loc} inurl:jobs site:greenhouse.io OR site:lever.co OR site:ashbyhq.com`;
      const searchResults = await searchProvider.search(searchQuery);

      for (const result of searchResults.slice(0, 10)) {
        const ats = detectATS(result.url);
        if (!ats) continue;
        const slug = extractATSSlug(result.url, ats);
        if (!slug) continue;
        const adapter = getATSAdapter(ats);
        if (!adapter) continue;

        const domain = `${slug}.com`;
        let [comp] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
        if (!comp) {
          const compId = uuidv4();
          const compName = slug.charAt(0).toUpperCase() + slug.slice(1);
          await db.insert(companies).values({
            id: compId,
            name: compName,
            domain,
            careerPage: result.url,
            ats,
          });
          [comp] = await db.select().from(companies).where(eq(companies.id, compId)).limit(1);
        }
        if (!comp) continue;

        const jobsFromAts = await adapter.discoverJobs(slug);
        for (const j of jobsFromAts.slice(0, 15)) {
          const res = await processExtractedJob(j, comp.id, undefined, "api-triggered", activeResume?.id);
          if (res.action === "created") atsCount++;
        }
      }
    } catch (e) {
      console.error("[Crawl Route] ATS search error:", e);
    }

    res.json({
      success: true,
      searchTerm,
      location: loc,
      discovered: {
        linkedin: linkedinCount,
        careerPages: atsCount,
        total: linkedinCount + atsCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/probe — test Playwright live extraction against any career page URL
crawlRouter.post("/probe", async (req, res, next) => {
  try {
    const { url } = z.object({ url: z.string().url() }).parse(req.body);
    const { PlaywrightCrawler } = await import("../crawler/playwright-crawler.js");
    const crawler = new PlaywrightCrawler();
    const result = await crawler.crawl(url, {
      maxJobs: 50,
      timeout: 25000,
      handleScroll: true,
    });
    res.json({
      success: true,
      url,
      extractionLayer: result.extractionLayer,
      classifiedAs: result.classifiedAs,
      pagesVisited: result.pagesVisited,
      endpointsDiscovered: result.endpointsDiscovered,
      durationMs: result.duration,
      jobsCount: result.jobs.length,
      sampleJobs: result.jobs.slice(0, 5),
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to crawl URL with Playwright",
    });
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

