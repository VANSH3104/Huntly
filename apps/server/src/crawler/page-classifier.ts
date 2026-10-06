/**
 * PageClassifier — Classifies a page's content type before running expensive extraction.
 *
 * Classification avoids wasting resources extracting data from login pages,
 * blog posts, or error pages. It uses a multi-signal scoring approach:
 *   - URL pattern matching
 *   - Page title analysis
 *   - Meta description analysis
 *   - Heading text signals
 *   - DOM structure signals (presence of job cards, apply buttons, etc.)
 *   - JSON-LD @type detection
 *   - HTTP status
 */

import type { Page } from "playwright";

// ─── Types ───────────────────────────────────────────────────────

export type PageType =
  | "JOB_LIST"
  | "JOB_DETAIL"
  | "CAREER_PAGE"
  | "COMPANY_PAGE"
  | "HIRING_POST"
  | "BLOG"
  | "ENGINEERING_BLOG"
  | "RECRUITER_PROFILE"
  | "SEARCH_RESULTS"
  | "LOGIN"
  | "ERROR"
  | "UNKNOWN";

export interface ClassificationResult {
  type: PageType;
  confidence: number;
  signals: string[];
}

// ─── Scoring Tables ───────────────────────────────────────────────

type ScoredSignal = { pattern: RegExp; score: number; label: string };

const URL_SIGNALS: Record<PageType, ScoredSignal[]> = {
  JOB_LIST: [
    { pattern: /\/jobs?\/?$/i,             score: 0.7, label: "url:/jobs" },
    { pattern: /\/careers?\/?$/i,          score: 0.7, label: "url:/careers" },
    { pattern: /\/open-?positions?\/?$/i,  score: 0.7, label: "url:/open-positions" },
    { pattern: /\/opportunities?\/?$/i,    score: 0.6, label: "url:/opportunities" },
    { pattern: /\/join-?us\/?$/i,          score: 0.5, label: "url:/join-us" },
    { pattern: /\/work-?with\/?/i,         score: 0.5, label: "url:/work-with" },
    { pattern: /\/hiring\/?$/i,            score: 0.5, label: "url:/hiring" },
    { pattern: /search\?.*(?:job|role)/i,  score: 0.5, label: "url:search?job" },
  ],
  JOB_DETAIL: [
    { pattern: /\/jobs?\/[^/]+$/i,         score: 0.8, label: "url:/jobs/slug" },
    { pattern: /\/position\/[^/]+$/i,      score: 0.7, label: "url:/position/slug" },
    { pattern: /\/opening\/[^/]+$/i,       score: 0.7, label: "url:/opening/slug" },
    { pattern: /\/posting\/[^/]+$/i,       score: 0.7, label: "url:/posting/slug" },
    { pattern: /\/careers?\/[^/]+\/[^/]+$/, score: 0.6, label: "url:/careers/dept/job" },
    { pattern: /jid=|jobId=|job_id=/i,    score: 0.6, label: "url:?jobId=" },
  ],
  CAREER_PAGE: [
    { pattern: /\/careers?\/?$/i,          score: 0.6, label: "url:/careers" },
    { pattern: /\/talent\/?$/i,            score: 0.4, label: "url:/talent" },
  ],
  LOGIN: [
    { pattern: /\/login/i,                 score: 0.9, label: "url:/login" },
    { pattern: /\/signin/i,                score: 0.9, label: "url:/signin" },
    { pattern: /\/auth/i,                  score: 0.7, label: "url:/auth" },
  ],
  ERROR: [
    { pattern: /\/404/i,                   score: 0.9, label: "url:/404" },
    { pattern: /\/error/i,                 score: 0.7, label: "url:/error" },
  ],
  BLOG: [
    { pattern: /\/blog\//i,                score: 0.8, label: "url:/blog/" },
    { pattern: /\/post\//i,                score: 0.6, label: "url:/post/" },
    { pattern: /\/article\//i,             score: 0.6, label: "url:/article/" },
  ],
  ENGINEERING_BLOG: [
    { pattern: /\/engineering\//i,         score: 0.7, label: "url:/engineering/" },
    { pattern: /engineering.*blog/i,       score: 0.7, label: "url:eng-blog" },
  ],
  COMPANY_PAGE:    [],
  HIRING_POST:     [],
  RECRUITER_PROFILE: [],
  SEARCH_RESULTS:  [],
  UNKNOWN:         [],
};

const TITLE_SIGNALS: Record<PageType, ScoredSignal[]> = {
  JOB_LIST: [
    { pattern: /open\s+(?:roles|positions|jobs)/i, score: 0.7, label: "title:open-roles" },
    { pattern: /(?:job|career)\s+(?:listing|board|opportunities)/i, score: 0.7, label: "title:job-board" },
    { pattern: /we.re\s+hiring/i,                 score: 0.6, label: "title:hiring" },
    { pattern: /join\s+(?:our\s+)?team/i,          score: 0.5, label: "title:join-team" },
  ],
  JOB_DETAIL: [
    { pattern: /apply\s+(?:now|for|to)/i,          score: 0.6, label: "title:apply-now" },
    { pattern: /(?:engineer|developer|designer|manager|analyst|scientist)/i, score: 0.4, label: "title:role-keyword" },
  ],
  CAREER_PAGE: [
    { pattern: /careers?\s+at\b/i,                score: 0.7, label: "title:careers-at" },
    { pattern: /work\s+(?:at|with|for)\b/i,        score: 0.5, label: "title:work-at" },
    { pattern: /life\s+at\b/i,                    score: 0.4, label: "title:life-at" },
  ],
  LOGIN: [
    { pattern: /sign\s*in|log\s*in/i,             score: 0.9, label: "title:sign-in" },
  ],
  ERROR: [
    { pattern: /page\s+not\s+found|404|not\s+found/i, score: 0.9, label: "title:404" },
  ],
  BLOG:              [],
  ENGINEERING_BLOG:  [],
  COMPANY_PAGE:      [],
  HIRING_POST:       [],
  RECRUITER_PROFILE: [],
  SEARCH_RESULTS:    [],
  UNKNOWN:           [],
};

const JSON_LD_TYPE_MAP: Record<string, PageType> = {
  "JobPosting":    "JOB_DETAIL",
  "ItemList":      "JOB_LIST",
  "Organization":  "COMPANY_PAGE",
  "WebPage":       "UNKNOWN",
  "BlogPosting":   "BLOG",
};

// ─── PageClassifier ───────────────────────────────────────────────

export class PageClassifier {
  /**
   * Classifies the current page using multiple signals.
   */
  async classify(page: Page): Promise<ClassificationResult> {
    const url = page.url();
    const scores = new Map<PageType, number>();
    const allSignals: string[] = [];

    const addScore = (type: PageType, score: number, signal: string) => {
      scores.set(type, (scores.get(type) ?? 0) + score);
      allSignals.push(`[${type}] ${signal} (+${score.toFixed(2)})`);
    };

    // ── 1. URL signals ──────────────────────────────────────
    for (const [pageType, signals] of Object.entries(URL_SIGNALS) as Array<[PageType, ScoredSignal[]]>) {
      for (const s of signals) {
        if (s.pattern.test(url)) addScore(pageType, s.score, s.label);
      }
    }

    // ── 2. Page title signals ───────────────────────────────
    const title = await page.title().catch(() => "");
    for (const [pageType, signals] of Object.entries(TITLE_SIGNALS) as Array<[PageType, ScoredSignal[]]>) {
      for (const s of signals) {
        if (s.pattern.test(title)) addScore(pageType, s.score, s.label);
      }
    }

    // ── 3. JSON-LD @type ────────────────────────────────────
    const ldTypes = await this.getJsonLdTypes(page);
    for (const ldType of ldTypes) {
      const mapped = JSON_LD_TYPE_MAP[ldType];
      if (mapped) addScore(mapped, 0.8, `json-ld:@type=${ldType}`);
    }

    // ── 4. DOM structure signals ────────────────────────────
    const domResult = await this.analyzeDomStructure(page);
    for (const [type, score, signal] of domResult) {
      addScore(type, score, signal);
    }

    // ── 5. Find winner ──────────────────────────────────────
    let bestType: PageType = "UNKNOWN";
    let bestScore = 0;

    for (const [type, score] of scores) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    const confidence = Math.min(bestScore, 1.0);

    return {
      type: bestType,
      confidence,
      signals: allSignals,
    };
  }

  // ─── Private helpers ────────────────────────────────────────

  private async getJsonLdTypes(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const types: string[] = [];
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const script of scripts) {
        try {
          const parsed = JSON.parse(script.textContent ?? "");
          const extract = (obj: unknown): void => {
            if (!obj || typeof obj !== "object") return;
            if (Array.isArray(obj)) { obj.forEach(extract); return; }
            const o = obj as Record<string, unknown>;
            if (o["@type"]) {
              const t = o["@type"];
              if (Array.isArray(t)) t.forEach(v => types.push(String(v)));
              else types.push(String(t));
            }
            if (o["@graph"]) extract(o["@graph"]);
          };
          extract(parsed);
        } catch { /* skip */ }
      }
      return types;
    }).catch(() => []);
  }

  private async analyzeDomStructure(page: Page): Promise<Array<[PageType, number, string]>> {
    return page.evaluate(() => {
      const results: Array<[string, number, string]> = [];
      const body = document.body;
      if (!body) return [];

      const has = (selector: string) => !!document.querySelector(selector);
      const count = (selector: string) => document.querySelectorAll(selector).length;
      const hasText = (selector: string, regex: RegExp) => {
        const el = document.querySelector(selector);
        return el ? regex.test(el.textContent ?? "") : false;
      };

      // Job list signals
      const jobCardCount = count("[data-job-id], .job-card, .job-item, .job-listing, [class*='job-card'], [class*='JobCard']");
      if (jobCardCount > 2) results.push(["JOB_LIST", Math.min(jobCardCount * 0.08, 0.8), `dom:${jobCardCount} job-cards`]);

      const applyBtnCount = count("[href*='apply'], button:is([class*='apply'],[id*='apply'])");
      if (applyBtnCount === 1) results.push(["JOB_DETAIL", 0.6, "dom:single-apply-button"]);
      if (applyBtnCount > 5) results.push(["JOB_LIST", 0.5, `dom:${applyBtnCount} apply buttons`]);

      // Job detail signals
      if (has(".job-description, #job-description, [class*='JobDescription']")) {
        results.push(["JOB_DETAIL", 0.7, "dom:job-description-block"]);
      }

      // Login signals
      if (has("form input[type='password']")) {
        results.push(["LOGIN", 0.9, "dom:password-input"]);
      }

      // Error signals
      if (hasText("h1", /404|not found/i)) {
        results.push(["ERROR", 0.9, "dom:404-h1"]);
      }

      return results;
    }).catch(() => []) as Promise<Array<[PageType, number, string]>>;
  }
}

// ─── Job Detail Validator ─────────────────────────────────────────

/** Signals that indicate a page is a genuine job posting (not just an article about jobs). */
export function isLikelyJobDetail(
  title: string,
  textContent: string,
  url: string
): boolean {
  const titleLower = title.toLowerCase();
  const textLower = textContent.slice(0, 3000).toLowerCase();

  const jobTitlePatterns = [
    /engineer|developer|designer|manager|analyst|scientist|architect|lead|director|intern/i,
  ];
  const hasJobTitle = jobTitlePatterns.some(p => p.test(title));

  const structuralSignals = [
    /responsibilities/i,
    /requirements/i,
    /qualifications/i,
    /what you.ll do/i,
    /what we.re looking for/i,
    /apply\s+(?:now|here)/i,
    /job\s+description/i,
    /employment\s+type/i,
  ];
  const structuralMatches = structuralSignals.filter(p => p.test(textLower)).length;

  // Must have a job-title-like title AND at least 2 structural signals
  return hasJobTitle && structuralMatches >= 2;
}
