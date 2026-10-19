import { chromium } from "playwright";
import { browserProfileDir } from "./resume-file.js";

let connecting = false;

/**
 * Opens a visible browser on the shared profile so the user can sign in to LinkedIn by hand.
 * The session cookie then stays in the profile for later runs. Resolves once login is seen or on timeout.
 */
export async function connectLinkedIn(): Promise<boolean> {
  if (connecting) return false;
  connecting = true;
  const context = await chromium.launchPersistentContext(browserProfileDir(), {
    headless: false,
    viewport: null,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (context.pages().length === 0) return false;
      const cookies = await context.cookies("https://www.linkedin.com").catch(() => []);
      if (cookies.some((c) => c.name === "li_at")) {
        await new Promise((r) => setTimeout(r, 2500));
        return true;
      }
    }
    return false;
  } finally {
    connecting = false;
    await context.close().catch(() => {});
  }
}

export const isConnectingLinkedIn = () => connecting;

/** True when the shared profile already holds a LinkedIn session. Needs a short headless launch. */
export async function hasLinkedInSession(): Promise<boolean> {
  if (connecting) return false;
  const context = await chromium.launchPersistentContext(browserProfileDir(), { headless: true });
  try {
    const cookies = await context.cookies("https://www.linkedin.com");
    return cookies.some((c) => c.name === "li_at");
  } finally {
    await context.close().catch(() => {});
  }
}
