import { Router } from "express";
import { getDatabase, resumes, resumeSkills } from "@agentforge/database";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";
import { ResumeParser } from "../services/resume-parser.js";
import { SkillNormalizer } from "../utils/normalize.js";

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
