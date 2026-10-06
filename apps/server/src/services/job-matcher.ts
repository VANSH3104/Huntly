import { getDatabase, jobs, resumes, resumeSkills, jobMatches } from "@agentforge/database";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_MATCH_WEIGHTS, FRESHNESS_THRESHOLDS, SOURCE_AUTHORITY } from "@agentforge/shared";

export class JobMatcher {
  private weights = { ...DEFAULT_MATCH_WEIGHTS };

  setWeights(weights: Partial<typeof DEFAULT_MATCH_WEIGHTS>): void {
    this.weights = { ...this.weights, ...weights };
  }

  async computeAndStore(jobId: string, resumeId: string): Promise<void> {
    const db = getDatabase();

    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return;

    const [resume] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (!resume) return;

    const resumeSkillRows = await db
      .select()
      .from(resumeSkills)
      .where(eq(resumeSkills.resumeId, resumeId));

    const resumeSkillSet = new Set(resumeSkillRows.map(s => s.canonical.toLowerCase()));

    // Parse job skills
    let jobSkillList: string[] = [];
    try { jobSkillList = JSON.parse(job.skills) as string[]; } catch {}

    const breakdown = {
      skill: this.computeSkillScore(jobSkillList, resumeSkillSet),
      role: this.computeRoleScore(job.normalizedTitle, resume.parsedJson),
      experience: this.computeExperienceScore(job.experienceLevel),
      location: this.computeLocationScore(job.locationJson),
      freshness: this.computeFreshnessScore(job.postedAt),
      source: this.computeSourceScore(job.sourceType),
      company: 0.5, // Default — modified by company preferences
    };

    const overall =
      breakdown.skill * (this.weights.skill + this.weights.technology) +
      breakdown.role * this.weights.role +
      breakdown.experience * this.weights.experience +
      breakdown.location * this.weights.location +
      breakdown.freshness * this.weights.freshness +
      breakdown.source * this.weights.source +
      breakdown.company * this.weights.company;

    // Upsert
    const [existing] = await db
      .select()
      .from(jobMatches)
      .where(and(eq(jobMatches.jobId, jobId), eq(jobMatches.resumeId, resumeId)))
      .limit(1);

    if (existing) {
      await db
        .update(jobMatches)
        .set({
          overallScore: overall * 100,
          skillScore: breakdown.skill * 100,
          roleScore: breakdown.role * 100,
          experienceScore: breakdown.experience * 100,
          locationScore: breakdown.location * 100,
          freshnessScore: breakdown.freshness * 100,
          sourceScore: breakdown.source * 100,
          companyScore: breakdown.company,
          computedAt: new Date(),
        })
        .where(eq(jobMatches.id, existing.id));
    } else {
      await db.insert(jobMatches).values({
        id: uuidv4(),
        jobId,
        resumeId,
        overallScore: overall * 100,
        skillScore: breakdown.skill * 100,
        roleScore: breakdown.role * 100,
        experienceScore: breakdown.experience * 100,
        locationScore: breakdown.location * 100,
        freshnessScore: breakdown.freshness * 100,
        sourceScore: breakdown.source * 100,
        companyScore: breakdown.company,
        breakdownJson: JSON.stringify(breakdown),
      });
    }
  }

  // ─── Scoring Functions ─────────────────────────────────────────

  private computeSkillScore(jobSkills: string[], resumeSkills: Set<string>): number {
    if (jobSkills.length === 0) return 0.5;

    let matched = 0;
    for (const skill of jobSkills) {
      if (resumeSkills.has(skill.toLowerCase())) matched++;
    }

    return Math.min(matched / Math.max(jobSkills.length * 0.6, 1), 1);
  }

  private computeRoleScore(normalizedTitle: string, parsedJson: string | null): number {
    const title = normalizedTitle.toLowerCase();

    // Internship keywords
    if (title.includes("intern")) {
      return 1.0;
    }
    if (title.includes("entry") || title.includes("junior") || title.includes("associate") || title.includes("i ") || / i$/.test(title)) {
      return 0.9;
    }
    if (title.includes("software engineer") || title.includes("swe") || title.includes("sde")) {
      return 0.8;
    }
    if (title.includes("backend") || title.includes("frontend") || title.includes("full stack")) {
      return 0.75;
    }

    return 0.5;
  }

  private computeExperienceScore(experienceLevel: string | null): number {
    switch (experienceLevel) {
      case "INTERNSHIP": return 1.0;
      case "ENTRY": return 0.95;
      case "MID": return 0.4;
      case "SENIOR": return 0.1;
      case "EXECUTIVE": return 0.0;
      default: return 0.7; // Unknown — give benefit of doubt
    }
  }

  private computeLocationScore(locationJson: string | null): number {
    if (!locationJson) return 0.5;

    try {
      const loc = JSON.parse(locationJson) as { country?: string; city?: string; remote?: boolean };

      if (loc.remote) return 1.0;
      if (loc.country?.toLowerCase() === "india") return 1.0;
      if (!loc.country) return 0.6; // Unknown
      return 0.1; // Other country
    } catch {
      return 0.5;
    }
  }

  private computeFreshnessScore(postedAt: Date | null | number): number {
    if (!postedAt) return 0.5;

    const date = postedAt instanceof Date ? postedAt : new Date(postedAt as number);
    const daysSince = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);

    for (const threshold of FRESHNESS_THRESHOLDS) {
      if (daysSince <= threshold.maxDays) {
        return threshold.score / 100;
      }
    }

    return 0.1;
  }

  private computeSourceScore(sourceType: string): number {
    return (SOURCE_AUTHORITY[sourceType] ?? 50) / 100;
  }
}
