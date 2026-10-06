import { Router } from "express";
import { getDatabase, jobs, resumes, aiAnalyses, jobMatches, companies } from "@agentforge/database";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { GeminiClient } from "../services/gemini.js";

export const aiRouter = Router();

// POST /api/ai/analyze — analyze job against resume
aiRouter.post("/analyze", async (req, res, next) => {
  try {
    const schema = z.object({
      jobId: z.string(),
      resumeId: z.string().optional(),
      force: z.boolean().default(false),
    });
    let { jobId, resumeId, force } = schema.parse(req.body);

    const db = getDatabase();

    // Load job
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Load resume — fallback to active resume if not provided
    if (!resumeId) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (!activeResume) return res.status(400).json({ error: "No active resume found" });
      resumeId = activeResume.id;
    }

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    // Cache key
    const cacheKey = crypto
      .createHash("sha256")
      .update(`${job.contentHash}:${resume.hash}`)
      .digest("hex");

    // Check cache
    if (!force) {
      const [cached] = await db
        .select()
        .from(aiAnalyses)
        .where(eq(aiAnalyses.cacheKey, cacheKey))
        .limit(1);

      if (cached) {
        return res.json({
          ...cached,
          strongestMatches: safeParseJSON(cached.strongestMatches, []),
          missingRequirements: safeParseJSON(cached.missingRequirements, []),
          concerns: safeParseJSON(cached.concerns, []),
          relevantResumeSections: safeParseJSON(cached.relevantResumeSections, []),
          recommendedKeywords: safeParseJSON(cached.recommendedKeywords, []),
          resumeTailoringSuggestions: safeParseJSON(cached.resumeTailoringSuggestions, []),
        });
      }
    }

    // Call Gemini
    const gemini = new GeminiClient();
    const parsedResume = safeParseJSON(resume.parsedJson, { skills: [] });
    const analysis = (await gemini.analyzeJobMatch(job, parsedResume)) as Record<string, any>;

    // Save to DB
    const id = uuidv4();
    await db.insert(aiAnalyses).values({
      id,
      jobId: job.id,
      resumeId: resume.id,
      cacheKey,
      matchScore: analysis["matchScore"] ?? 75,
      summary: analysis["summary"] ?? "",
      strongestMatches: JSON.stringify(analysis["strongestMatches"] ?? []),
      missingRequirements: JSON.stringify(analysis["missingRequirements"] ?? []),
      concerns: JSON.stringify(analysis["concerns"] ?? []),
      relevantResumeSections: JSON.stringify(analysis["relevantResumeSections"] ?? []),
      recommendedKeywords: JSON.stringify(analysis["recommendedKeywords"] ?? []),
      applicationPriority: analysis["applicationPriority"] ?? "MEDIUM",
      resumeTailoringSuggestions: JSON.stringify(analysis["resumeTailoringSuggestions"] ?? []),
      rawResponse: JSON.stringify(analysis),
    });

    res.json({ id, ...analysis });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/tailor-resume
aiRouter.post("/tailor-resume", async (req, res, next) => {
  try {
    const schema = z.object({
      jobId: z.string(),
      resumeId: z.string().optional(),
    });
    let { jobId, resumeId } = schema.parse(req.body);

    const db = getDatabase();

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });

    if (!resumeId) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (!activeResume) return res.status(400).json({ error: "No active resume found" });
      resumeId = activeResume.id;
    }

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    // Get existing AI analysis if available
    const cacheKey = crypto
      .createHash("sha256")
      .update(`${job.contentHash}:${resume.hash}`)
      .digest("hex");

    const [analysis] = await db
      .select()
      .from(aiAnalyses)
      .where(eq(aiAnalyses.cacheKey, cacheKey))
      .limit(1);

    const gemini = new GeminiClient();
    const result = await gemini.tailorResume(
      resume.latex,
      job.description,
      job.title,
      analysis ? JSON.stringify(analysis) : ""
    );

    res.json({
      tailoredLaTeX: result.tailoredLatex,
      tailoredLatex: result.tailoredLatex,
      changes: result.changes,
      warnings: result.warnings,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/generate-cover-letter
aiRouter.post("/generate-cover-letter", async (req, res, next) => {
  try {
    const schema = z.object({
      jobId: z.string(),
      resumeId: z.string().optional(),
    });
    let { jobId, resumeId } = schema.parse(req.body);

    const db = getDatabase();

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return res.status(404).json({ error: "Job not found" });

    const [company] = await db.select().from(companies).where(eq(companies.id, job.companyId)).limit(1);

    if (!resumeId) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (!activeResume) return res.status(400).json({ error: "No active resume found" });
      resumeId = activeResume.id;
    }

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    const gemini = new GeminiClient();
    const parsedResume = safeParseJSON(resume.parsedJson, { skills: [] });
    const coverLetter = await gemini.generateCoverLetter(
      parsedResume,
      job,
      company?.name || "the hiring team"
    );

    res.json({ coverLetter });
  } catch (err) {
    next(err);
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}
