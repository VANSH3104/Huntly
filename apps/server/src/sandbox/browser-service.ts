import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export interface ConsoleLogEntry {
  type: "log" | "warn" | "error" | "info";
  text: string;
  time: string;
}

export interface BrowserState {
  isOpen: boolean;
  url: string;
  title: string;
  status: number;
  screenshot?: string;
  consoleLogs: ConsoleLogEntry[];
  viewport: { width: number; height: number };
}

export class SandboxBrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleLogs: ConsoleLogEntry[] = [];
  private currentStatus: number = 200;
  private viewport = { width: 1280, height: 800 };

  private async ensureBrowser(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }

    this.context = await this.browser.newContext({
      viewport: this.viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 AgentForgeSandbox/1.0",
      ignoreHTTPSErrors: true,
    });

    this.page = await this.context.newPage();
    this.consoleLogs = [];

    this.page.on("console", (msg) => {
      const type = (["log", "warn", "error", "info"].includes(msg.type())
        ? msg.type()
        : "log") as ConsoleLogEntry["type"];
      this.consoleLogs.push({
        type,
        text: msg.text(),
        time: new Date().toLocaleTimeString(),
      });
      if (this.consoleLogs.length > 150) {
        this.consoleLogs.shift();
      }
    });

    this.page.on("pageerror", (err) => {
      this.consoleLogs.push({
        type: "error",
        text: `Uncaught exception: ${err.message}`,
        time: new Date().toLocaleTimeString(),
      });
    });

    this.page.on("requestfailed", (req) => {
      this.consoleLogs.push({
        type: "warn",
        text: `Request failed: ${req.url()} (${req.failure()?.errorText || "unknown error"})`,
        time: new Date().toLocaleTimeString(),
      });
    });

    return this.page;
  }

  private normalizeUrl(inputUrl: string): string {
    let target = inputUrl.trim();
    if (!target) target = "http://localhost:5173";
    if (!/^https?:\/\//i.test(target)) {
      if (target.startsWith("localhost") || target.startsWith("127.0.0.1")) {
        target = `http://${target}`;
      } else {
        target = `https://${target}`;
      }
    }
    return target;
  }

  private async captureScreenshot(page: Page): Promise<string> {
    try {
      const buffer = await page.screenshot({
        type: "png",
        fullPage: false,
        timeout: 5000,
      });
      return `data:image/png;base64,${buffer.toString("base64")}`;
    } catch {
      return "";
    }
  }

  async navigate(url: string, viewport?: { width: number; height: number }): Promise<BrowserState> {
    const page = await this.ensureBrowser();
    if (viewport) {
      this.viewport = viewport;
      await page.setViewportSize(viewport).catch(() => {});
    }

    const normalized = this.normalizeUrl(url);

    try {
      const response = await page.goto(normalized, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      this.currentStatus = response?.status() ?? 200;
      await page.waitForTimeout(600);
    } catch (err: any) {
      this.consoleLogs.push({
        type: "error",
        text: `Navigation error to ${normalized}: ${err?.message || "Failed"}`,
        time: new Date().toLocaleTimeString(),
      });
      this.currentStatus = 500;
    }

    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);

    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async click(x?: number, y?: number, selector?: string): Promise<BrowserState> {
    const page = await this.ensureBrowser();

    try {
      if (selector) {
        await page.click(selector, { timeout: 4000 });
      } else if (typeof x === "number" && typeof y === "number") {
        await page.mouse.click(x, y);
      }
      await page.waitForTimeout(600);
    } catch (err: any) {
      this.consoleLogs.push({
        type: "error",
        text: `Click error: ${err?.message || "Click failed"}`,
        time: new Date().toLocaleTimeString(),
      });
    }

    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);

    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async type(text: string, selector?: string): Promise<BrowserState> {
    const page = await this.ensureBrowser();

    try {
      if (selector) {
        await page.fill(selector, text, { timeout: 4000 });
      } else {
        await page.keyboard.type(text);
      }
      await page.waitForTimeout(300);
    } catch (err: any) {
      this.consoleLogs.push({
        type: "error",
        text: `Type error: ${err?.message || "Type failed"}`,
        time: new Date().toLocaleTimeString(),
      });
    }

    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);

    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async scroll(deltaY: number): Promise<BrowserState> {
    const page = await this.ensureBrowser();

    try {
      await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: "smooth" }), deltaY);
      await page.waitForTimeout(350);
    } catch (err: any) {
      this.consoleLogs.push({
        type: "warn",
        text: `Scroll error: ${err?.message || "Scroll failed"}`,
        time: new Date().toLocaleTimeString(),
      });
    }

    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);

    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async goBack(): Promise<BrowserState> {
    const page = await this.ensureBrowser();
    try {
      await page.goBack({ timeout: 10000 });
      await page.waitForTimeout(400);
    } catch {/* ignore */}
    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);
    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async goForward(): Promise<BrowserState> {
    const page = await this.ensureBrowser();
    try {
      await page.goForward({ timeout: 10000 });
      await page.waitForTimeout(400);
    } catch {/* ignore */}
    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);
    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async reload(): Promise<BrowserState> {
    const page = await this.ensureBrowser();
    try {
      await page.reload({ timeout: 15000 });
      await page.waitForTimeout(500);
    } catch {/* ignore */}
    const title = await page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(page);
    return {
      isOpen: true,
      url: page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async getState(): Promise<BrowserState> {
    if (!this.page || this.page.isClosed()) {
      return {
        isOpen: false,
        url: "",
        title: "",
        status: 0,
        consoleLogs: [],
        viewport: this.viewport,
      };
    }

    const title = await this.page.title().catch(() => "");
    const screenshot = await this.captureScreenshot(this.page);

    return {
      isOpen: true,
      url: this.page.url(),
      title,
      status: this.currentStatus,
      screenshot,
      consoleLogs: [...this.consoleLogs],
      viewport: this.viewport,
    };
  }

  async close(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
      if (this.context) {
        await this.context.close().catch(() => {});
      }
      if (this.browser && this.browser.isConnected()) {
        await this.browser.close().catch(() => {});
      }
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
      this.consoleLogs = [];
    }
  }
}

export const defaultSandboxBrowser = new SandboxBrowserService();
