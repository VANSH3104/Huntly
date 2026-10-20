/**
 * Worker Orchestrator
 * Manages background crawl workers using a SQLite-backed queue.
 */

import { getDatabase, queueJobs, crawlRuns, crawlEvents, sources, companies, resumes, settings } from "@huntly/database";
import { eq, lte, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createSearchProvider } from "../crawler/search-provider.js";
import { QueryGenerator } from "../crawler/query-generator.js";
import { CareerPageDiscoverer, detectATS } from "../crawler/career-discovery.js";
import { extractFromJsonLD, extractFromHTML, type ExtractedJob } from "../crawler/extractor.js";
import { getATSAdapter, GreenhouseAdapter, LeverAdapter, AshbyAdapter, extractATSSlug } from "../crawler/ats-adapters.js";
import { processExtractedJob } from "../crawler/job-processor.js";
import { extractDomain } from "../utils/normalize.js";
import { LinkedInScraper } from "../crawler/linkedin-scraper.js";
import { PlaywrightCrawler } from "../crawler/playwright-crawler.js";
import { getEndpointStore } from "../crawler/endpoint-store.js";
import { shutdownPlaywrightEngine } from "../crawler/playwright-engine.js";

const JUNK_DOMAINS = new Set([
  "instagram.com", "facebook.com", "telegram.me", "t.me", "threads.com",
  "youtube.com", "tiktok.com", "twitter.com", "x.com", "reddit.com",
  "google.com", "shine.com", "naukri.com", "indeed.com", "glassdoor.co.in",
  "glassdoor.com", "pinterest.com", "whatsapp.com"
]);

export class WorkerOrchestrator {
  private running = false;
  private interval: NodeJS.Timeout | null = null;
  private scheduleInterval: NodeJS.Timeout | null = null;
  private playwrightCrawler = new PlaywrightCrawler();

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log("✓ Worker orchestrator started");

    // Load persisted endpoint store (discover-once, reuse-later)
    getEndpointStore().load().catch(err =>
      console.warn("[Orchestrator] Endpoint store load error:", err)
    );

    // Process queue every 2 seconds
    this.interval = setInterval(() => {
      this.processNextJob().catch(err =>
        console.error("[Orchestrator] Job processing error:", err)
      );
    }, 2000);

    // Kick off an initial discovery crawl so fresh installs get real jobs fast.
    this.bootstrapDiscovery().catch(err =>
      console.error("[Orchestrator] Bootstrap discovery failed:", err)
    );

    // Schedule periodic crawls
    this.scheduleInterval = setInterval(() => {
      this.schedulePeriodicCrawls().catch(err =>
        console.error("[Orchestrator] Schedule error:", err)
      );
    }, 60 * 1000); // Every minute check

    // Periodically flush endpoint store
    setInterval(() => {
      getEndpointStore().save().catch(() => {/* ignore */});
    }, 5 * 60 * 1000);
  }

  /**
   * On a fresh database seeded sources have no lastCrawledAt, so the periodic
   * scheduler would never enqueue them. Bootstrap crawl jobs immediately so
   * seeded sources get crawled and real jobs flow in without manual action.
   *
   * Uses direct crawl_career_page jobs (no search API key required) and also
   * triggers a search_discovery run to discover new companies from user prefs.
   */
  private async bootstrapDiscovery(): Promise<void> {
    const db = getDatabase();

    // Skip if a bootstrap is already pending/running
    const [queued] = await db
      .select()
      .from(queueJobs)
      .where(eq(queueJobs.status, "pending"))
      .limit(1);

    if (queued) return;

    const activeSources = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(eq(sources.isActive, true));

    if (activeSources.length === 0) {
      console.log("[Orchestrator] No sources yet — skipping bootstrap discovery");
      return;
    }

    // Enqueue a direct crawl for every active source that has never been crawled.
    let enqueued = 0;
    for (const { source, company } of activeSources) {
      if (source.lastCrawledAt) continue;
      const runId = uuidv4();
      await db.insert(crawlRuns).values({
        id: runId,
        type: "career",
        status: "pending",
      });
      await db.insert(queueJobs).values({
        id: uuidv4(),
        type: "crawl_career_page",
        payloadJson: JSON.stringify({
          runId,
          domain: company?.domain || extractDomain(source.url),
          url: source.url,
          companyName: company?.name,
          sourceId: source.id,
        }),
        status: "pending",
        priority: 1,
      });
      enqueued++;
    }

    // Also trigger a search_discovery run to find new companies from user prefs.
    const searchRunId = uuidv4();
    await db.insert(crawlRuns).values({
      id: searchRunId,
      type: "search",
      status: "pending",
    });
    await db.insert(queueJobs).values({
      id: uuidv4(),
      type: "search_discovery",
      payloadJson: JSON.stringify({ runId: searchRunId, bootstrapped: true }),
      status: "pending",
      priority: 2,
    });

    console.log(`[Orchestrator] Bootstrapped: ${enqueued} direct crawl(s) + 1 search discovery (run ${searchRunId})`);
  }

  stop(): void {
    this.running = false;
    if (this.interval) clearInterval(this.interval);
    if (this.scheduleInterval) clearInterval(this.scheduleInterval);
    // Gracefully close Playwright browser
    shutdownPlaywrightEngine().catch(() => {/* ignore */});
    // Flush endpoint discoveries to disk
    getEndpointStore().save().catch(() => {/* ignore */});
  }

  private async processNextJob(): Promise<void> {
    const db = getDatabase();

    // Claim next pending job
    const [job] = await db
      .select()
      .from(queueJobs)
      .where(
        and(
          eq(queueJobs.status, "pending"),
          lte(queueJobs.scheduledAt, new Date())
        )
      )
      .orderBy(queueJobs.priority, queueJobs.scheduledAt)
      .limit(1);

    if (!job) return;

    // Mark running
    await db
      .update(queueJobs)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(queueJobs.id, job.id));

    try {
      const payload = JSON.parse(job.payloadJson) as Record<string, unknown>;

      switch (job.type) {
        case "search_discovery":
          await this.runSearchDiscovery(payload);
          break;
        case "crawl_career_page":
          await this.runCareerCrawl(payload);
          break;
        case "verify_job":
          await this.runVerification(payload);
          break;
        default:
          console.warn(`[Orchestrator] Unknown job type: ${job.type}`);
      }

      await db
        .update(queueJobs)
        .set({ status: "completed", finishedAt: new Date() })
        .where(eq(queueJobs.id, job.id));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Job ${job.id} failed:`, errorMsg);

      if (job.retries < job.maxRetries) {
        // Retry with exponential backoff
        const delayMs = Math.pow(2, job.retries) * 5000;
        await db
          .update(queueJobs)
          .set({
            status: "pending",
            retries: job.retries + 1,
            error: errorMsg,
            scheduledAt: new Date(Date.now() + delayMs),
          })
          .where(eq(queueJobs.id, job.id));
      } else {
        await db
          .update(queueJobs)
          .set({ status: "failed", finishedAt: new Date(), error: errorMsg })
          .where(eq(queueJobs.id, job.id));
      }
    }
  }

  private async runSearchDiscovery(payload: Record<string, unknown>): Promise<void> {
    const runId = payload["runId"] as string;
    const db = getDatabase();

    await this.logEvent(runId, "search_start", "Starting search discovery", "info");

    // Load user preferences
    const settingRows = await db.select().from(settings);
    const settingMap: Record<string, unknown> = {};
    for (const row of settingRows) {
      try { settingMap[row.key] = JSON.parse(row.value); } catch {}
    }

    const roles = (settingMap["jobPreferences.roles"] as string[]) ?? [
      "Software Engineer Intern",
      "SWE Intern",
      "Backend Engineer Intern",
    ];

    const locations = (settingMap["jobPreferences.locations"] as string[]) ?? [
      "India",
      "Bengaluru",
      "Hyderabad",
    ];

    const generator = new QueryGenerator();
    const queries = generator.generate({ roles, locations, experience: [] });

    await this.logEvent(runId, "queries_generated", `Generated ${queries.length} search queries`, "info");

    let searchProvider;
    try {
      searchProvider = createSearchProvider();
    } catch (err) {
      await this.logEvent(runId, "search_provider_error", "Search provider not configured — skipping search discovery", "warn");
      // Queue career page crawls for existing sources instead
      await this.enqueueCareerCrawls(runId);
      return;
    }

    const discoveredDomains = new Set<string>();

    // 1. Scrape real jobs directly from LinkedIn for preferred roles & locations
    try {
      const scraper = new LinkedInScraper();
      for (const role of roles.slice(0, 3)) {
        for (const loc of locations.slice(0, 2)) {
          const items = await scraper.scrapeJobs({ keywords: role, location: loc, limit: 15 });
          const ingested = await scraper.ingestJobs(items);
          if (ingested.inserted > 0) {
            await this.logEvent(runId, "linkedin_jobs_ingested", `LinkedIn: Ingested ${ingested.inserted} live jobs for "${role}" in "${loc}"`, "info");
          }
        }
      }
    } catch (err) {
      console.error("[Orchestrator] LinkedIn scrape error:", err);
    }

    // 2. Discover real company career pages across Google searches
    for (const { query } of queries.slice(0, 15)) {
      try {
        await sleep(1000); // Rate limiting
        const results = await searchProvider.search(query);

        for (const result of results) {
          const ats = detectATS(result.url);
          const atsSlug = ats ? extractATSSlug(result.url, ats) : null;
          const rawDomain = atsSlug ? `${atsSlug}.com` : extractDomain(result.url);
          if (!rawDomain) continue;
          const domain = rawDomain.toLowerCase().replace(/^www\./, "");

          if (!domain || discoveredDomains.has(domain) || JUNK_DOMAINS.has(domain)) continue;
          discoveredDomains.add(domain);

          const companyName = atsSlug
            ? (atsSlug.charAt(0).toUpperCase() + atsSlug.slice(1))
            : extractCompanyName(result.title, domain);

          const [existingCompany] = await db
            .select()
            .from(companies)
            .where(eq(companies.domain, domain))
            .limit(1);

          if (!existingCompany?.isBlocked) {
            await db.insert(queueJobs).values({
              id: uuidv4(),
              type: "crawl_career_page",
              payloadJson: JSON.stringify({
                runId,
                domain,
                url: result.url,
                companyName,
                ats: ats ?? undefined,
                atsSlug: atsSlug ?? undefined,
              }),
              status: "pending",
              priority: 3,
            });
          }
        }

        await this.logEvent(runId, "search_complete", `Query "${query.slice(0, 50)}..." → ${results.length} results`, "info");
      } catch (err) {
        await this.logEvent(runId, "search_error", `Search failed for query: ${err instanceof Error ? err.message : String(err)}`, "warn");
      }
    }

    await this.logEvent(runId, "search_discovery_complete", `Discovered ${discoveredDomains.size} unique company domains`, "info");
  }

  private async runCareerCrawl(payload: Record<string, unknown>): Promise<void> {
    const runId = payload["runId"] as string;
    const domain = payload["domain"] as string;
    const sourceUrl = payload["url"] as string;
    const companyName = (payload["companyName"] as string) ?? domain;
    const db = getDatabase();

    await this.logEvent(runId, "career_crawl_start", `Crawling ${domain}`, "info", sourceUrl);

    try {
      // Ensure company record exists
      let [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.domain, domain))
        .limit(1);

      if (!company) {
        const id = uuidv4();
        await db.insert(companies).values({
          id,
          name: companyName,
          domain,
          website: `https://${domain}`,
        });
        [company] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
      }

      if (!company) return;
      if (company.isBlocked) return;

      let careerResult: { url: string; ats: string | null; confidence: number } | null = null;
      const detectedAts = (payload["ats"] as string) || detectATS(sourceUrl);

      if (detectedAts) {
        careerResult = {
          url: sourceUrl,
          ats: detectedAts,
          confidence: 1.0,
        };
      } else {
        // Fetch homepage with rate limiting
        await sleep(1000);
        try {
          const resp = await fetch(`https://${domain}`, {
            signal: AbortSignal.timeout(10000),
            headers: { "User-Agent": "Huntly/1.0 (career discovery bot)" },
          });

          if (resp.ok) {
            const html = await resp.text();
            const discoverer = new CareerPageDiscoverer();
            careerResult = await discoverer.discover(domain, html);
          }
        } catch {
          // If domain fails, fallback to sourceUrl
          careerResult = { url: sourceUrl, ats: null, confidence: 0.5 };
        }
      }

      if (!careerResult) {
        await this.logEvent(runId, "no_career_page", `No career page found for ${domain}`, "warn");
        return;
      }

      await this.logEvent(runId, "career_page_found", `Found career page: ${careerResult.url}`, "info", careerResult.url);

      // Update company
      await db.update(companies).set({
        careerPage: careerResult.url,
        ats: careerResult.ats ?? undefined,
        lastCrawledAt: new Date(),
      }).where(eq(companies.id, company.id));

      // Upsert source
      const [existingSource] = await db
        .select()
        .from(sources)
        .where(eq(sources.url, careerResult.url))
        .limit(1);

      let sourceId: string;
      if (!existingSource) {
        sourceId = uuidv4();
        await db.insert(sources).values({
          id: sourceId,
          companyId: company.id,
          url: careerResult.url,
          type: careerResult.ats ? "ats" : "company",
          ats: careerResult.ats ?? undefined,
          priority: careerResult.ats ? 0.95 : 1.0,
          isActive: true,
        });
      } else {
        sourceId = existingSource.id;
      }

      // Load active resume
      const [activeResume] = await db
        .select()
        .from(resumes)
        .where(eq(resumes.isActive, true))
        .limit(1);

      // Extract jobs using ATS adapter if available
      let extractedJobs: ExtractedJob[] = [];

      if (careerResult.ats) {
        await this.logEvent(runId, "ats_detected", `ATS detected: ${careerResult.ats}`, "info", careerResult.url);
        const adapter = getATSAdapter(careerResult.ats);

        if (adapter) {
          // Extract company slug
          const slug = extractATSSlug(careerResult.url, careerResult.ats);
          if (slug) {
            extractedJobs = await adapter.discoverJobs(slug);
            await this.logEvent(runId, "ats_jobs_fetched", `Fetched ${extractedJobs.length} jobs via ${careerResult.ats} API`, "info");
          }
        }
      }

      if (extractedJobs.length === 0) {
        // Playwright intelligence engine: 7-layer extraction strategy
        await this.logEvent(runId, "playwright_crawl_start", `Starting Playwright extraction for ${careerResult.url}`, "info", careerResult.url);
        try {
          const crawlResult = await this.playwrightCrawler.crawl(careerResult.url, {
            maxJobs: 500,
            followPagination: true,
            maxPages: 3,
            handleScroll: true,
            timeout: 30_000,
          });

          extractedJobs = crawlResult.jobs;

          await this.logEvent(
            runId,
            "playwright_crawl_complete",
            `Playwright: ${extractedJobs.length} jobs via layer="${crawlResult.extractionLayer}" class="${crawlResult.classifiedAs}" pages=${crawlResult.pagesVisited} endpoints=${crawlResult.endpointsDiscovered} duration=${crawlResult.duration}ms`,
            "info",
            careerResult.url
          );
        } catch (pwErr) {
          const pwMsg = pwErr instanceof Error ? pwErr.message : String(pwErr);
          await this.logEvent(runId, "playwright_crawl_error", `Playwright failed: ${pwMsg} — falling back to plain HTTP`, "warn", careerResult.url);

          // Final fallback: plain HTTP + HTML (no JS rendering)
          await sleep(800);
          try {
            const careerResp = await fetch(careerResult.url, {
              signal: AbortSignal.timeout(12000),
              headers: { "User-Agent": "Huntly/1.0" },
            });

            if (careerResp.ok) {
              const careerHtml = await careerResp.text();
              extractedJobs = extractFromJsonLD(careerHtml, careerResult.url);
              if (extractedJobs.length === 0) {
                extractedJobs = extractFromHTML(careerHtml, careerResult.url);
              }
            }
          } catch {
            // Extraction fully failed; jobs remain empty
          }
        }
      }

      await this.logEvent(runId, "jobs_extracted", `Extracted ${extractedJobs.length} jobs from ${domain}`, "info");

      // Process each job
      let created = 0, updated = 0, dupes = 0;
      for (const extracted of extractedJobs) {
        const result = await processExtractedJob(
          extracted,
          company.id,
          sourceId,
          runId,
          activeResume?.id
        );

        if (result.action === "created") created++;
        else if (result.action === "updated") updated++;
        else dupes++;
      }

      // Update source stats
      await db.update(sources).set({
        lastCrawledAt: new Date(),
        lastJobCount: extractedJobs.length,
      }).where(eq(sources.id, sourceId));

      await this.logEvent(
        runId,
        "crawl_complete",
        `${domain}: ${created} new, ${updated} updated, ${dupes} dupes`,
        "info"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logEvent(runId, "crawl_error", `Error crawling ${domain}: ${msg}`, "error", sourceUrl);
    }
  }

  private async runVerification(payload: Record<string, unknown>): Promise<void> {
    // Check if stale jobs still exist at their sourceUrl
    // Implementation: HTTP HEAD request, if 404 → mark closed
  }

  private async enqueueCareerCrawls(runId: string): Promise<void> {
    const db = getDatabase();
    const activeSources = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(eq(sources.isActive, true))
      .limit(20);

    for (const { source, company } of activeSources) {
      await db.insert(queueJobs).values({
        id: uuidv4(),
        type: "crawl_career_page",
        payloadJson: JSON.stringify({
          runId,
          domain: company?.domain,
          url: source.url,
          companyName: company?.name,
          sourceId: source.id,
        }),
        status: "pending",
        priority: 5,
      });
    }
  }

  private async schedulePeriodicCrawls(): Promise<void> {
    const db = getDatabase();
    const now = new Date();

    // Find sources due for crawl
    const dueSources = await db
      .select({ source: sources, company: companies })
      .from(sources)
      .leftJoin(companies, eq(sources.companyId, companies.id))
      .where(eq(sources.isActive, true));

    for (const { source, company } of dueSources) {
      // Never-crawled sources are due immediately; otherwise respect the interval.
      const isDue =
        !source.lastCrawledAt ||
        now.getTime() >= new Date(source.lastCrawledAt).getTime() + source.crawlIntervalMinutes * 60 * 1000;

      if (!isDue) continue;

      // Check if already queued
      const [queued] = await db
        .select()
        .from(queueJobs)
        .where(
          and(
            eq(queueJobs.type, "crawl_career_page"),
            eq(queueJobs.status, "pending")
          )
        )
        .limit(1);

      if (!queued) {
        const runId = uuidv4();
        await db.insert(crawlRuns).values({
          id: runId,
          type: "career",
          status: "pending",
          statsJson: "{}",
        });

        await db.insert(queueJobs).values({
          id: uuidv4(),
          type: "crawl_career_page",
          payloadJson: JSON.stringify({
            runId,
            domain: company?.domain || extractDomain(source.url),
            url: source.url,
            companyName: company?.name || extractDomain(source.url),
            sourceId: source.id,
          }),
          status: "pending",
          priority: 5,
        });
      }
    }
  }

  private async logEvent(
    runId: string,
    type: string,
    message: string,
    severity: "info" | "warn" | "error",
    url?: string
  ): Promise<void> {
    const db = getDatabase();
    await db.insert(crawlEvents).values({
      id: uuidv4(),
      crawlRunId: runId,
      type,
      message,
      severity,
      url,
    });
    console.log(`[${severity.toUpperCase()}] ${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(searchTitle: string, domain: string): string {
  // Try to extract company from search title
  const domainParts = domain.split(".");
  return domainParts[0]
    ? domainParts[0].charAt(0).toUpperCase() + domainParts[0].slice(1)
    : domain;
}
