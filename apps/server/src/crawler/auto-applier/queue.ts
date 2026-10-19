import { v4 as uuidv4 } from "uuid";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDatabase, applyQueue, applications, companies, jobs } from "@agentforge/database";
import { defaultAutoApplier } from "./engine.js";
import { AppliedIndex } from "./applied-index.js";
import { getAutoApplyConfig } from "./config.js";
import type { AutoApplyResult } from "./types.js";

export type QueueStatus =
  | "queued"
  | "running"
  | "open"
  | "needs_review"
  | "needs_login"
  | "skipped"
  | "submitted"
  | "failed";

const BLOCKED: QueueStatus[] = ["needs_review", "needs_login", "skipped", "failed"];

const MAX_AUTO_ATTEMPTS = 2;

export interface EnqueueSkip {
  jobId: string;
  reason: string;
}

export interface EnqueueOutcome {
  queued: string[];
  skipped: EnqueueSkip[];
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * SQLite-backed auto-apply queue. One row per job (UNIQUE job_id), so a job can never be queued twice,
 * and a submitted job is never queued again. A single worker drains it sequentially.
 */
export class AutoApplyQueue {
  private draining = false;
  private paused = false;

  /** Re-queue anything left "running" by a crash and resume draining. */
  public async recover() {
    const db = getDatabase();
    await db.update(applyQueue).set({ status: "queued", updatedAt: new Date() }).where(eq(applyQueue.status, "running"));
    // Tabs do not survive a server restart. Park them so the user can reopen them on purpose.
    await db
      .update(applyQueue)
      .set({ status: "needs_review", reason: "The browser tab was closed when the server restarted. Re-run to reopen it.", updatedAt: new Date() })
      .where(eq(applyQueue.status, "open"));
    defaultAutoApplier.events.on("tab", (e: { jobId: string; outcome: "submitted" | "closed"; applicationId?: string }) => {
      void this.onTabEvent(e).catch((err) => console.error("[AutoApplyQueue] Tab event failed:", err));
    });
    this.kick();
  }

  public isPaused() {
    return this.paused;
  }

  public pause() {
    this.paused = true;
  }

  public resume() {
    this.paused = false;
    this.kick();
  }

  /**
   * Decides which of the given jobs may be queued. Used by both preview and enqueue.
   */
  public async classify(jobIds: string[]): Promise<{ fresh: string[]; skipped: EnqueueSkip[] }> {
    const db = getDatabase();
    const unique = [...new Set(jobIds)];
    if (unique.length === 0) return { fresh: [], skipped: [] };

    const rows = await db.select().from(jobs).where(inArray(jobs.id, unique));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const queued = await db.select().from(applyQueue).where(inArray(applyQueue.jobId, unique));
    const queueById = new Map(queued.map((q) => [q.jobId, q]));
    const index = await AppliedIndex.load();

    const fresh: string[] = [];
    const skipped: EnqueueSkip[] = [];
    for (const id of unique) {
      const job = byId.get(id);
      if (!job) {
        skipped.push({ jobId: id, reason: "Job not found" });
        continue;
      }
      if (job.status === "closed") {
        skipped.push({ jobId: id, reason: "Job is closed" });
        continue;
      }
      const applied = index.check(job);
      if (applied) {
        skipped.push({ jobId: id, reason: `Duplicate or already applied (${applied})` });
        continue;
      }
      const existing = queueById.get(id);
      if (existing && ["queued", "running", "open", "needs_review"].includes(existing.status)) {
        skipped.push({ jobId: id, reason: `Already in the auto-apply queue (${existing.status})` });
        continue;
      }
      // Two selected rows that are the same posting (same URL / company+title): keep only the first.
      index.markApplied(job);
      fresh.push(id);
    }
    return { fresh, skipped };
  }

  public async enqueue(
    jobIds: string[],
    opts: { mode?: "tabs" | "review" | "auto_submit"; resumeId?: string; limit?: number } = {}
  ): Promise<EnqueueOutcome> {
    const config = await getAutoApplyConfig();
    const { fresh, skipped } = await this.classify(jobIds);
    const limit = opts.limit ?? config.maxPerRun;
    const accepted = fresh.slice(0, limit);
    for (const id of fresh.slice(limit)) skipped.push({ jobId: id, reason: `Over the per-run limit of ${limit}` });

    const db = getDatabase();
    const mode = opts.mode ?? config.mode;
    for (const jobId of accepted) {
      await db
        .insert(applyQueue)
        .values({ id: uuidv4(), jobId, status: "queued", mode, resumeId: opts.resumeId ?? null })
        .onConflictDoUpdate({
          target: applyQueue.jobId,
          set: {
            status: "queued",
            mode,
            resumeId: opts.resumeId ?? null,
            reason: null,
            unfilledJson: "[]",
            attempts: 0,
            finishedAt: null,
            updatedAt: new Date(),
          },
        });
    }
    this.kick();
    return { queued: accepted, skipped };
  }

  /** Re-run one item. With force, submits even if required fields are still empty. */
  public async retry(id: string, opts: { force?: boolean; signIn?: boolean } = {}) {
    const db = getDatabase();
    await db
      .update(applyQueue)
      .set({
        status: "queued",
        mode: opts.force ? "auto_submit" : (await getAutoApplyConfig()).mode,
        // the worker reads this token: "force" submits with gaps, "signin" opens a visible browser and waits
        reason: opts.signIn ? "signin" : opts.force ? "force" : null,
        attempts: 0,
        // a sign-in run goes to the front so the user does not wait behind the whole queue
        ...(opts.signIn ? { queuedAt: new Date(0) } : {}),
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(applyQueue.id, id), inArray(applyQueue.status, BLOCKED)));
    this.kick();
  }

  /** Put every item in the given states back in the queue (used for "re-run all skipped"). */
  public async rerun(statuses: QueueStatus[]) {
    const db = getDatabase();
    const allowed = statuses.filter((s) => BLOCKED.includes(s));
    if (allowed.length === 0) return;
    await db
      .update(applyQueue)
      .set({ status: "queued", mode: (await getAutoApplyConfig()).mode, reason: null, attempts: 0, queuedAt: new Date(), finishedAt: null, updatedAt: new Date() })
      .where(inArray(applyQueue.status, allowed));
    this.kick();
  }

  /** The user applied manually. Put it on the board and stop tracking it as pending. */
  public async markApplied(id: string) {
    const db = getDatabase();
    const [row] = await db.select().from(applyQueue).where(eq(applyQueue.id, id)).limit(1);
    if (!row) return;
    await defaultAutoApplier.closeTab(row.jobId);
    const [existing] = await db.select({ id: applications.id }).from(applications).where(eq(applications.jobId, row.jobId)).limit(1);
    const notes = "Marked as applied manually after auto-apply review.";
    if (existing) {
      await db.update(applications).set({ status: "applied", appliedAt: new Date(), notes, updatedAt: new Date() }).where(eq(applications.id, existing.id));
    } else {
      await db.insert(applications).values({ id: uuidv4(), jobId: row.jobId, status: "applied", appliedAt: new Date(), notes });
    }
    await db.update(applyQueue).set({ status: "submitted", reason: "Marked applied manually", finishedAt: new Date(), updatedAt: new Date() }).where(eq(applyQueue.id, id));
  }

  public async remove(id: string) {
    const db = getDatabase();
    const [row] = await db.select().from(applyQueue).where(eq(applyQueue.id, id)).limit(1);
    if (row?.status === "open") await defaultAutoApplier.closeTab(row.jobId);
    await db.delete(applyQueue).where(and(eq(applyQueue.id, id), inArray(applyQueue.status, ["queued", "open", ...BLOCKED])));
  }

  public async focus(id: string) {
    const db = getDatabase();
    const [row] = await db.select().from(applyQueue).where(eq(applyQueue.id, id)).limit(1);
    return row ? defaultAutoApplier.focusTab(row.jobId) : false;
  }

  /** The user submitted (or closed) a tab we left open. */
  private async onTabEvent(e: { jobId: string; outcome: "submitted" | "closed" }) {
    const db = getDatabase();
    if (e.outcome === "submitted") {
      await db
        .update(applyQueue)
        .set({ status: "submitted", reason: null, finishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(applyQueue.jobId, e.jobId), eq(applyQueue.status, "open")));
    } else {
      await db
        .update(applyQueue)
        .set({ status: "needs_review", reason: "You closed the tab before submitting.", finishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(applyQueue.jobId, e.jobId), eq(applyQueue.status, "open")));
    }
    // a tab slot is free again
    this.kick();
  }

  public async clearFinished() {
    const db = getDatabase();
    await db.delete(applyQueue).where(inArray(applyQueue.status, ["failed"]));
  }

  public async cancelQueued() {
    const db = getDatabase();
    await db.delete(applyQueue).where(eq(applyQueue.status, "queued"));
  }

  public async list() {
    const db = getDatabase();
    const rows = await db
      .select({ q: applyQueue, job: jobs, company: companies })
      .from(applyQueue)
      .innerJoin(jobs, eq(applyQueue.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(desc(applyQueue.updatedAt))
      .limit(300);

    const items = rows.map(({ q, job, company }) => ({
      id: q.id,
      jobId: q.jobId,
      title: job.title,
      company: company?.name ?? "Company",
      applyUrl: job.applyUrl,
      status: q.status as QueueStatus,
      mode: q.mode,
      attempts: q.attempts,
      ats: q.ats,
      reason: q.reason,
      screenshot: q.screenshot,
      unfilled: safeJson<string[]>(q.unfilledJson, []),
      logs: safeJson<string[]>(q.logsJson, []),
      queuedAt: q.queuedAt,
      finishedAt: q.finishedAt,
    }));

    const stats = { queued: 0, running: 0, open: 0, needs_review: 0, needs_login: 0, skipped: 0, submitted: 0, failed: 0 } as Record<QueueStatus, number>;
    for (const it of items) stats[it.status]++;

    const config = await getAutoApplyConfig();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(applyQueue)
      .where(and(eq(applyQueue.status, "submitted"), gte(applyQueue.finishedAt, startOfToday())));

    return { items, stats, paused: this.paused, config, submittedToday: Number(n) };
  }

  public kick() {
    if (this.draining) return;
    this.draining = true;
    void this.drain()
      .catch((err) => console.error("[AutoApplyQueue] Worker error, will retry on the next kick:", err))
      .finally(() => {
        this.draining = false;
      });
  }

  private async drain() {
    const db = getDatabase();
    while (!this.paused) {
      const config = await getAutoApplyConfig();
      if ((await this.submittedToday()) >= config.dailyCap) {
        console.log(`[AutoApplyQueue] Daily cap of ${config.dailyCap} reached, pausing until tomorrow.`);
        this.paused = true;
        return;
      }

      // In tabs mode, wait for the user to deal with some open tabs before opening more.
      const [{ open }] = await db
        .select({ open: sql<number>`count(*)` })
        .from(applyQueue)
        .where(eq(applyQueue.status, "open"));
      if (config.mode === "tabs" && Number(open) >= config.tabBatch) return;

      const [next] = await db
        .select()
        .from(applyQueue)
        .where(eq(applyQueue.status, "queued"))
        .orderBy(asc(applyQueue.queuedAt))
        .limit(1);
      if (!next) return;

      const force = next.reason === "force";
      const signIn = next.reason === "signin";
      await db
        .update(applyQueue)
        .set({ status: "running", attempts: next.attempts + 1, startedAt: new Date(), updatedAt: new Date() })
        .where(eq(applyQueue.id, next.id));

      let result: AutoApplyResult;
      try {
        result = await defaultAutoApplier.executeAutoApply({
          jobId: next.jobId,
          resumeId: next.resumeId ?? undefined,
          mode: next.mode === "tabs" || next.mode === "review" ? next.mode : "auto_submit",
          forceSubmit: force,
          waitForLogin: signIn ? true : undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { jobId: next.jobId, title: "", company: "", url: "", atsType: "generic", status: "failed", fieldsFilled: [], logs: [], error: message };
      }

      await this.record(next.id, next.attempts + 1, result, signIn, config.onCaptcha === "wait");
      if (config.delayMs > 0 && !this.paused) await sleep(config.delayMs + Math.random() * 2000);
    }
  }

  private async record(id: string, attempts: number, r: AutoApplyResult, wasAssisted: boolean, retryCaptchaWithUser: boolean) {
    const db = getDatabase();
    // Transient failures get one automatic retry. Anything the page itself refused goes to review.
    let status: QueueStatus;
    switch (r.status) {
      case "submitted":
        status = "submitted";
        break;
      case "already_applied":
        await db.delete(applyQueue).where(eq(applyQueue.id, id));
        return;
      case "ready_for_review":
      case "needs_review":
        // A captcha needs a person. Re-run it once in a visible window where the user can solve it.
        if (r.status === "needs_review" && /captcha/i.test(r.reason ?? "") && retryCaptchaWithUser && !wasAssisted) {
          await db
            .update(applyQueue)
            .set({
              status: "queued",
              reason: "signin",
              screenshot: r.screenshotPath ? r.screenshotPath.split(/[\\/]/).pop() ?? null : null,
              logsJson: JSON.stringify(r.logs.slice(-60)),
              queuedAt: new Date(),
              finishedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(applyQueue.id, id));
          return;
        }
        status = "needs_review";
        break;
      case "awaiting_user":
        status = "open";
        break;
      case "needs_login":
        status = "needs_login";
        break;
      case "skipped":
        status = "skipped";
        break;
      default:
        status = attempts < MAX_AUTO_ATTEMPTS ? "queued" : "failed";
    }
    await db
      .update(applyQueue)
      .set({
        status,
        ats: r.atsType,
        reason: r.reason ?? r.error ?? null,
        screenshot: r.screenshotPath ? r.screenshotPath.split(/[\\/]/).pop() ?? null : null,
        fieldsJson: JSON.stringify(r.fieldsFilled.map((f) => ({ label: f.label, value: f.value.slice(0, 200), type: f.type }))),
        unfilledJson: JSON.stringify(r.unfilledFields ?? []),
        logsJson: JSON.stringify(r.logs.slice(-60)),
        finishedAt: status === "queued" || status === "open" ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applyQueue.id, id));
  }

  private async submittedToday(): Promise<number> {
    const db = getDatabase();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(applyQueue)
      .where(and(eq(applyQueue.status, "submitted"), gte(applyQueue.finishedAt, startOfToday())));
    return Number(n);
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const autoApplyQueue = new AutoApplyQueue();
