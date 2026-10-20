/**
 * PlaywrightCrawler — The main Playwright-based intelligent extraction engine.
 *
 * Extraction priority order (highest to lowest quality):
 *   1. Reused known API endpoint (fastest)
 *   2. Network-intercepted JSON/API response (observed during page load)
 *   3. Embedded application state (__NEXT_DATA__, __INITIAL_STATE__, etc.)
 *   4. JSON-LD structured data (schema.org/JobPosting)
 *   5. iframe/ATS frame extraction
 *   6. DOM extraction with self-healing selectors
 *   7. Infinite scroll / pagination + DOM
 *
 * Only falls through to a lower layer when all higher layers yield 0 jobs.
 */

import type { Page } from "playwright";
import { getPlaywrightEngine } from "./playwright-engine.js";
import { NetworkInterceptor, extractJobsFromPayload } from "./network-interceptor.js";
import { EmbeddedDataExtractor } from "./embedded-data.js";
import { PageClassifier } from "./page-classifier.js";
import {
  dismissPopups,
  handleInfiniteScroll,
  detectPagination,
  extractFromFrames,
  discoverScoredLinks,
} from "./dynamic-extractor.js";
import { getEndpointStore } from "./endpoint-store.js";
import { getSourceHealthTracker } from "./source-health.js";
import { extractFromJsonLD, extractFromHTML, type ExtractedJob } from "./extractor.js";
import { normalizeLocation, normalizeUrl, extractDomain } from "../utils/normalize.js";

// ─── Types ───────────────────────────────────────────────────────

export interface PlaywrightCrawlOptions {
  /** Maximum number of jobs to return from this URL. */
  maxJobs?: number;
  /** Whether to follow pagination / load-more. */
  followPagination?: boolean;
  /** Max pagination depth. */
  maxPages?: number;
  /** Whether to handle infinite scroll. */
  handleScroll?: boolean;
  /** Timeout per page in ms. */
  timeout?: number;
  /** Whether to save debug snapshots on failure. */
  debugSnapshots?: boolean;
}

export interface PlaywrightCrawlResult {
  jobs: ExtractedJob[];
  extractionLayer: string;
  pagesVisited: number;
  endpointsDiscovered: number;
  classifiedAs: string;
  duration: number;
}

// ─── Raw job normalizer ───────────────────────────────────────────

function normalizeNetworkJob(raw: Record<string, unknown>, sourceUrl: string): ExtractedJob | null {
  const title =
    (raw["title"] as string) ??
    (raw["name"] as string) ??
    (raw["jobTitle"] as string) ??
    (raw["text"] as string);

  if (!title || title.length < 2) return null;

  // Location
  const locRaw = raw["location"] ?? raw["jobLocation"] ?? raw["categories"];
  let locationStr = "";
  if (typeof locRaw === "string") locationStr = locRaw;
  else if (locRaw && typeof locRaw === "object") {
    const loc = locRaw as Record<string, unknown>;
    locationStr =
      (loc["name"] as string) ??
      (loc["location"] as string) ??
      (loc["addressLocality"] as string) ??
      "";
  }

  // Apply URL
  const applyUrl = normalizeUrl(
    (raw["applyUrl"] as string) ??
    (raw["absoluteUrl"] as string) ??
    (raw["hostedUrl"] as string) ??
    (raw["jobUrl"] as string) ??
    (raw["url"] as string) ??
    sourceUrl
  );

  // Description
  const description =
    (raw["descriptionPlain"] as string) ??
    (raw["description"] as string) ??
    (raw["content"] as string) ??
    "";

  // Employment type
  const employmentType =
    (raw["employmentType"] as string) ??
    (raw["workplaceType"] as string) ??
    undefined;

  // Posted at
  const postedAtRaw = raw["publishedAt"] ?? raw["postedAt"] ?? raw["updatedAt"] ?? raw["createdAt"];
  const postedAt =
    typeof postedAtRaw === "string"
      ? new Date(postedAtRaw)
      : typeof postedAtRaw === "number"
      ? new Date(postedAtRaw)
      : undefined;

  // External ID
  const externalJobId =
    raw["id"] !== undefined && raw["id"] !== null
      ? String(raw["id"])
      : undefined;

  return {
    title,
    description: typeof description === "string" ? description.slice(0, 5000) : "",
    location: normalizeLocation(locationStr),
    sourceUrl: normalizeUrl(sourceUrl),
    applyUrl,
    externalJobId,
    employmentType,
    postedAt,
  };
}

// ─── PlaywrightCrawler ────────────────────────────────────────────

export class PlaywrightCrawler {
  private classifier = new PageClassifier();
  private embeddedExtractor = new EmbeddedDataExtractor();
  private endpointStore = getEndpointStore();
  private healthTracker = getSourceHealthTracker();

  /**
   * Main entry point: intelligently crawl a URL and extract jobs.
   */
  async crawl(targetUrl: string, options: PlaywrightCrawlOptions = {}): Promise<PlaywrightCrawlResult> {
    const {
      maxJobs = 500,
      followPagination = true,
      maxPages = 5,
      handleScroll = true,
      timeout = 30_000,
      debugSnapshots = false,
    } = options;

    const domainOrNull = extractDomain(targetUrl);
    const domain = domainOrNull ?? new URL(targetUrl).hostname;
    const startTime = Date.now();

    // ── Layer 0: Try reusing known API endpoint ─────────────────
    const knownEndpoints = this.endpointStore.getJobEndpointsForDomain(domain);
    if (knownEndpoints.length > 0) {
      const reused = await this.tryReuseEndpoint(knownEndpoints[0]!, targetUrl);
      if (reused.length > 0) {
        return {
          jobs: reused.slice(0, maxJobs),
          extractionLayer: "reused_api",
          pagesVisited: 0,
          endpointsDiscovered: 0,
          classifiedAs: "JOB_LIST",
          duration: Date.now() - startTime,
        };
      }
    }

    // ── Launch browser page ─────────────────────────────────────
    const engine = getPlaywrightEngine({ debugSnapshots, timeout });
    if (!engine.isHealthy) {
      throw new Error("PlaywrightEngine is not healthy — cannot crawl");
    }

    const session = await engine.acquirePage(domain);
    const { page } = session;

    const interceptor = new NetworkInterceptor();
    interceptor.attach(page);

    let classifiedAs = "UNKNOWN";
    let extractionLayer = "none";
    let pagesVisited = 0;
    let allJobs: ExtractedJob[] = [];

    try {
      // Navigate
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout });
      interceptor.setPageUrl(targetUrl);
      pagesVisited++;

      // Wait for network to settle
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {/* ok */});

      // Dismiss popups that block content
      await dismissPopups(page);

      // Classify the page
      const classification = await this.classifier.classify(page);
      classifiedAs = classification.type;
      console.log(`[PlaywrightCrawler] ${targetUrl} → ${classifiedAs} (confidence: ${classification.confidence.toFixed(2)})`);

      // Skip useless pages immediately
      if (classifiedAs === "LOGIN" || classifiedAs === "ERROR") {
        return {
          jobs: [],
          extractionLayer: "skipped",
          pagesVisited,
          endpointsDiscovered: 0,
          classifiedAs,
          duration: Date.now() - startTime,
        };
      }

      // ── Layer 1: Network-intercepted API responses ─────────────
      const networkJobs = this.extractFromNetwork(interceptor, targetUrl);
      if (networkJobs.length > 0) {
        allJobs = networkJobs;
        extractionLayer = "network_api";
        console.log(`[PlaywrightCrawler] Network layer: ${networkJobs.length} jobs`);

        // Record discovered endpoints
        for (const ep of interceptor.getJobListingEndpoints()) {
          this.endpointStore.record(ep, ep.jobCount ?? 0);
        }
      }

      // ── Layer 2: Embedded application state ────────────────────
      if (allJobs.length === 0) {
        const embedded = await this.embeddedExtractor.getBest(page);
        if (embedded && embedded.jobCount > 0) {
          const rawJobs = this.embeddedExtractor.findJobArraysRecursive(embedded.data);
          const flatJobs = rawJobs.flat();
          const normalized = flatJobs
            .map(j => normalizeNetworkJob(j as Record<string, unknown>, targetUrl))
            .filter((j): j is ExtractedJob => j !== null);

          if (normalized.length > 0) {
            allJobs = normalized;
            extractionLayer = `embedded:${embedded.source}`;
            console.log(`[PlaywrightCrawler] Embedded layer (${embedded.source}): ${normalized.length} jobs`);
          }
        }
      }

      // ── Layer 3: JSON-LD ───────────────────────────────────────
      if (allJobs.length === 0) {
        const html = await page.content();
        const ldJobs = extractFromJsonLD(html, targetUrl);
        if (ldJobs.length > 0) {
          allJobs = ldJobs;
          extractionLayer = "json_ld";
          console.log(`[PlaywrightCrawler] JSON-LD layer: ${ldJobs.length} jobs`);
        }
      }

      // ── Layer 4: ATS iframe frames ─────────────────────────────
      if (allJobs.length === 0) {
        const frameResults = await extractFromFrames(page);
        if (frameResults.length > 0) {
          const frameJobs = frameResults.flatMap(r => r.jobs);
          if (frameJobs.length > 0) {
            allJobs = frameJobs;
            extractionLayer = `frame:${frameResults[0]?.ats}`;
            console.log(`[PlaywrightCrawler] Frame layer: ${frameJobs.length} jobs`);
          }
        }
      }

      // ── Layer 5: Infinite scroll then DOM ─────────────────────
      if (allJobs.length === 0) {
        if (handleScroll && (classifiedAs === "JOB_LIST" || classifiedAs === "CAREER_PAGE")) {
          await handleInfiniteScroll(page, { maxItems: maxJobs });
        }

        const html = await page.content();
        const domJobs = extractFromHTML(html, targetUrl);
        if (domJobs.length > 0) {
          allJobs = domJobs;
          extractionLayer = "dom";
          console.log(`[PlaywrightCrawler] DOM layer: ${domJobs.length} jobs`);
        }
      }

      // ── Pagination follow ──────────────────────────────────────
      if (followPagination && allJobs.length > 0 && allJobs.length < maxJobs && maxPages > 1) {
        const pagination = await detectPagination(page, targetUrl);

        if (pagination.type === "load_more" && pagination.loadMoreSelector) {
          await this.handleLoadMore(page, pagination.loadMoreSelector, maxJobs - allJobs.length);
          const html = await page.content();
          const moreJobs = extractFromHTML(html, targetUrl);
          allJobs = deduplicateJobs([...allJobs, ...moreJobs]);
        } else if (pagination.nextUrl && (pagination.type === "query_page" || pagination.type === "query_offset")) {
          let nextUrl = pagination.nextUrl;
          let currentPage = pagination.currentPage ?? 1;

          for (let p = 1; p < maxPages && allJobs.length < maxJobs; p++) {
            await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout });
            pagesVisited++;
            await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {/* ok */});

            const html = await page.content();
            const pageJobs = extractFromHTML(html, nextUrl);
            if (pageJobs.length === 0) break;

            allJobs = deduplicateJobs([...allJobs, ...pageJobs]);

            currentPage++;
            const nextPagination = await detectPagination(page, nextUrl);
            if (!nextPagination.nextUrl || nextPagination.type === "none") break;
            nextUrl = nextPagination.nextUrl;
          }
        }
      }

      // ── Final link discovery (if no jobs found) ─────────────────
      if (allJobs.length === 0 && (classifiedAs === "COMPANY_PAGE" || classifiedAs === "UNKNOWN")) {
        const links = await discoverScoredLinks(page, domain ?? "");
        const careerLinks = links.slice(0, 3);
        console.log(`[PlaywrightCrawler] Link discovery: found ${careerLinks.length} career link candidates`);
      }

      // Record health metrics
      const duration = Date.now() - startTime;
      if (allJobs.length > 0) {
        this.healthTracker.recordSuccess(targetUrl, duration, allJobs.length);
      } else {
        this.healthTracker.recordFailure(targetUrl, "No jobs extracted", true);
      }

      if (allJobs.length === 0) {
        await engine.captureDebugSnapshot(page, `no-jobs-${domain}`, undefined);
      }

      return {
        jobs: allJobs.slice(0, maxJobs),
        extractionLayer,
        pagesVisited,
        endpointsDiscovered: interceptor.getEndpoints().length,
        classifiedAs,
        duration,
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.healthTracker.recordFailure(targetUrl, error.message);
      await engine.captureDebugSnapshot(page, `error-${domain}`, error);
      throw error;
    } finally {
      await session.release();
    }
  }

  // ─── Private helpers ────────────────────────────────────────────

  private extractFromNetwork(interceptor: NetworkInterceptor, sourceUrl: string): ExtractedJob[] {
    const best = interceptor.getBestResponse();
    if (!best || best.jobCount === 0) return [];

    const rawJobs = extractJobsFromPayload(best.payload);
    return rawJobs
      .map(j => normalizeNetworkJob(j as Record<string, unknown>, sourceUrl))
      .filter((j): j is ExtractedJob => j !== null);
  }

  private async tryReuseEndpoint(
    endpoint: { apiUrl: string; method: string },
    sourceUrl: string
  ): Promise<ExtractedJob[]> {
    try {
      const resp = await fetch(endpoint.apiUrl, {
        method: endpoint.method,
        headers: {
          "Accept": "application/json",
          "User-Agent": "Huntly/1.0",
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!resp.ok) {
        this.endpointStore.recordFailure(endpoint.apiUrl, endpoint.method);
        return [];
      }

      const payload = await resp.json();
      const rawJobs = extractJobsFromPayload(payload);
      const jobs = rawJobs
        .map(j => normalizeNetworkJob(j as Record<string, unknown>, sourceUrl))
        .filter((j): j is ExtractedJob => j !== null);

      this.endpointStore.recordSuccess(endpoint.apiUrl, endpoint.method, jobs.length);
      console.log(`[PlaywrightCrawler] Reused API endpoint: ${endpoint.apiUrl} → ${jobs.length} jobs`);
      return jobs;
    } catch {
      this.endpointStore.recordFailure(endpoint.apiUrl, endpoint.method);
      return [];
    }
  }

  private async handleLoadMore(page: Page, selector: string, maxMore: number): Promise<void> {
    let loaded = 0;
    const maxClicks = Math.min(10, Math.ceil(maxMore / 10));

    for (let i = 0; i < maxClicks; i++) {
      try {
        const btn = page.locator(selector).first();
        const visible = await btn.isVisible({ timeout: 2000 });
        if (!visible) break;

        await btn.click();
        loaded++;

        // Wait for new content to load
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {/* ok */});
      } catch {
        break;
      }
    }

    if (loaded > 0) {
      console.debug(`[PlaywrightCrawler] Clicked 'Load More' ${loaded} times`);
    }
  }
}

// ─── Deduplication ───────────────────────────────────────────────

function deduplicateJobs(jobs: ExtractedJob[]): ExtractedJob[] {
  const seen = new Set<string>();
  return jobs.filter(j => {
    const key = j.externalJobId ?? j.applyUrl ?? j.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
