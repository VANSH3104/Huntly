import { getDatabase, applications, applyQueue, jobs } from "@huntly/database";
import { eq, ne, or } from "drizzle-orm";

export interface JobIdentity {
  id: string;
  applyUrl: string;
  companyId: string;
  normalizedTitle: string;
}

const normUrl = (url: string): string => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, "");
  } catch {
    return url.toLowerCase();
  }
};

/**
 * Everything the user has already applied to, indexed so a job is recognised as a
 * duplicate by id, by apply URL, or by company + title (the same posting re-crawled).
 */
export class AppliedIndex {
  private ids = new Map<string, string>();
  private urls = new Map<string, string>();
  private titles = new Map<string, string>();

  static async load(): Promise<AppliedIndex> {
    const db = getDatabase();
    const index = new AppliedIndex();

    const board = await db
      .select({ job: jobs, status: applications.status })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .where(ne(applications.status, "saved"));
    for (const row of board) index.add(row.job, `on your board as "${row.status}"`);

    const sent = await db
      .select({ job: jobs })
      .from(applyQueue)
      .innerJoin(jobs, eq(applyQueue.jobId, jobs.id))
      .where(or(eq(applyQueue.status, "submitted")));
    for (const row of sent) index.add(row.job, "already submitted by auto-apply");

    return index;
  }

  private add(job: JobIdentity, reason: string) {
    this.ids.set(job.id, reason);
    if (job.applyUrl) this.urls.set(normUrl(job.applyUrl), reason);
    this.titles.set(`${job.companyId}|${job.normalizedTitle}`, reason);
  }

  /** Returns why this job counts as already applied, or null when it is new. */
  check(job: JobIdentity): string | null {
    return (
      this.ids.get(job.id) ??
      (job.applyUrl ? this.urls.get(normUrl(job.applyUrl)) : undefined) ??
      this.titles.get(`${job.companyId}|${job.normalizedTitle}`) ??
      null
    );
  }

  /** Record a fresh submission so later checks in the same run see it. */
  markApplied(job: JobIdentity) {
    this.add(job, "already submitted by auto-apply");
  }
}
