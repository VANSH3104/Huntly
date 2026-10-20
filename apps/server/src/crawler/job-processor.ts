import { getDatabase, jobs, jobSkills, jobMatches, jobSnapshots, companies, sources, crawlEvents } from "@huntly/database";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { ExtractedJob } from "./extractor.js";
import { computeContentHash } from "./extractor.js";
import { normalizeJobTitle, SkillNormalizer, extractDomain } from "../utils/normalize.js";
import { JobMatcher } from "../services/job-matcher.js";

const skillNormalizer = new SkillNormalizer();
const matcher = new JobMatcher();

interface DeduplicationResult {
  action: "created" | "updated" | "duplicate" | "closed";
  jobId?: string;
}

export async function processExtractedJob(
  extracted: ExtractedJob,
  companyId: string,
  sourceId: string | undefined,
  crawlRunId: string,
  resumeId?: string
): Promise<DeduplicationResult> {
  const db = getDatabase();
  const hash = computeContentHash(extracted);

  // 1. Check exact duplicate by (companyId + externalJobId)
  if (extracted.externalJobId) {
    const [existing] = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.externalJobId, extracted.externalJobId)
        )
      )
      .limit(1);

    if (existing) {
      // Update if content changed
      if (existing.contentHash !== hash) {
        // Save snapshot
        await db.insert(jobSnapshots).values({
          id: uuidv4(),
          jobId: existing.id,
          contentHash: existing.contentHash,
          snapshotData: JSON.stringify(existing),
        });

        await db
          .update(jobs)
          .set({
            description: extracted.description,
            contentHash: hash,
            lastVerifiedAt: new Date(),
            status: "active",
          })
          .where(eq(jobs.id, existing.id));

        await logEvent(crawlRunId, "job_updated", `Updated job: ${extracted.title}`, "info", undefined, existing.id);
        return { action: "updated", jobId: existing.id };
      } else {
        // Just refresh verification time
        await db
          .update(jobs)
          .set({ lastVerifiedAt: new Date(), status: "active" })
          .where(eq(jobs.id, existing.id));
        return { action: "duplicate", jobId: existing.id };
      }
    }
  }

  // 2. Check URL duplicate
  const canonicalUrl = extracted.applyUrl;
  const [existingByUrl] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.applyUrl, canonicalUrl))
    .limit(1);

  if (existingByUrl) {
    await db.update(jobs).set({ lastVerifiedAt: new Date() }).where(eq(jobs.id, existingByUrl.id));
    return { action: "duplicate", jobId: existingByUrl.id };
  }

  // 3. Create new job
  const jobId = uuidv4();
  const normalizedTitle = normalizeJobTitle(extracted.title);

  await db.insert(jobs).values({
    id: jobId,
    companyId,
    sourceId,
    title: extracted.title,
    normalizedTitle,
    description: extracted.description,
    responsibilities: JSON.stringify(extracted.responsibilities ?? []),
    requirements: JSON.stringify(extracted.requirements ?? []),
    preferredQualifications: "[]",
    skills: JSON.stringify(extracted.skills ?? []),
    locationJson: JSON.stringify(extracted.location),
    employmentType: extracted.employmentType,
    salaryJson: extracted.salary ? JSON.stringify(extracted.salary) : null,
    postedAt: extracted.postedAt,
    expiresAt: extracted.expiresAt,
    sourceUrl: extracted.sourceUrl,
    applyUrl: extracted.applyUrl,
    sourceType: "company",
    externalJobId: extracted.externalJobId,
    contentHash: hash,
    status: "active",
    firstSeenAt: new Date(),
    lastVerifiedAt: new Date(),
  });

  // Insert skills
  const skills = extractSkillsFromText(extracted.description + " " + (extracted.skills?.join(" ") ?? ""));
  for (const { raw, canonical } of skillNormalizer.normalizeAll(skills)) {
    await db.insert(jobSkills).values({
      id: uuidv4(),
      jobId,
      skill: raw,
      canonical,
      isRequired: true,
    });
  }

  // Compute match if we have a resume
  if (resumeId) {
    await matcher.computeAndStore(jobId, resumeId);
  }

  await logEvent(crawlRunId, "job_created", `New job: ${extracted.title}`, "info", extracted.sourceUrl, jobId);

  return { action: "created", jobId };
}

export async function markJobClosed(jobId: string, crawlRunId: string): Promise<void> {
  const db = getDatabase();
  await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, jobId));
  await logEvent(crawlRunId, "job_closed", `Job closed`, "info", undefined, jobId);
}

async function logEvent(
  crawlRunId: string,
  type: string,
  message: string,
  severity: "info" | "warn" | "error",
  url?: string,
  jobId?: string
): Promise<void> {
  try {
    const db = getDatabase();
    await db.insert(crawlEvents).values({
      id: uuidv4(),
      crawlRunId,
      type,
      message,
      severity,
      url,
      jobId,
    });
  } catch (_e) {
    // Non-fatal: event logging should never block job insertion
  }
}

function extractSkillsFromText(text: string): string[] {
  const techPattern = /\b(React(?:\.js)?|Vue(?:\.js)?|Angular|Next\.js|TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Node(?:\.js)?|Express|PostgreSQL|MySQL|MongoDB|Redis|Docker|Kubernetes|AWS|GCP|Azure|Git|Linux|GraphQL|REST|Spring(?:\s*Boot)?|Django|Flask|FastAPI|TensorFlow|PyTorch|Pandas|NumPy|HTML|CSS|Tailwind|Sass|Kotlin|Swift|Dart|Flutter|React\s*Native|Elasticsearch)\b/gi;
  const matches = [...text.matchAll(techPattern)];
  return [...new Set(matches.map(m => m[0]))];
}
