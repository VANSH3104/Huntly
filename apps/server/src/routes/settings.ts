import { Router } from "express";
import { getDatabase, settings } from "@huntly/database";
import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, UserSettingsSchema } from "@huntly/shared";

export const settingsRouter = Router();

// GET /api/settings
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const rows = await db.select().from(settings);
    const map: Record<string, unknown> = {};
    for (const row of rows) {
      try { map[row.key] = JSON.parse(row.value); } catch { map[row.key] = row.value; }
    }

    // Merge with defaults
    const merged = deepMerge(DEFAULT_SETTINGS, map as never);
    res.json(merged);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/settings & PUT /api/settings
const updateSettingsHandler = async (req: any, res: any, next: any) => {
  try {
    const db = getDatabase();
    const updates = req.body as Record<string, unknown>;

    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(settings)
        .values({ key, value: JSON.stringify(value), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(value), updatedAt: new Date() },
        });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

settingsRouter.patch("/", updateSettingsHandler);
settingsRouter.put("/", updateSettingsHandler);

// GET /api/settings/gemini-key — check if LLM/Gemini is configured
settingsRouter.get("/gemini-key", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const [row] = await db.select().from(settings).where(eq(settings.key, "gemini.apiKey")).limit(1);
    const envKey = process.env["LLM_API_KEY"] || process.env["GEMINI_API_KEY"];
    res.json({
      configured: !!(row?.value || envKey),
      source: row?.value ? "settings" : envKey ? "env" : "none",
      provider: process.env["LLM_PROVIDER"] || "freellm",
      model: process.env["LLM_MODEL"] || "auto",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/settings/llm — get detailed LLM status
settingsRouter.get("/llm", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const [rowProvider] = await db.select().from(settings).where(eq(settings.key, "llm.provider")).limit(1);
    const [rowBaseUrl] = await db.select().from(settings).where(eq(settings.key, "llm.baseUrl")).limit(1);
    const [rowModel] = await db.select().from(settings).where(eq(settings.key, "llm.model")).limit(1);

    const provider = rowProvider?.value ? JSON.parse(rowProvider.value) : process.env["LLM_PROVIDER"] || "freellm";
    const baseUrl = rowBaseUrl?.value ? JSON.parse(rowBaseUrl.value) : process.env["LLM_BASE_URL"] || "http://127.0.0.1:31415/v1";
    const model = rowModel?.value ? JSON.parse(rowModel.value) : process.env["LLM_MODEL"] || "auto";

    res.json({
      provider,
      baseUrl,
      model,
      configured: true,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/settings/test-llm — test live LLM connection
settingsRouter.post("/test-llm", async (req, res) => {
  try {
    const { GeminiClient } = await import("../services/gemini.js");
    const client = new GeminiClient(req.body);
    const start = Date.now();
    const responseText = await client.generateText("Return only the words: LLM Connection Successful");
    const latency = Date.now() - start;
    res.json({
      ok: true,
      message: responseText,
      latencyMs: latency,
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      error: err.message || "Failed to connect to LLM gateway",
    });
  }
});

function deepMerge<T extends object>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as (keyof T)[]) {
    const bVal = base[key];
    const oVal = override[key];
    if (bVal !== null && typeof bVal === "object" && !Array.isArray(bVal) &&
        oVal !== null && typeof oVal === "object" && !Array.isArray(oVal)) {
      result[key] = deepMerge(bVal as object, oVal as object) as T[keyof T];
    } else if (oVal !== undefined) {
      result[key] = oVal as T[keyof T];
    }
  }
  return result;
}
