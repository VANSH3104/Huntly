import { Router } from "express";
import { z } from "zod";
import { aiIntelScanner } from "../services/ai-intel-scanner.js";

export const intelRouter = Router();

// GET /api/intel/feed — retrieve curated tech & AI intelligence feed
intelRouter.get("/feed", async (req, res, next) => {
  try {
    const force = req.query["force"] === "true";
    const category = req.query["category"] as string | undefined;
    const query = req.query["q"] as string | undefined;

    let items = await aiIntelScanner.refreshFeed(force);

    if (category && category !== "all") {
      items = items.filter((i) => i.category.toLowerCase() === category.toLowerCase());
    }

    if (query && query.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.executiveSummary.toLowerCase().includes(q) ||
          i.keyConcepts.some((k) => k.toLowerCase().includes(q))
      );
    }

    res.json({
      success: true,
      count: items.length,
      feed: items,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/intel/refresh — force re-scrape and AI synthesis
intelRouter.post("/refresh", async (_req, res, next) => {
  try {
    const feed = await aiIntelScanner.refreshFeed(true);
    res.json({
      success: true,
      count: feed.length,
      feed,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/intel/deep-dive — generate detailed markdown explainer and architectural breakdown
intelRouter.post("/deep-dive", async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string(),
      summary: z.string(),
      url: z.string(),
    });
    const { title, summary, url } = schema.parse(req.body);

    const breakdown = await aiIntelScanner.generateDeepDive(title, summary, url);
    res.json({
      success: true,
      ...breakdown,
    });
  } catch (err) {
    next(err);
  }
});
