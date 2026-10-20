import { Router } from "express";
import { getDatabase, jobs, resumes, aiAnalyses, jobMatches, companies } from "@agentforge/database";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { GeminiClient } from "../services/gemini.js";
import { latexCompiler } from "../services/latex-compiler.js";
import { agentJobSearchService } from "../services/agent-job-search.js";

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

    // Look up company name
    let companyName = "company";
    if (job.companyId) {
      const [comp] = await db.select().from(companies).where(eq(companies.id, job.companyId)).limit(1);
      if (comp?.name) {
        companyName = comp.name;
      }
    }

    if (!resumeId) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (!activeResume) return res.status(400).json({ error: "No active resume found" });
      resumeId = activeResume.id;
    }

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) return res.status(404).json({ error: "Resume not found" });

    // Get candidate first name from parsed resume
    let candidateName = "candidate";
    if (resume.parsedJson) {
      try {
        const parsed = JSON.parse(resume.parsedJson);
        if (parsed.name) {
          const firstWord = parsed.name.trim().split(/\s+/)[0]?.toLowerCase();
          if (firstWord && /^[a-z]+$/.test(firstWord)) {
            candidateName = firstWord;
          }
        }
      } catch {}
    }

    // Format requested filename: e.g. candidate_company_resume.pdf
    const sanitizedCompany = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "company";
    const pdfFilename = `${candidateName}_${sanitizedCompany}_resume.pdf`;

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

    // Convert LaTeX into PDF in-memory
    const compileResult = await latexCompiler.compile(result.tailoredLatex, pdfFilename, resume.latex);

    res.json({
      tailoredLaTeX: result.tailoredLatex,
      tailoredLatex: result.tailoredLatex,
      changes: result.changes,
      warnings: result.warnings,
      pdfFilename: compileResult.filename,
      pdfBase64: compileResult.pdfBase64,
      compileSuccess: compileResult.success,
      compileError: compileResult.error,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/download-pdf — stream compiled PDF directly to browser without disk persistence
aiRouter.post("/download-pdf", async (req, res, next) => {
  try {
    const schema = z.object({
      latex: z.string().min(10),
      filename: z.string().default("candidate_resume.pdf"),
    });
    const { latex, filename } = schema.parse(req.body);
    const compileResult = await latexCompiler.compile(latex, filename);

    if (!compileResult.success || !compileResult.pdfBuffer) {
      return res.status(500).json({ error: compileResult.error || "Compilation failed" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${compileResult.filename}"`);
    res.send(compileResult.pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/compile-resume — direct compilation of LaTeX to PDF
aiRouter.post("/compile-resume", async (req, res, next) => {
  try {
    const schema = z.object({
      latex: z.string().min(10),
      jobId: z.string().optional(),
      filename: z.string().optional(),
    });
    const { latex, jobId, filename } = schema.parse(req.body);
    const db = getDatabase();

    let targetFilename = filename;
    if (!targetFilename) {
      let companyName = "company";
      if (jobId) {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
        if (job?.companyId) {
          const [comp] = await db.select().from(companies).where(eq(companies.id, job.companyId)).limit(1);
          if (comp?.name) companyName = comp.name;
        }
      }
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      let candidateName = "candidate";
      if (activeResume?.parsedJson) {
        try {
          const parsed = JSON.parse(activeResume.parsedJson);
          if (parsed.name) {
            const firstWord = parsed.name.trim().split(/\s+/)[0]?.toLowerCase();
            if (firstWord && /^[a-z]+$/.test(firstWord)) candidateName = firstWord;
          }
        } catch {}
      }
      const sanitizedCompany = companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "company";
      targetFilename = `${candidateName}_${sanitizedCompany}_resume.pdf`;
    }

    const compileResult = await latexCompiler.compile(latex, targetFilename);
    res.json(compileResult);
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

// POST /api/ai/expand-filters — expand user search keywords into intelligent multi-dimensional permutations
aiRouter.post("/expand-filters", async (req, res, next) => {
  try {
    const schema = z.object({
      role: z.string().optional(),
      keywords: z.string().optional(),
      location: z.string().optional(),
      skills: z.array(z.string()).optional(),
    });
    const { role, keywords, location, skills } = schema.parse(req.body);

    const db = getDatabase();
    let candidateSkills: string[] = skills || [];

    if (candidateSkills.length === 0) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (activeResume?.parsedJson) {
        const parsed = safeParseJSON<{ skills?: string[] }>(activeResume.parsedJson, {});
        if (Array.isArray(parsed.skills)) {
          candidateSkills = parsed.skills;
        }
      }
    }

    const gemini = new GeminiClient();
    const combinations = await gemini.generateSearchCombinations(
      role || "",
      keywords || "",
      location || "Remote",
      candidateSkills
    );

    res.json({ combinations });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/agent-search — deep agentic search with company reputation & market pay intelligence
aiRouter.post("/agent-search", async (req, res, next) => {
  try {
    const schema = z.object({
      query: z.string().min(1),
      resumeId: z.string().optional(),
      limit: z.number().optional(),
    });
    const { query, resumeId, limit } = schema.parse(req.body);

    const result = await agentJobSearchService.search({
      query,
      resumeId,
      limit,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/outreach-draft — generate high-converting cold outreach for Twitter/YC/HN
aiRouter.post("/outreach-draft", async (req, res, next) => {
  try {
    const schema = z.object({
      jobId: z.string().optional(),
      jobTitle: z.string().optional(),
      companyName: z.string().optional(),
      platform: z.string().optional().default("twitter"),
      jobDescription: z.string().optional(),
      founderHandle: z.string().optional(),
      contactEmail: z.string().optional(),
      resumeId: z.string().optional(),
    });
    const body = schema.parse(req.body);

    const db = getDatabase();

    let jobTitle = body.jobTitle || "Software Engineer";
    let companyName = body.companyName || "Tech Startup";
    let description = body.jobDescription || "";
    let platform = body.platform || "twitter";
    let founderHandle = body.founderHandle;
    let contactEmail = body.contactEmail;

    if (body.jobId) {
      const [job] = await db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1);
      if (job) {
        jobTitle = job.title;
        description = job.description;
        const [comp] = await db.select().from(companies).where(eq(companies.id, job.companyId)).limit(1);
        if (comp) companyName = comp.name;

        // Parse contact metadata from locationJson
        if (job.locationJson) {
          try {
            const loc = JSON.parse(job.locationJson);
            if (loc.founderHandle) founderHandle = loc.founderHandle;
            if (loc.contactEmail) contactEmail = loc.contactEmail;
            if (loc.platform) platform = loc.platform;
          } catch {}
        }
      }
    }

    // Load active resume for personalization
    let resumeId = body.resumeId;
    if (!resumeId) {
      const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      if (activeResume) resumeId = activeResume.id;
    }

    let candidateResumeText = "";
    let candidateSkills: string[] = [];

    if (resumeId) {
      const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
      if (resume) {
        candidateResumeText = resume.latex || "";
        try {
          const parsed = JSON.parse(resume.parsedJson || "{}");
          candidateSkills = parsed.skills?.technical || parsed.skills?.tools || [];
        } catch {}
      }
    }

    const gemini = new GeminiClient();
    const result = await gemini.generateColdOutreach({
      jobTitle,
      companyName,
      platform,
      jobDescription: description,
      founderHandle,
      contactEmail,
      candidateResumeText,
      candidateSkills,
    });

    res.json({
      success: true,
      companyName,
      jobTitle,
      platform,
      founderHandle,
      contactEmail,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

