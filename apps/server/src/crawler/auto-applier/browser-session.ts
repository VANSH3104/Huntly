import { chromium, type BrowserContext, type Page } from "playwright";
import { browserProfileDir } from "./resume-file.js";

const IDLE_CLOSE_MS = 90_000;

/**
 * One persistent Chromium profile shared by every run, so logins survive and tabs can be left open
 * for the user. Chromium locks a profile to a single process, so nothing else may launch on it.
 */
class BrowserSession {
  private ctx: BrowserContext | null = null;
  private visible = false;
  private launching: Promise<BrowserContext> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  /** A context that can show windows. A hidden one is relaunched visible when a visible one is needed. */
  async get(headless: boolean): Promise<BrowserContext> {
    this.cancelIdle();
    if (this.launching) await this.launching.catch(() => {});
    if (this.ctx && !headless && !this.visible) {
      // Only relaunch when no job tab is open, otherwise the user would lose their work.
      await this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    if (this.ctx) return this.ctx;

    this.launching = chromium.launchPersistentContext(browserProfileDir(), {
      headless,
      viewport: headless ? { width: 1280, height: 960 } : null,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
    });
    try {
      const ctx = await this.launching;
      // tsx/esbuild wraps named functions with __name(); page.evaluate bodies need a stub for it.
      await ctx.addInitScript("globalThis.__name = (fn) => fn;");
      ctx.on("close", () => {
        if (this.ctx === ctx) this.ctx = null;
      });
      this.ctx = ctx;
      this.visible = !headless;
      return ctx;
    } finally {
      this.launching = null;
    }
  }

  /** A fresh tab, reusing the blank page a new window starts with. */
  async newPage(ctx: BrowserContext): Promise<Page> {
    const blank = ctx.pages().find((p) => !p.isClosed() && p.url() === "about:blank");
    const page = blank ?? (await ctx.newPage());
    page.setDefaultTimeout(20000);
    return page;
  }

  /** Tabs that hold real content (a job the user may still want to submit). */
  busyPages(): number {
    return this.ctx ? this.ctx.pages().filter((p) => !p.isClosed() && p.url() !== "about:blank").length : 0;
  }

  /** Close the window shortly after the last tab is gone, so the profile is free for other uses. */
  release() {
    this.cancelIdle();
    this.idleTimer = setTimeout(() => {
      if (this.ctx && this.busyPages() === 0) void this.ctx.close().catch(() => {});
    }, IDLE_CLOSE_MS);
  }

  private cancelIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

export const browserSession = new BrowserSession();
