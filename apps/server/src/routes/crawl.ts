import { Router } from "express";
import { getDatabase, crawlRuns, crawlEvents, crawlErrors, sources, companies, jobs, queueJobs, resumes } from "@huntly/database";
import { eq, desc, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { LinkedInScraper } from "../crawler/linkedin-scraper.js";
import { createSearchProvider } from "../crawler/search-provider.js";
import { detectATS } from "../crawler/career-discovery.js";
import { getATSAdapter, extractATSSlug } from "../crawler/ats-adapters.js";
import { processExtractedJob } from "../crawler/job-processor.js";
import { socialAndYCScraper } from "../crawler/social-yc-scraper.js";
import { BOARDS, runBoards, crawlLive, type LiveEvent } from "../crawler/job-boards.js";

export const crawlRouter = Router();

// GET /api/crawl/boards — public job boards available for scraping
crawlRouter.get("/boards", (_req, res) => {
  res.json({
    boards: Object.entries(BOARDS).map(([id, b]) => ({
      id, label: b.label, enabled: b.enabled, ...(b.needsKey ? { needsKey: true, envVars: b.needsKey } : {}),
    })),
  });
});

// POST /api/crawl/boards — scrape public job boards + company ATS sweeps and ingest results
crawlRouter.post("/boards", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().trim().optional(),
      boards: z.array(z.enum(Object.keys(BOARDS) as [string, ...string[]])).optional(),
      limit: z.coerce.number().int().min(1).max(5000).optional().default(200),
    });
    const { keywords, boards, limit } = schema.parse(req.body ?? {});

    const perBoard = await runBoards({ keywords: keywords || undefined, boards, limit });

    res.json({
      success: true,
      scraped: perBoard.reduce((n, b) => n + b.fetched, 0),
      added: perBoard.reduce((n, b) => n + b.added, 0),
      updated: perBoard.reduce((n, b) => n + b.updated, 0),
      perBoard: perBoard.map(({ board, fetched, added, error }) => ({ board, fetched, added, ...(error ? { error } : {}) })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/crawl/live — SSE stream of board scraping progress (board_start, job_added, board_done, error)
crawlRouter.get("/live", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const onEvent = (evt: LiveEvent) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  crawlLive.on("event", onEvent);
  // Proxies and browsers drop idle event streams; a comment line keeps it open.
  const ping = setInterval(() => res.write(":ping\n\n"), 20_000);

  req.on("close", () => {
    clearInterval(ping);
    crawlLive.off("event", onEvent);
  });
});

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

// POST /api/crawl/twitter — scrape live Twitter/X hiring tweets & posts
crawlRouter.post("/twitter", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().optional(),
      role: z.string().optional(),
      location: z.string().optional(),
      limit: z.coerce.number().optional().default(20),
    });
    const { keywords, role, location, limit } = schema.parse(req.body);

    const items = await socialAndYCScraper.scrapeTwitterJobs({
      keywords,
      role,
      location,
      limit,
    });
    const result = await socialAndYCScraper.ingestJobs(items);

    res.json({
      success: true,
      scraped: items.length,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/yc — scrape live Y Combinator startup job postings
crawlRouter.post("/yc", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().optional(),
      role: z.string().optional(),
      location: z.string().optional(),
      limit: z.coerce.number().optional().default(25),
    });
    const { keywords, role, location, limit } = schema.parse(req.body);

    const items = await socialAndYCScraper.scrapeYCJobs({
      keywords,
      role,
      location,
      limit,
    });
    const result = await socialAndYCScraper.ingestJobs(items);

    res.json({
      success: true,
      scraped: items.length,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/hn — scrape live Hacker News "Who is Hiring?" monthly thread
crawlRouter.post("/hn", async (req, res, next) => {
  try {
    const schema = z.object({
      keywords: z.string().optional(),
      role: z.string().optional(),
      limit: z.coerce.number().optional().default(30),
    });
    const { keywords, role, limit } = schema.parse(req.body);

    const items = await socialAndYCScraper.scrapeHNJobs({
      keywords,
      role,
      limit,
    });
    const result = await socialAndYCScraper.ingestJobs(items);

    res.json({
      success: true,
      scraped: items.length,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/discover — discover live career pages via Google + LinkedIn + Twitter + YC for given keywords
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

    const runId = uuidv4();
    await db.insert(crawlRuns).values({
      id: runId,
      type: "search",
      status: "running",
      startedAt: new Date(),
      statsJson: JSON.stringify({ searchTerm, location: loc, remoteOnly }),
    });

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

    // 2. Discover official ATS & YC career pages via Google / Serper search
    try {
      const searchProvider = createSearchProvider();
      // Search Greenhouse, Lever, Ashby, and YC startup career boards
      const searchQuery = `"${searchTerm}" ${loc} (site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workatastartup.com OR "Y Combinator") inurl:jobs`;
      const searchResults = await searchProvider.search(searchQuery);

      for (const result of searchResults.slice(0, 15)) {
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
          try {
            await db.insert(companies).values({
              id: compId,
              name: compName,
              domain,
              careerPage: result.url,
              ats,
            });
            [comp] = await db.select().from(companies).where(eq(companies.id, compId)).limit(1);
          } catch {
            [comp] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
          }
        }
        if (!comp) continue;

        const jobsFromAts = await adapter.discoverJobs(slug);
        for (const j of jobsFromAts.slice(0, 20)) {
          const res = await processExtractedJob(j, comp.id, undefined, runId, activeResume?.id);
          if (res.action === "created") atsCount++;
        }
      }
    } catch (e) {
      console.error("[Crawl Route] ATS & YC career search error:", e);
    }

    // 3. Scrape live Twitter/X hiring tweets
    let twitterCount = 0;
    try {
      const twitterJobs = await socialAndYCScraper.scrapeTwitterJobs({
        role: searchTerm,
        location: loc,
        limit: 15,
      });
      const twitterResult = await socialAndYCScraper.ingestJobs(twitterJobs);
      twitterCount = twitterResult.added;
    } catch (e) {
      console.error("[Crawl Route] Twitter scrape error:", e);
    }

    // 4. Scrape live Y Combinator startup positions
    let ycCount = 0;
    try {
      const ycJobs = await socialAndYCScraper.scrapeYCJobs({
        role: searchTerm,
        location: loc,
        limit: 15,
      });
      const ycResult = await socialAndYCScraper.ingestJobs(ycJobs);
      ycCount = ycResult.added;
    } catch (e) {
      console.error("[Crawl Route] YC scrape error:", e);
    }

    const totalAdded = linkedinCount + atsCount + twitterCount + ycCount;

    // Mark run completed
    await db.update(crawlRuns).set({
      status: "completed",
      finishedAt: new Date(),
      statsJson: JSON.stringify({
        searchTerm,
        location: loc,
        linkedin: linkedinCount,
        careerPages: atsCount,
        twitter: twitterCount,
        yc: ycCount,
        total: totalAdded,
      }),
    }).where(eq(crawlRuns.id, runId));

    res.json({
      success: true,
      searchTerm,
      location: loc,
      discovered: {
        linkedin: linkedinCount,
        careerPages: atsCount,
        twitter: twitterCount,
        yc: ycCount,
        total: totalAdded,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/career-page — crawl individual company career page or YC board and add jobs directly to board
crawlRouter.post("/career-page", async (req, res, next) => {
  try {
    const schema = z.object({
      url: z.string().url(),
      companyName: z.string().optional(),
    });
    const { url, companyName } = schema.parse(req.body);

    const db = getDatabase();
    const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);

    const runId = uuidv4();
    await db.insert(crawlRuns).values({
      id: runId,
      type: "career",
      status: "running",
      startedAt: new Date(),
      statsJson: JSON.stringify({ url, companyName }),
    });

    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const compName = companyName || domain.split(".")[0]?.toUpperCase() || "Company";

    let [company] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
    if (!company) {
      const compId = uuidv4();
      await db.insert(companies).values({
        id: compId,
        name: compName,
        domain,
        website: `https://${domain}`,
        careerPage: url,
      });
      [company] = await db.select().from(companies).where(eq(companies.id, compId)).limit(1);
    }

    if (!company) {
      return res.status(500).json({ error: "Failed to initialize company record" });
    }

    let addedCount = 0;
    const ats = detectATS(url);

    // 1. Try ATS API Adapter if Greenhouse/Lever/Ashby
    if (ats) {
      const slug = extractATSSlug(url, ats);
      const adapter = getATSAdapter(ats);
      if (slug && adapter) {
        const atsJobs = await adapter.discoverJobs(slug);
        for (const j of atsJobs) {
          const result = await processExtractedJob(j, company.id, undefined, runId, activeResume?.id);
          if (result.action === "created") addedCount++;
        }
      }
    }

    // 2. If no ATS or 0 jobs found, use Playwright dynamic crawler
    if (addedCount === 0) {
      const { PlaywrightCrawler } = await import("../crawler/playwright-crawler.js");
      const crawler = new PlaywrightCrawler();
      const crawlResult = await crawler.crawl(url, { maxJobs: 50, timeout: 25000, handleScroll: true });

      for (const j of crawlResult.jobs) {
        const result = await processExtractedJob(j, company.id, undefined, runId, activeResume?.id);
        if (result.action === "created") addedCount++;
      }
    }

    await db.update(crawlRuns).set({
      status: "completed",
      finishedAt: new Date(),
      statsJson: JSON.stringify({ url, addedCount }),
    }).where(eq(crawlRuns.id, runId));

    res.json({
      success: true,
      url,
      company: compName,
      addedJobs: addedCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/crawl/deep-search — crawl all AI-generated combination queries in parallel / sequence
crawlRouter.post("/deep-search", async (req, res, next) => {
  try {
    const schema = z.object({
      queries: z.array(z.string()).min(1),
      location: z.string().optional().default("India"),
      remoteOnly: z.boolean().optional().default(false),
      limitPerQuery: z.number().optional().default(15),
    });
    const { queries, location, remoteOnly, limitPerQuery } = schema.parse(req.body);

    const db = getDatabase();
    const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);

    const runId = uuidv4();
    await db.insert(crawlRuns).values({
      id: runId,
      type: "search",
      status: "running",
      startedAt: new Date(),
      statsJson: JSON.stringify({ queries, location, remoteOnly }),
    });

    const scraper = new LinkedInScraper();
    const searchProvider = createSearchProvider();
    const results: Array<{ query: string; jobsAdded: number }> = [];
    let grandTotal = 0;

    for (const q of queries.slice(0, 15)) {
      const trimmed = q.trim();
      if (!trimmed) continue;
      let queryAdded = 0;

      // Clean query for LinkedIn if it has site: operators
      const linkedInQuery = trimmed.replace(/site:[^\s]+/gi, "").trim() || trimmed;

      // 1. LinkedIn scrape
      try {
        const jobs = await scraper.scrapeJobs({
          keywords: linkedInQuery,
          location,
          remoteOnly,
          limit: limitPerQuery,
        });
        const ingested = await scraper.ingestJobs(jobs);
        queryAdded += ingested.inserted;
      } catch (err) {
        console.warn(`[Deep Search] LinkedIn query failed for "${linkedInQuery}":`, err);
      }

      // 2. ATS / Career Portal discovery
      try {
        let atsQuery = trimmed;
        if (!atsQuery.includes("site:")) {
          atsQuery = `"${trimmed}" ${location} (site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:workatastartup.com OR "Y Combinator") inurl:jobs`;
        }
        const searchResults = await searchProvider.search(atsQuery);

        for (const item of searchResults.slice(0, 10)) {
          const ats = detectATS(item.url);
          if (!ats) continue;
          const slug = extractATSSlug(item.url, ats);
          if (!slug) continue;
          const adapter = getATSAdapter(ats);
          if (!adapter) continue;

          const domain = `${slug}.com`;
          let [comp] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
          if (!comp) {
            const compId = uuidv4();
            const compName = slug.charAt(0).toUpperCase() + slug.slice(1);
            try {
              await db.insert(companies).values({
                id: compId,
                name: compName,
                domain,
                careerPage: item.url,
                ats,
              });
              [comp] = await db.select().from(companies).where(eq(companies.id, compId)).limit(1);
            } catch {
              [comp] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
            }
          }
          if (!comp) continue;

          const jobsFromAts = await adapter.discoverJobs(slug);
          for (const j of jobsFromAts.slice(0, 10)) {
            const extRes = await processExtractedJob(j, comp.id, undefined, runId, activeResume?.id);
            if (extRes.action === "created") {
              queryAdded++;
            }
          }
        }
      } catch (err) {
        console.warn(`[Deep Search] ATS query failed for "${trimmed}":`, err);
      }

      grandTotal += queryAdded;
      results.push({ query: trimmed, jobsAdded: queryAdded });
    }

    await db.update(crawlRuns).set({
      status: "completed",
      finishedAt: new Date(),
      statsJson: JSON.stringify({ queriesCount: queries.length, grandTotal, results }),
    }).where(eq(crawlRuns.id, runId));

    res.json({
      success: true,
      runId,
      totalAdded: grandTotal,
      results,
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

