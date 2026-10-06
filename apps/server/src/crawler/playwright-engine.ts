/**
 * PlaywrightEngine — Core browser management layer
 *
 * Provides:
 *  - Lazy singleton Chromium launch
 *  - Browser-level context pool (isolation without full re-launch)
 *  - Per-domain concurrency limiting
 *  - Aggressive resource blocking (images, fonts, ads, tracking)
 *    while always allowing job API / JSON / GraphQL traffic
 *  - Automatic crash detection & browser restart
 *  - Screenshot + HTML snapshot on extraction failure (debug mode)
 */

import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";

// ─── Configuration ───────────────────────────────────────────────

const BROWSER_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-first-run",
  "--mute-audio",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

/** Resource types always blocked (do not affect data payloads). */
const BLOCKED_TYPES = new Set([
  "image",
  "media",
  "font",
  "stylesheet",
]);

/** URL patterns that are always blocked regardless of resource type. */
const BLOCKED_URL_PATTERNS = [
  /google-analytics/i,
  /googletagmanager/i,
  /hotjar/i,
  /intercom/i,
  /segment\.com/i,
  /mixpanel/i,
  /amplitude\.com/i,
  /sentry\.io/i,
  /ads\.linkedin/i,
  /doubleclick\.net/i,
  /facebook\.net\/tr/i,
  /twitter\.com\/i\/adsct/i,
  /track\./i,
  /analytics\./i,
  /pixel\./i,
];

/** URL patterns that must NEVER be blocked (job / API / data traffic). */
const ALLOW_URL_PATTERNS = [
  /api\./i,
  /jobs/i,
  /career/i,
  /careers/i,
  /posting/i,
  /position/i,
  /opening/i,
  /graphql/i,
  /search/i,
  /listing/i,
  /greenhouse\.io/i,
  /lever\.co/i,
  /ashbyhq\.com/i,
  /workday\.com/i,
  /smartrecruiters\.com/i,
  /workable\.com/i,
  /bamboohr\.com/i,
];

/** Max concurrency PER domain. */
const PER_DOMAIN_CONCURRENCY = 3;

/** Max total concurrent pages across all domains. */
const MAX_TOTAL_PAGES = 12;

/** Max browser restart attempts before marking engine unhealthy. */
const MAX_RESTART_ATTEMPTS = 3;

// ─── Types ───────────────────────────────────────────────────────

export interface PageSession {
  page: Page;
  context: BrowserContext;
  domain: string;
  release: () => Promise<void>;
}

export interface EngineOptions {
  headless?: boolean;
  debugSnapshots?: boolean;
  snapshotDir?: string;
  userAgent?: string;
  timeout?: number;
}

// ─── Domain Concurrency Tracker ──────────────────────────────────

class DomainSemaphore {
  private counts = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();

  async acquire(domain: string): Promise<void> {
    const current = this.counts.get(domain) ?? 0;
    if (current < PER_DOMAIN_CONCURRENCY) {
      this.counts.set(domain, current + 1);
      return;
    }
    return new Promise<void>((resolve) => {
      const q = this.waiters.get(domain) ?? [];
      q.push(resolve);
      this.waiters.set(domain, q);
    });
  }

  release(domain: string): void {
    const waiters = this.waiters.get(domain) ?? [];
    if (waiters.length > 0) {
      const next = waiters.shift()!;
      this.waiters.set(domain, waiters);
      next();
    } else {
      const current = this.counts.get(domain) ?? 1;
      this.counts.set(domain, Math.max(0, current - 1));
    }
  }
}

// ─── Global Concurrency Semaphore ────────────────────────────────

class GlobalSemaphore {
  private count = 0;
  private waiters: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (this.count < MAX_TOTAL_PAGES) {
      this.count++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next();
    } else {
      this.count = Math.max(0, this.count - 1);
    }
  }
}

// ─── PlaywrightEngine ────────────────────────────────────────────

export class PlaywrightEngine {
  private browser: Browser | null = null;
  private restartAttempts = 0;
  private _healthy = true;
  private domainSem = new DomainSemaphore();
  private globalSem = new GlobalSemaphore();
  private options: Required<EngineOptions>;

  constructor(options: EngineOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      debugSnapshots: options.debugSnapshots ?? false,
      snapshotDir: options.snapshotDir ?? "/tmp/agentforge-snapshots",
      userAgent: options.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      timeout: options.timeout ?? 30_000,
    };
  }

  // ─── Browser Lifecycle ───────────────────────────────────────

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (!this._healthy) throw new Error("PlaywrightEngine is permanently unhealthy");

    console.log("[PlaywrightEngine] Launching Chromium...");
    this.browser = await chromium.launch({
      headless: this.options.headless,
      args: BROWSER_LAUNCH_ARGS,
    });

    this.browser.on("disconnected", () => {
      console.warn("[PlaywrightEngine] Browser disconnected unexpectedly");
      this.browser = null;
      this.scheduleRestart();
    });

    console.log("[PlaywrightEngine] Chromium launched");
    this.restartAttempts = 0;
    return this.browser;
  }

  private scheduleRestart(): void {
    this.restartAttempts++;
    if (this.restartAttempts > MAX_RESTART_ATTEMPTS) {
      console.error("[PlaywrightEngine] Too many restarts — marking engine unhealthy");
      this._healthy = false;
      return;
    }
    const delay = Math.pow(2, this.restartAttempts) * 2000;
    console.log(`[PlaywrightEngine] Restart attempt ${this.restartAttempts} in ${delay}ms`);
    setTimeout(() => {
      this.ensureBrowser().catch(err =>
        console.error("[PlaywrightEngine] Restart failed:", err)
      );
    }, delay);
  }

  async close(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
    }
    this.browser = null;
  }

  // ─── Context Creation ────────────────────────────────────────

  private async createContext(): Promise<BrowserContext> {
    const browser = await this.ensureBrowser();
    const context = await browser.newContext({
      userAgent: this.options.userAgent,
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      bypassCSP: true,
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    context.setDefaultTimeout(this.options.timeout);
    context.setDefaultNavigationTimeout(this.options.timeout);
    return context;
  }

  // ─── Page Session ────────────────────────────────────────────

  /**
   * Acquires a managed page session with:
   *  - Domain & global concurrency limiting
   *  - Automatic resource blocking
   *  - Automatic context release
   */
  async acquirePage(domain: string): Promise<PageSession> {
    if (!this._healthy) throw new Error("PlaywrightEngine is not healthy");

    await this.globalSem.acquire();
    await this.domainSem.acquire(domain);

    let context: BrowserContext;
    let page: Page;

    try {
      context = await this.createContext();
      page = await context.newPage();
      await this.installResourceBlocker(page);
      this.installConsoleCapturer(page);
    } catch (err) {
      this.domainSem.release(domain);
      this.globalSem.release();
      throw err;
    }

    const release = async () => {
      try { await context.close(); } catch { /* already closed */ }
      this.domainSem.release(domain);
      this.globalSem.release();
    };

    return { page, context, domain, release };
  }

  // ─── Resource Blocking ───────────────────────────────────────

  private async installResourceBlocker(page: Page): Promise<void> {
    await page.route("**/*", (route: Route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();

      // Always allow job/API traffic
      if (ALLOW_URL_PATTERNS.some(p => p.test(url))) {
        route.continue();
        return;
      }

      // Block known tracking URLs
      if (BLOCKED_URL_PATTERNS.some(p => p.test(url))) {
        route.abort();
        return;
      }

      // Block heavy resource types
      if (BLOCKED_TYPES.has(resourceType)) {
        route.abort();
        return;
      }

      route.continue();
    });
  }

  // ─── Console & Error Capture ─────────────────────────────────

  private installConsoleCapturer(page: Page): void {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.debug(`[Page Console] ${page.url()}: ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.debug(`[Page JS Error] ${page.url()}: ${err.message}`);
    });
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (ALLOW_URL_PATTERNS.some(p => p.test(url))) {
        console.debug(`[Request Failed] ${url}: ${req.failure()?.errorText}`);
      }
    });
  }

  // ─── Debug Snapshots ─────────────────────────────────────────

  async captureDebugSnapshot(page: Page, label: string, error?: Error): Promise<void> {
    if (!this.options.debugSnapshots) return;
    try {
      await fs.mkdir(this.options.snapshotDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const base = path.join(this.options.snapshotDir, `${label}-${ts}`);
      await page.screenshot({ path: `${base}.png`, fullPage: true });
      await fs.writeFile(`${base}.html`, await page.content(), "utf-8");
      await fs.writeFile(
        `${base}.json`,
        JSON.stringify({ url: page.url(), timestamp: new Date().toISOString(), label, error: error?.message }, null, 2),
        "utf-8"
      );
      console.log(`[PlaywrightEngine] Snapshot saved: ${base}`);
    } catch (snapErr) {
      console.warn("[PlaywrightEngine] Snapshot failed:", snapErr);
    }
  }

  // ─── Status ──────────────────────────────────────────────────

  get isHealthy(): boolean { return this._healthy; }
  get isBrowserRunning(): boolean { return this.browser?.isConnected() ?? false; }
}

// ─── Singleton ───────────────────────────────────────────────────

let _engine: PlaywrightEngine | null = null;

export function getPlaywrightEngine(options?: EngineOptions): PlaywrightEngine {
  if (!_engine) _engine = new PlaywrightEngine(options);
  return _engine;
}

export async function shutdownPlaywrightEngine(): Promise<void> {
  if (_engine) {
    await _engine.close();
    _engine = null;
  }
}
