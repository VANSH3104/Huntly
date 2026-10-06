/**
 * DynamicExtractor — Handles dynamic content, infinite scroll, pagination,
 * iframes/ATS frames, popup/cookie dismissal, and self-healing DOM selectors.
 *
 * This module is the "last resort" extraction layer when structured API data
 * is not available from the network or embedded state.
 */

import type { Page, Frame } from "playwright";
import type { ExtractedJob } from "./extractor.js";
import { normalizeLocation, normalizeUrl } from "../utils/normalize.js";

// ─── Types ───────────────────────────────────────────────────────

export interface DynamicExtractionResult {
  jobs: ExtractedJob[];
  strategy: string;
  paginationDetected: boolean;
  totalPagesEstimate: number;
  extractorLog: ExtractionLog[];
}

export interface ExtractionLog {
  source: string;
  extractor: string;
  strategy: string;
  failure?: string;
  fallbackUsed?: string;
  success: boolean;
}

// ─── Popup / Cookie Barrier Dismissal ────────────────────────────

const CONSENT_SELECTORS = [
  // Text-match based (most reliable)
  "button:has-text('Accept all')",
  "button:has-text('Accept All')",
  "button:has-text('Accept Cookies')",
  "button:has-text('Accept cookies')",
  "button:has-text('I Accept')",
  "button:has-text('I agree')",
  "button:has-text('Agree')",
  "button:has-text('Got it')",
  "button:has-text('OK')",
  "button:has-text('Close')",
  // Common class patterns
  "[data-testid='cookie-accept']",
  "[id*='accept'][class*='cookie']",
  ".cookie-consent__accept",
  ".cc-btn-accept",
  "#onetrust-accept-btn-handler",
  "[aria-label='Accept cookies']",
  "[aria-label='Close dialog']",
  "[aria-label='dismiss cookie message']",
];

export async function dismissPopups(page: Page): Promise<void> {
  for (const selector of CONSENT_SELECTORS) {
    try {
      const el = page.locator(selector).first();
      const visible = await el.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        await el.click({ timeout: 3000 });
        console.debug(`[DynamicExtractor] Dismissed popup with: ${selector}`);
        await page.waitForTimeout(500);
        return; // One dismiss is enough
      }
    } catch {
      // Try next selector
    }
  }
}

// ─── Infinite Scroll Handler ──────────────────────────────────────

export interface ScrollOptions {
  maxItems?: number;
  maxScrollAttempts?: number;
  /** Milliseconds to wait for new content after scroll */
  waitAfterScroll?: number;
  /** Selector to count items for change detection */
  itemSelector?: string;
}

export async function handleInfiniteScroll(
  page: Page,
  options: ScrollOptions = {}
): Promise<void> {
  const {
    maxItems = 200,
    maxScrollAttempts = 30,
    waitAfterScroll = 2000,
    itemSelector = "[data-job-id], .job-card, .job-item, .job-listing, li[class*='job']",
  } = options;

  let previousHeight = 0;
  let previousCount = 0;
  let stableRounds = 0;

  for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
    const currentCount = await page.locator(itemSelector).count().catch(() => 0);
    const currentHeight = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);

    // Check max items
    if (currentCount >= maxItems) {
      console.debug(`[InfiniteScroll] Reached max items: ${currentCount}`);
      break;
    }

    // Check for end-of-content
    const noNewContent = currentHeight === previousHeight && currentCount === previousCount;
    if (noNewContent) {
      stableRounds++;
      if (stableRounds >= 2) {
        console.debug(`[InfiniteScroll] No new content after ${attempt} scrolls`);
        break;
      }
    } else {
      stableRounds = 0;
    }

    previousHeight = currentHeight;
    previousCount = currentCount;

    // Check for end-of-results indicator
    const hasEndSignal = await page.evaluate(() => {
      const body = document.body.textContent ?? "";
      return /no more (?:jobs|results)|end of results|showing all/i.test(body);
    }).catch(() => false);

    if (hasEndSignal) {
      console.debug("[InfiniteScroll] End-of-results indicator detected");
      break;
    }

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    // Wait for potential new content (event-driven, with timeout fallback)
    try {
      await page.waitForFunction(
        (prevHeight: number) => document.body.scrollHeight > prevHeight,
        currentHeight,
        { timeout: waitAfterScroll }
      );
    } catch {
      // No new content appeared — let stability check handle it
    }
  }
}

// ─── Pagination Discovery ─────────────────────────────────────────

export interface PaginationInfo {
  type: "query_page" | "query_offset" | "cursor" | "load_more" | "infinite_scroll" | "none";
  nextUrl?: string;
  currentPage?: number;
  totalPages?: number;
  loadMoreSelector?: string;
}

export async function detectPagination(page: Page, pageUrl: string): Promise<PaginationInfo> {
  // 1. Look for explicit next-page links or buttons
  const nextLink = await page.evaluate(() => {
    const selectors = [
      "a[rel='next']",
      "a:has-text('Next')",
      "a:has-text('Next Page')",
      "button:has-text('Next')",
      "[aria-label='Next page']",
      ".pagination__next",
      ".next-page",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const href = el.getAttribute("href");
        return { type: "link", href, text: el.textContent?.trim() };
      }
    }
    return null;
  }).catch(() => null);

  if (nextLink?.href) {
    const nextUrl = new URL(nextLink.href, pageUrl).toString();
    const url = new URL(nextUrl);

    if (url.searchParams.has("page")) {
      return { type: "query_page", nextUrl, currentPage: parseInt(url.searchParams.get("page") ?? "1", 10) };
    }
    if (url.searchParams.has("offset")) {
      return { type: "query_offset", nextUrl };
    }
    if (url.searchParams.has("cursor") || url.searchParams.has("after")) {
      return { type: "cursor", nextUrl };
    }
    return { type: "query_page", nextUrl };
  }

  // 2. Look for Load More button
  const loadMoreSelector = await page.evaluate(() => {
    const candidates = [
      "button:has-text('Load More')",
      "button:has-text('Show More')",
      "button:has-text('View More')",
      "[class*='load-more']",
      "[class*='loadMore']",
      "[data-testid*='load-more']",
    ];
    for (const sel of candidates) {
      if (document.querySelector(sel)) return sel;
    }
    return null;
  }).catch(() => null);

  if (loadMoreSelector) {
    return { type: "load_more", loadMoreSelector };
  }

  // 3. Detect infinite scroll via body overflow/height ratio
  const mightBeInfiniteScroll = await page.evaluate(() => {
    const body = document.body;
    return body.scrollHeight > window.innerHeight * 2;
  }).catch(() => false);

  if (mightBeInfiniteScroll) {
    return { type: "infinite_scroll" };
  }

  return { type: "none" };
}

// ─── Frame Handling ───────────────────────────────────────────────

export interface FrameJobResult {
  frameUrl: string;
  ats: string | null;
  jobs: ExtractedJob[];
}

export async function extractFromFrames(page: Page): Promise<FrameJobResult[]> {
  const results: FrameJobResult[] = [];

  const frames = page.frames();
  for (const frame of frames) {
    const frameUrl = frame.url();

    // Skip blank/main frames
    if (!frameUrl || frameUrl === "about:blank" || frameUrl === page.url()) continue;

    // Check if it's an ATS frame
    const ats = detectATSFromUrl(frameUrl);
    if (!ats) continue;

    console.debug(`[FrameHandler] Found ATS frame: ${ats} at ${frameUrl}`);

    const jobs = await extractJobsFromFrame(frame, frameUrl, ats);
    if (jobs.length > 0) {
      results.push({ frameUrl, ats, jobs });
    }
  }

  return results;
}

function detectATSFromUrl(url: string): string | null {
  const ATS_URL_MAP: Array<[RegExp, string]> = [
    [/greenhouse\.io/i, "greenhouse"],
    [/lever\.co/i, "lever"],
    [/ashbyhq\.com/i, "ashby"],
    [/workday\.com/i, "workday"],
    [/smartrecruiters\.com/i, "smartrecruiters"],
    [/workable\.com/i, "workable"],
    [/bamboohr\.com/i, "bamboohr"],
    [/icims\.com/i, "icims"],
    [/jobvite\.com/i, "jobvite"],
    [/recruitee\.com/i, "recruitee"],
    [/teamtailor\.com/i, "teamtailor"],
    [/personio\.de/i, "personio"],
    [/breezy\.hr/i, "breezy"],
  ];
  for (const [pattern, name] of ATS_URL_MAP) {
    if (pattern.test(url)) return name;
  }
  return null;
}

async function extractJobsFromFrame(
  frame: Frame,
  frameUrl: string,
  _ats: string
): Promise<ExtractedJob[]> {
  try {
    await frame.waitForLoadState("domcontentloaded", { timeout: 10_000 });

    // Try getting job cards from the ATS frame
    const jobs = await frame.evaluate((url: string) => {
      const cards = document.querySelectorAll(
        "[data-job-id], .job-post, .opening-row, .position, .job-card, li[class*='job']"
      );
      const extracted: Array<{ title: string; location: string; url: string }> = [];
      cards.forEach(card => {
        const title =
          card.querySelector("h1,h2,h3,.title,[class*='title']")?.textContent?.trim() ??
          card.querySelector("a")?.textContent?.trim() ?? "";
        const location =
          card.querySelector(".location,[class*='location']")?.textContent?.trim() ?? "";
        const link = card.querySelector("a")?.getAttribute("href") ?? "";
        const absUrl = link.startsWith("http") ? link : new URL(link, url).toString();
        if (title && title.length > 2) extracted.push({ title, location, url: absUrl });
      });
      return extracted;
    }, frameUrl);

    return jobs.map(j => ({
      title: j.title,
      description: "",
      location: normalizeLocation(j.location),
      sourceUrl: normalizeUrl(frameUrl),
      applyUrl: normalizeUrl(j.url || frameUrl),
    }));
  } catch {
    return [];
  }
}

// ─── Self-Healing Selectors ───────────────────────────────────────

type SelectorStrategy = {
  name: string;
  selector: string;
};

const JOB_TITLE_STRATEGIES: SelectorStrategy[] = [
  { name: "data-job-title",   selector: "[data-job-title]" },
  { name: "h1-role",          selector: "h1[class*='title'], h1[class*='Title']" },
  { name: "h2-role",          selector: "h2[class*='title'], h2[class*='Title']" },
  { name: "aria-heading",     selector: "[role='heading'][aria-level='1']" },
  { name: "h1",               selector: "h1" },
  { name: "h2",               selector: "h2" },
  { name: "semantic-title",   selector: ".title, .job-title, .position-title" },
  { name: "og-title",         selector: "meta[property='og:title']" },
];

export interface SelfHealResult {
  value: string;
  strategy: string;
  log: ExtractionLog;
}

/**
 * Attempts to extract a job title from a page using a cascade of strategies.
 * Logs which strategy succeeded.
 */
export async function extractJobTitleSelfHealing(
  page: Page,
  preferredSelector?: string
): Promise<SelfHealResult | null> {
  const strategies = preferredSelector
    ? [{ name: "preferred", selector: preferredSelector }, ...JOB_TITLE_STRATEGIES]
    : JOB_TITLE_STRATEGIES;

  for (const strategy of strategies) {
    try {
      const text = await page.locator(strategy.selector).first().textContent({ timeout: 2000 });
      if (text && text.trim().length > 2) {
        return {
          value: text.trim(),
          strategy: strategy.name,
          log: {
            source: page.url(),
            extractor: "job_title",
            strategy: strategy.name,
            fallbackUsed: strategy.name !== strategies[0]?.name ? strategy.name : undefined,
            success: true,
          },
        };
      }
    } catch {
      // Try next strategy
    }
  }

  // Last resort: meta og:title
  try {
    const ogTitle = await page.getAttribute("meta[property='og:title']", "content");
    if (ogTitle) {
      return {
        value: ogTitle.trim(),
        strategy: "og-title-fallback",
        log: {
          source: page.url(),
          extractor: "job_title",
          strategy: "og-title-fallback",
          fallbackUsed: "og-title-fallback",
          success: true,
        },
      };
    }
  } catch { /* ignore */ }

  return null;
}

// ─── Link Graph Crawler ───────────────────────────────────────────

export interface ScoredLink {
  url: string;
  score: number;
  text: string;
  reason: string;
}

const LINK_SCORING: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /careers?$/i,            score: 1.0,  reason: "career-page" },
  { pattern: /jobs?$/i,               score: 1.0,  reason: "jobs-page" },
  { pattern: /open.?position/i,       score: 1.0,  reason: "open-positions" },
  { pattern: /hiring/i,               score: 0.9,  reason: "hiring-page" },
  { pattern: /join.?us/i,             score: 0.85, reason: "join-us" },
  { pattern: /work.?with/i,           score: 0.8,  reason: "work-with-us" },
  { pattern: /opportunities/i,        score: 0.8,  reason: "opportunities" },
  { pattern: /talent/i,               score: 0.7,  reason: "talent-page" },
  { pattern: /engineering/i,          score: 0.5,  reason: "engineering-dept" },
  { pattern: /about/i,                score: 0.2,  reason: "about-page" },
  { pattern: /blog/i,                 score: 0.1,  reason: "blog" },
  { pattern: /privacy|terms|legal/i,  score: -1.0, reason: "legal-page" },
];

const LINK_TEXT_SCORING: Array<{ pattern: RegExp; score: number; reason: string }> = [
  { pattern: /careers?/i,             score: 0.8,  reason: "text:careers" },
  { pattern: /jobs?/i,                score: 0.8,  reason: "text:jobs" },
  { pattern: /join/i,                 score: 0.6,  reason: "text:join" },
  { pattern: /hiring/i,               score: 0.7,  reason: "text:hiring" },
  { pattern: /opportunities/i,        score: 0.6,  reason: "text:opportunities" },
  { pattern: /open\s+roles/i,         score: 0.8,  reason: "text:open-roles" },
  { pattern: /work\s+(?:at|with)/i,   score: 0.5,  reason: "text:work-at" },
];

/**
 * Discovers and scores all links on a page for career/job relevance.
 */
export async function discoverScoredLinks(
  page: Page,
  baseDomain: string
): Promise<ScoredLink[]> {
  const rawLinks = await page.evaluate(() => {
    const links: Array<{ href: string; text: string }> = [];
    document.querySelectorAll("a[href]").forEach(a => {
      links.push({ href: a.getAttribute("href") ?? "", text: a.textContent?.trim() ?? "" });
    });
    return links;
  }).catch(() => []);

  const pageOrigin = `https://${baseDomain}`;
  const scored: ScoredLink[] = [];

  for (const { href, text } of rawLinks) {
    let absoluteUrl: string;
    try {
      absoluteUrl = href.startsWith("http") ? href : new URL(href, pageOrigin).toString();
    } catch {
      continue;
    }

    // Only follow same-domain links
    if (!absoluteUrl.includes(baseDomain)) continue;

    let score = 0;
    let reason = "";

    for (const rule of LINK_SCORING) {
      if (rule.pattern.test(absoluteUrl)) {
        score += rule.score;
        reason = rule.reason;
      }
    }

    for (const rule of LINK_TEXT_SCORING) {
      if (rule.pattern.test(text)) {
        score += rule.score;
        if (!reason) reason = rule.reason;
      }
    }

    if (score > 0) {
      scored.push({ url: absoluteUrl, score, text, reason });
    }
  }

  // Deduplicate + sort by score
  const seen = new Set<string>();
  return scored
    .filter(l => { if (seen.has(l.url)) return false; seen.add(l.url); return true; })
    .sort((a, b) => b.score - a.score);
}
