/**
 * EmbeddedDataExtractor — Extracts structured application data embedded in modern web pages.
 *
 * Modern React/Next.js/Nuxt/Vue sites often pre-load their data into the page as:
 *   - __NEXT_DATA__ (Next.js)
 *   - window.__INITIAL_STATE__ / window.__INITIAL_DATA__
 *   - Apollo cache (window.__APOLLO_STATE__)
 *   - Nuxt data (window.__NUXT__)
 *   - script[type="application/json"] hydration blobs
 *   - JSON-LD structured data
 *
 * This extractor uses Playwright's page.evaluate() to read these sources directly
 * from the live browser context, avoiding the need to parse raw HTML strings.
 */

import type { Page } from "playwright";

// ─── Types ───────────────────────────────────────────────────────

export interface EmbeddedDataResult {
  source: string;
  data: unknown;
  /** Estimated job count if detectable. */
  jobCount: number;
}

// ─── EmbeddedDataExtractor ───────────────────────────────────────

export class EmbeddedDataExtractor {
  /**
   * Extracts all available embedded data sources from the current page.
   * Returns results sorted by estimated job count (highest first).
   */
  async extractAll(page: Page): Promise<EmbeddedDataResult[]> {
    const results: EmbeddedDataResult[] = [];

    const extractors: Array<[string, () => Promise<unknown>]> = [
      ["__NEXT_DATA__",       () => this.extractNextData(page)],
      ["__INITIAL_STATE__",   () => this.extractWindowKey(page, "__INITIAL_STATE__")],
      ["__INITIAL_DATA__",    () => this.extractWindowKey(page, "__INITIAL_DATA__")],
      ["__REDUX_STATE__",     () => this.extractWindowKey(page, "__REDUX_STATE__")],
      ["__APOLLO_STATE__",    () => this.extractWindowKey(page, "__APOLLO_STATE__")],
      ["__NUXT__",            () => this.extractWindowKey(page, "__NUXT__")],
      ["__APP_STATE__",       () => this.extractWindowKey(page, "__APP_STATE__")],
      ["script_json",         () => this.extractScriptJsonTags(page)],
      ["json_ld",             () => this.extractJsonLd(page)],
    ];

    for (const [source, extractor] of extractors) {
      try {
        const data = await extractor();
        if (data !== null && data !== undefined) {
          const jobCount = estimateJobCount(data);
          results.push({ source, data, jobCount });
        }
      } catch {
        // Silently skip unavailable sources
      }
    }

    // Sort highest job count first
    return results.sort((a, b) => b.jobCount - a.jobCount);
  }

  /**
   * Returns the best embedded data source, preferring sources with job data.
   */
  async getBest(page: Page): Promise<EmbeddedDataResult | null> {
    const all = await this.extractAll(page);
    // Prefer sources that have jobs
    const withJobs = all.filter(r => r.jobCount > 0);
    return withJobs[0] ?? all[0] ?? null;
  }

  // ─── Source Extractors ─────────────────────────────────────

  private async extractNextData(page: Page): Promise<unknown> {
    return page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el?.textContent) return null;
      try { return JSON.parse(el.textContent); } catch { return null; }
    });
  }

  private async extractWindowKey(page: Page, key: string): Promise<unknown> {
    return page.evaluate((k: string) => {
      return (window as unknown as Record<string, unknown>)[k] ?? null;
    }, key);
  }

  private async extractScriptJsonTags(page: Page): Promise<unknown> {
    return page.evaluate(() => {
      const candidates: unknown[] = [];
      const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent ?? "");
          if (parsed && typeof parsed === "object") candidates.push(parsed);
        } catch { /* skip invalid */ }
      }
      return candidates.length > 0 ? candidates : null;
    });
  }

  private async extractJsonLd(page: Page): Promise<unknown> {
    return page.evaluate(() => {
      const results: unknown[] = [];
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent ?? "");
          results.push(parsed);
        } catch { /* skip */ }
      }
      return results.length > 0 ? results : null;
    });
  }

  // ─── Deep Job Extraction ──────────────────────────────────

  /**
   * Drills into Next.js page props to find job arrays.
   * Handles common patterns:
   *   props.pageProps.jobs
   *   props.pageProps.data.jobs
   *   props.pageProps.initialData.jobs
   */
  extractJobsFromNextData(nextData: unknown): unknown[] {
    if (!nextData || typeof nextData !== "object") return [];
    const nd = nextData as Record<string, unknown>;

    const pageProps = nd["props"] && typeof nd["props"] === "object"
      ? (nd["props"] as Record<string, unknown>)["pageProps"]
      : null;

    if (!pageProps || typeof pageProps !== "object") return [];

    const pp = pageProps as Record<string, unknown>;

    // Direct arrays
    for (const key of JOB_ARRAY_KEYS) {
      const val = pp[key];
      if (Array.isArray(val) && val.length > 0) return val;
    }

    // One level deeper
    for (const outerKey of ["data", "initialData", "serverData", "dehydratedState"]) {
      const outer = pp[outerKey];
      if (!outer || typeof outer !== "object") continue;
      const outerObj = outer as Record<string, unknown>;
      for (const key of JOB_ARRAY_KEYS) {
        const val = outerObj[key];
        if (Array.isArray(val) && val.length > 0) return val;
      }
    }

    return [];
  }

  /**
   * Recursively searches an object for arrays that look like job listings.
   * Depth-limited to avoid performance issues.
   */
  findJobArraysRecursive(obj: unknown, depth = 0, maxDepth = 4): unknown[][] {
    if (depth > maxDepth || !obj || typeof obj !== "object") return [];

    const results: unknown[][] = [];

    if (Array.isArray(obj)) {
      if (obj.length > 0 && looksLikeJob(obj[0])) {
        results.push(obj);
      }
      for (const item of obj.slice(0, 5)) {
        results.push(...this.findJobArraysRecursive(item, depth + 1, maxDepth));
      }
      return results;
    }

    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      // Prioritize job-like keys
      if (JOB_ARRAY_KEYS.includes(key)) {
        if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) {
          results.push(val);
          continue;
        }
      }
      results.push(...this.findJobArraysRecursive(val, depth + 1, maxDepth));
    }

    return results;
  }
}

// ─── Constants ───────────────────────────────────────────────────

const JOB_ARRAY_KEYS = [
  "jobs", "jobPostings", "positions", "openings", "listings",
  "postings", "results", "items", "edges", "nodes", "data",
  "jobList", "jobResults", "searchResults", "opportunities",
];

// ─── Helpers ─────────────────────────────────────────────────────

function looksLikeJob(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return !!(
    (o["title"] || o["name"] || o["jobTitle"]) &&
    (o["id"] || o["jobId"] || o["url"] || o["applyUrl"] || o["absoluteUrl"] || o["hostedUrl"])
  );
}

function estimateJobCount(data: unknown): number {
  if (!data) return 0;
  if (Array.isArray(data)) {
    return data.filter(looksLikeJob).length;
  }
  if (typeof data !== "object") return 0;

  const obj = data as Record<string, unknown>;

  for (const key of JOB_ARRAY_KEYS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) return val.length;
  }

  // Recurse one level into common wrappers
  for (const wrapKey of ["props", "pageProps", "data", "results", "payload"]) {
    const wrapped = obj[wrapKey];
    if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
      const inner = estimateJobCount(wrapped);
      if (inner > 0) return inner;
    }
  }

  return 0;
}
