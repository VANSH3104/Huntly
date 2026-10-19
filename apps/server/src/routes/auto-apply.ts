import express, { Router, type Request, type Response, type NextFunction } from "express";
import { defaultAutoApplier } from "../crawler/auto-applier/engine.js";
import { ApplicantProfileSchema } from "../crawler/auto-applier/types.js";
import { getUploadedResume, saveUploadedResume, deleteUploadedResume } from "../crawler/auto-applier/resume-file.js";
import { autoApplyQueue } from "../crawler/auto-applier/queue.js";
import { connectLinkedIn, isConnectingLinkedIn } from "../crawler/auto-applier/linkedin.js";
import { AutoApplyConfigSchema, getAutoApplyConfig, saveAutoApplyConfig } from "../crawler/auto-applier/config.js";
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

// POST /api/auto-apply/batch (legacy name) — enqueue jobs; the queue worker applies in the background
autoApplyRouter.post("/batch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobIds, resumeId, mode } = enqueueSchema.parse(req.body);
    const outcome = await autoApplyQueue.enqueue(jobIds, { mode, resumeId });
    res.json({ success: true, ...outcome });
  } catch (err) {
    next(err);
  }
});

const enqueueSchema = z.object({
  jobIds: z.array(z.string()).min(1).max(1000),
  resumeId: z.string().optional(),
  mode: z.enum(["tabs", "review", "auto_submit"]).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

// POST /api/auto-apply/queue/preview — how many of these jobs are new vs already applied
autoApplyRouter.post("/queue/preview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobIds } = z.object({ jobIds: z.array(z.string()).max(2000) }).parse(req.body);
    const { fresh, skipped } = await autoApplyQueue.classify(jobIds);
    res.json({ total: jobIds.length, fresh: fresh.length, skipped });
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply/queue — enqueue jobs for hands-off applying
autoApplyRouter.post("/queue", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobIds, resumeId, mode, limit } = enqueueSchema.parse(req.body);
    res.json(await autoApplyQueue.enqueue(jobIds, { mode, resumeId, limit }));
  } catch (err) {
    next(err);
  }
});

// GET /api/auto-apply/queue — queue state for the live panel
autoApplyRouter.get("/queue", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await autoApplyQueue.list());
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/pause", (_req: Request, res: Response) => {
  autoApplyQueue.pause();
  res.json({ paused: true });
});

autoApplyRouter.post("/queue/resume", (_req: Request, res: Response) => {
  autoApplyQueue.resume();
  res.json({ paused: false });
});

autoApplyRouter.post("/queue/cancel-queued", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await autoApplyQueue.cancelQueued();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/clear-failed", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await autoApplyQueue.clearFinished();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/rerun", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { statuses } = z
      .object({ statuses: z.array(z.enum(["needs_review", "needs_login", "skipped", "failed"])) })
      .parse(req.body);
    await autoApplyQueue.rerun(statuses);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/:id/retry", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const opts = z.object({ force: z.boolean().optional(), signIn: z.boolean().optional() }).parse(req.body ?? {});
    await autoApplyQueue.retry(String(req.params["id"]), opts);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/:id/focus", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ ok: await autoApplyQueue.focus(String(req.params["id"])) });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.post("/queue/:id/mark-applied", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await autoApplyQueue.markApplied(String(req.params["id"]));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.delete("/queue/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    await autoApplyQueue.remove(String(req.params["id"]));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET/PUT /api/auto-apply/config — autopilot settings
autoApplyRouter.get("/config", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await getAutoApplyConfig());
  } catch (err) {
    next(err);
  }
});

autoApplyRouter.put("/config", async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(await saveAutoApplyConfig(AutoApplyConfigSchema.partial().parse(req.body)));
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

// GET /api/auto-apply/readiness — can autopilot fill a form with what it knows about the user?
autoApplyRouter.get("/readiness", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { profile } = await defaultAutoApplier.resolveApplicantProfile("", undefined, undefined, { skipPdf: true });
    const missing: string[] = [];
    if (!profile.firstName || profile.firstName === "Candidate") missing.push("name");
    if (!profile.email) missing.push("email");
    if (!profile.phone) missing.push("phone");
    const pdf = getUploadedResume();
    res.json({
      profile: { fullName: profile.fullName === "Candidate" ? "" : profile.fullName, email: profile.email, phone: profile.phone, linkedinUrl: profile.linkedinUrl, location: profile.location },
      needsCity: !profile.location.includes(","),
      missing,
      resumePdf: pdf ? { size: pdf.size, updatedAt: pdf.updatedAt } : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auto-apply/resume-pdf — raw application/pdf body
autoApplyRouter.post(
  "/resume-pdf",
  express.raw({ type: "application/pdf", limit: "15mb" }),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Send the PDF as the raw request body with Content-Type: application/pdf" });
        return;
      }
      saveUploadedResume(req.body);
      res.json({ ok: true, size: req.body.length });
    } catch (err) {
      next(err);
    }
  }
);

autoApplyRouter.delete("/resume-pdf", (_req: Request, res: Response) => {
  deleteUploadedResume();
  res.json({ ok: true });
});

// POST /api/auto-apply/linkedin/connect — opens a window to sign in to LinkedIn once
autoApplyRouter.post("/linkedin/connect", (_req: Request, res: Response) => {
  if (isConnectingLinkedIn()) {
    res.json({ started: false, message: "A LinkedIn sign-in window is already open." });
    return;
  }
  void connectLinkedIn().then((ok) =>
    console.log(`[AutoApply] LinkedIn connect ${ok ? "succeeded" : "ended without login"}`)
  );
  res.json({ started: true });
});

autoApplyRouter.get("/linkedin/status", (_req: Request, res: Response) => {
  res.json({ connecting: isConnectingLinkedIn() });
});
