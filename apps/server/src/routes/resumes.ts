import { Router } from "express";
import { getDatabase, resumes, resumeSkills } from "@agentforge/database";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { ResumeParser } from "../services/resume-parser.js";
import { SkillNormalizer } from "../utils/normalize.js";
import { latexCompiler } from "../services/latex-compiler.js";

export const resumesRouter = Router();

// GET /api/resumes
resumesRouter.get("/", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const result = await db
      .select()
      .from(resumes)
      .orderBy(desc(resumes.createdAt));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/resumes/active
resumesRouter.get("/active", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const [resume] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.isActive, true))
      .limit(1);
    if (!resume) return res.json(null);

    const skills = await db
      .select()
      .from(resumeSkills)
      .where(eq(resumeSkills.resumeId, resume.id));

    res.json({
      ...resume,
      parsed: resume.parsedJson ? JSON.parse(resume.parsedJson) : null,
      skills,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/resumes (upload)
resumesRouter.post("/", async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1),
      latex: z.string().min(10),
      setActive: z.boolean().default(true),
    });
    const { name, latex, setActive } = schema.parse(req.body);

    const db = getDatabase();
    const hash = crypto.createHash("sha256").update(latex).digest("hex");

    // Parse resume
    const parser = new ResumeParser();
    const parsed = await parser.parse(latex);

    const id = uuidv4();

    // Deactivate previous if setActive
    if (setActive) {
      await db.update(resumes).set({ isActive: false });
    }

    await db.insert(resumes).values({
      id,
      name,
      latex,
      parsedJson: JSON.stringify(parsed),
      hash,
      isActive: setActive,
    });

    // Insert skills
    const normalizer = new SkillNormalizer();
    const canonicalSkills = normalizer.normalizeAll(parsed.skills ?? []);
    for (const { raw, canonical } of canonicalSkills) {
      await db.insert(resumeSkills).values({
        id: uuidv4(),
        resumeId: id,
        skill: raw,
        canonical,
      });
    }

    res.json({ id, name, hash, parsed, isActive: setActive });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/resumes/:id (rename and/or replace the LaTeX source in place)
resumesRouter.patch("/:id", async (req, res, next) => {
  try {
    const schema = z
      .object({
        name: z.string().trim().min(1).optional(),
        latex: z.string().min(10).optional(),
      })
      .refine((v) => v.name !== undefined || v.latex !== undefined, { message: "Nothing to update" });
    const { name, latex } = schema.parse(req.body);
    const id = req.params["id"]!;

    const db = getDatabase();
    const [existing] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Resume not found" });

    const patch: Partial<typeof resumes.$inferInsert> = {};
    if (name !== undefined) patch.name = name;

    let parsed = existing.parsedJson ? JSON.parse(existing.parsedJson) : null;
    if (latex !== undefined && latex !== existing.latex) {
      parsed = await new ResumeParser().parse(latex);
      patch.latex = latex;
      patch.parsedJson = JSON.stringify(parsed);
      patch.hash = crypto.createHash("sha256").update(latex).digest("hex");

      await db.delete(resumeSkills).where(eq(resumeSkills.resumeId, id));
      const canonicalSkills = new SkillNormalizer().normalizeAll(parsed.skills ?? []);
      for (const { raw, canonical } of canonicalSkills) {
        await db.insert(resumeSkills).values({ id: uuidv4(), resumeId: id, skill: raw, canonical });
      }
    }

    if (Object.keys(patch).length > 0) {
      await db.update(resumes).set(patch).where(eq(resumes.id, id));
    }

    const [updated] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/resumes/:id
resumesRouter.delete("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    await db.delete(resumes).where(eq(resumes.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/resumes/:id/activate
resumesRouter.post("/:id/activate", async (req, res, next) => {
  try {
    const db = getDatabase();
    await db.update(resumes).set({ isActive: false });
    await db.update(resumes).set({ isActive: true }).where(eq(resumes.id, req.params["id"]!));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/resumes/download-active — compile active resume in memory and stream download to browser
resumesRouter.get("/download-active", async (_req, res, next) => {
  try {
    const db = getDatabase();
    const [active] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
    if (!active) return res.status(400).json({ error: "No active resume found to download" });

    let candidateName = "candidate";
    if (active.parsedJson) {
      try {
        const parsed = JSON.parse(active.parsedJson);
        if (parsed.name) {
          const first = parsed.name.trim().split(/\s+/)[0]?.toLowerCase();
          if (first && /^[a-z]+$/.test(first)) candidateName = first;
        }
      } catch {}
    }

    const filename = `${candidateName}_master_resume.pdf`;
    const result = await latexCompiler.compile(active.latex, filename);

    if (!result.success || !result.pdfBuffer) {
      return res.status(500).json({ error: result.error || "Compilation failed" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.pdfBuffer);
  } catch (err) {
    next(err);
  }
});

// POST /api/resumes/compile — compile resume in-memory and return base64
resumesRouter.post("/compile", async (req, res, next) => {
  try {
    const schema = z.object({
      latex: z.string().optional(),
      resumeId: z.string().optional(),
      filename: z.string().optional(),
    });
    const { latex, resumeId, filename } = schema.parse(req.body);

    const db = getDatabase();
    let sourceLatex = latex;
    let candidateName = "candidate";

    if (!sourceLatex) {
      let targetId = resumeId;
      if (!targetId) {
        const [active] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
        if (!active) return res.status(400).json({ error: "No active resume found to compile" });
        sourceLatex = active.latex;
        if (active.parsedJson) {
          try {
            const parsed = JSON.parse(active.parsedJson);
            if (parsed.name) {
              const first = parsed.name.trim().split(/\s+/)[0]?.toLowerCase();
              if (first && /^[a-z]+$/.test(first)) candidateName = first;
            }
          } catch {}
        }
      } else {
        const [target] = await db.select().from(resumes).where(eq(resumes.id, targetId)).limit(1);
        if (!target) return res.status(404).json({ error: "Resume not found" });
        sourceLatex = target.latex;
      }
    }

    const outputName = filename || `${candidateName}_master_resume.pdf`;
    const result = await latexCompiler.compile(sourceLatex!, outputName);

    res.json({
      success: result.success,
      filename: result.filename,
      pdfBase64: result.pdfBase64,
      error: result.error,
      log: result.log,
    });
  } catch (err) {
    next(err);
  }
});
