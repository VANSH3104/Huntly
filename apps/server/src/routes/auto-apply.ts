import { Router, type Request, type Response, type NextFunction } from "express";
import { defaultAutoApplier } from "../crawler/auto-applier/engine.js";
import { ApplicantProfileSchema } from "../crawler/auto-applier/types.js";
import { getDatabase, settings, applications, jobs } from "@agentforge/database";
import { eq } from "drizzle-orm";
import { z } from "zod";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export const autoApplyRouter = Router();

// GET /api/auto-apply/profile — fetch applicant profile
autoApplyRouter.get("/profile", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const [row] = await db.select().from(settings).where(eq(settings.key, "autoApplyProfile")).limit(1);
    let profile = {};
    if (row?.value) {
      try {
        profile = JSON.parse(row.value);
      } catch {
        // ignore
      }
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auto-apply/profile — update applicant profile
autoApplyRouter.put("/profile", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const profile = ApplicantProfileSchema.partial().parse(req.body);

    await db
      .insert(settings)
      .values({
        key: "autoApplyProfile",
        value: JSON.stringify(profile),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: JSON.stringify(profile),
          updatedAt: new Date(),
        },
      });

    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply — run auto-apply in review or auto_submit mode
autoApplyRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      jobId: z.string().min(1),
      resumeId: z.string().optional(),
      mode: z.enum(["review", "auto_submit"]).default("review"),
      profileOverrides: ApplicantProfileSchema.partial().optional(),
    });

    const parsed = schema.parse(req.body);
    const result = await defaultAutoApplier.executeAutoApply(parsed);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply/confirm — confirm and submit a reviewed application
autoApplyRouter.post("/confirm", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      jobId: z.string().min(1),
      resumeId: z.string().optional(),
    });
    const parsed = schema.parse(req.body);

    const result = await defaultAutoApplier.executeAutoApply({
      jobId: parsed.jobId,
      resumeId: parsed.resumeId,
      mode: "auto_submit",
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/auto-apply/memory — get all remembered answers
autoApplyRouter.get("/memory", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const [row] = await db.select().from(settings).where(eq(settings.key, "autoApplyMemory")).limit(1);
    let memory: Record<string, string> = {};
    if (row?.value) {
      try {
        memory = JSON.parse(row.value);
      } catch {}
    }
    res.json({ success: true, memory });
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply/memory — teach or update a remembered answer
autoApplyRouter.post("/memory", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
    });
    const { question, answer } = schema.parse(req.body);
    const { aiAnswerGenerator } = await import("../crawler/auto-applier/ai-answer-generator.js");
    await aiAnswerGenerator.saveRememberedAnswer(question, answer);
    res.json({ success: true, question, answer });
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply/batch — run autonomous applications across multiple jobs
autoApplyRouter.post("/batch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      jobIds: z.array(z.string()).min(1),
      resumeId: z.string().optional(),
      mode: z.enum(["review", "auto_submit"]).default("auto_submit"),
    });
    const { jobIds, resumeId, mode } = schema.parse(req.body);

    const results: any[] = [];
    for (const jobId of jobIds) {
      try {
        const result = await defaultAutoApplier.executeAutoApply({
          jobId,
          resumeId,
          mode,
        });
        results.push(result);
      } catch (err: any) {
        results.push({
          jobId,
          status: "failed",
          error: err.message || "Failed to auto-apply",
        });
      }
    }

    res.json({
      success: true,
      total: jobIds.length,
      submitted: results.filter((r) => r.status === "submitted").length,
      readyForReview: results.filter((r) => r.status === "ready_for_review").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auto-apply/screenshot/:filename — stream screenshot
autoApplyRouter.get("/screenshot/:filename", (req: Request, res: Response) => {
  const rawParam = req.params.filename;
  const filename = path.basename(typeof rawParam === "string" ? rawParam : "");
  const filePath = path.join(os.tmpdir(), "agentforge-applications", filename);

  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: "Screenshot not found" });
  }
});
