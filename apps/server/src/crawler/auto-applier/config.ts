import { getDatabase, settings } from "@huntly/database";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const AutoApplyConfigSchema = z.object({
  /** tabs: fill each job in a browser tab and leave it open for the user to submit. */
  mode: z.enum(["tabs", "review", "auto_submit"]).default("tabs"),
  /** How many job tabs may be open at once in tabs mode. */
  tabBatch: z.number().int().min(1).max(30).default(8),
  headless: z.boolean().default(true),
  dailyCap: z.number().int().min(1).max(500).default(40),
  delayMs: z.number().int().min(0).max(120000).default(4000),
  maxPerRun: z.number().int().min(1).max(500).default(25),
  /** What to do when a job needs a login: list it for later, or pause and let the user sign in. */
  onLogin: z.enum(["skip", "wait"]).default("skip"),
  /** Answer required questions it is unsure about with a best guess instead of stopping to ask. */
  fillGaps: z.boolean().default(true),
  /** On a captcha: re-run the job in a visible window so the user can solve it, or leave it parked. */
  onCaptcha: z.enum(["wait", "skip"]).default("wait"),
});

export type AutoApplyConfig = z.infer<typeof AutoApplyConfigSchema>;

const KEY = "autoApplyConfig";

export async function getAutoApplyConfig(): Promise<AutoApplyConfig> {
  const db = getDatabase();
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  let raw: unknown = {};
  try {
    raw = row?.value ? JSON.parse(row.value) : {};
  } catch {
    raw = {};
  }
  return AutoApplyConfigSchema.parse(raw);
}

export async function saveAutoApplyConfig(patch: Partial<AutoApplyConfig>): Promise<AutoApplyConfig> {
  const next = AutoApplyConfigSchema.parse({ ...(await getAutoApplyConfig()), ...patch });
  const db = getDatabase();
  await db
    .insert(settings)
    .values({ key: KEY, value: JSON.stringify(next), updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: JSON.stringify(next), updatedAt: new Date() } });
  return next;
}
