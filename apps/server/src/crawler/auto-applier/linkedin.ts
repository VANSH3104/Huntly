import { browserSession } from "./browser-session.js";

let connecting = false;

/**
 * Opens a visible tab on the shared profile so the user can sign in to LinkedIn by hand.
 * The session cookie stays in the profile for later runs. Resolves once login is seen or on timeout.
 */
export async function connectLinkedIn(): Promise<boolean> {
  if (connecting) return false;
  connecting = true;
  try {
    const context = await browserSession.get(false);
    const page = await browserSession.newPage(context);
    await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      if (page.isClosed()) return false;
      const cookies = await context.cookies("https://www.linkedin.com").catch(() => []);
      if (cookies.some((c) => c.name === "li_at")) {
        await new Promise((r) => setTimeout(r, 2500));
        await page.close().catch(() => {});
        return true;
      }
    }
    await page.close().catch(() => {});
    return false;
  } finally {
    connecting = false;
    browserSession.release();
  }
}

export const isConnectingLinkedIn = () => connecting;
