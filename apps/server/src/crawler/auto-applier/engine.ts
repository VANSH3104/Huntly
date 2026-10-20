import { chromium, type Browser, type BrowserContext, type Page, type Frame, type Locator } from "playwright";
import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import {
  getDatabase,
  jobs,
  companies,
  resumes,
  settings,
  applications,
} from "@huntly/database";
import { detectATS } from "./ats-detector.js";
import { AppliedIndex } from "./applied-index.js";
import { getAutoApplyConfig } from "./config.js";
import { getUploadedResume } from "./resume-file.js";
import { browserSession } from "./browser-session.js";
import { EventEmitter } from "node:events";
import { GeminiClient } from "../../services/gemini.js";
import { formAnalyzer } from "./form-analyzer.js";
import { aiAnswerGenerator } from "./ai-answer-generator.js";
import { latexCompiler } from "../../services/latex-compiler.js";
import type {
  ATSSystemType,
  DetectedFormField,
  ApplicantProfile,
  AutoApplyOptions,
  AutoApplyResult,
  FieldFillRecord,
} from "./types.js";

export class AutoApplierEngine {
  private screenshotsDir: string;

  constructor() {
    this.screenshotsDir = path.join(os.tmpdir(), "agentforge-applications");
    if (!fsSync.existsSync(this.screenshotsDir)) {
      fsSync.mkdirSync(this.screenshotsDir, { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Builds the candidate profile from database settings & active resume.
   */
  public async resolveApplicantProfile(
    jobId: string,
    resumeId?: string,
    overrides?: Partial<ApplicantProfile>,
    opts: { skipPdf?: boolean } = {}
  ): Promise<{ profile: ApplicantProfile; resumePdfPath?: string; resumeContext: string }> {
    const db = getDatabase();

    // 1. Fetch settings profile
    const settingsRows = await db.select().from(settings);
    const settingsMap: Record<string, unknown> = {};
    for (const row of settingsRows) {
      try {
        settingsMap[row.key] = JSON.parse(row.value);
      } catch {
        settingsMap[row.key] = row.value;
      }
    }

    const savedProfile = (settingsMap["profile"] || {}) as Record<string, unknown>;
    const savedAutoApply = (settingsMap["autoApplyProfile"] || {}) as Record<string, unknown>;

    // 2. Fetch active resume or specified resume
    let targetResume = null;
    if (resumeId) {
      const [found] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
      targetResume = found;
    }
    if (!targetResume) {
      const [active] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
      targetResume = active;
    }

    let parsedResumeData: Record<string, any> = {};
    if (targetResume?.parsedJson) {
      try {
        parsedResumeData = JSON.parse(targetResume.parsedJson);
      } catch {
        // ignore
      }
    }

    const nameParts = String(
      overrides?.fullName ||
        savedAutoApply["fullName"] ||
        savedProfile["name"] ||
        parsedResumeData.basics?.name ||
        "Candidate"
    ).trim().split(" ");

    const firstName = overrides?.firstName || savedAutoApply["firstName"] || nameParts[0] || "";
    const lastName = overrides?.lastName || savedAutoApply["lastName"] || nameParts.slice(1).join(" ") || "";
    const fullName = overrides?.fullName || `${firstName} ${lastName}`.trim();
    const email = String(
      overrides?.email ||
        savedAutoApply["email"] ||
        savedProfile["email"] ||
        parsedResumeData.basics?.email ||
        ""
    ).trim();

    const phone = String(
      overrides?.phone ||
        savedAutoApply["phone"] ||
        parsedResumeData.basics?.phone ||
        ""
    ).trim();

    const location = String(
      overrides?.location ||
        savedAutoApply["location"] ||
        parsedResumeData.basics?.location?.city ||
        "India"
    ).trim();

    const linkedinUrl = String(
      overrides?.linkedinUrl ||
        savedAutoApply["linkedinUrl"] ||
        parsedResumeData.basics?.profiles?.find((p: any) => /linkedin/i.test(p.network || p.url))?.url ||
        ""
    ).trim();

    const githubUrl = String(
      overrides?.githubUrl ||
        savedAutoApply["githubUrl"] ||
        parsedResumeData.basics?.profiles?.find((p: any) => /github/i.test(p.network || p.url))?.url ||
        ""
    ).trim();

    const portfolioUrl = String(
      overrides?.portfolioUrl ||
        savedAutoApply["portfolioUrl"] ||
        parsedResumeData.basics?.website ||
        ""
    ).trim();

    const profile: ApplicantProfile = {
      firstName: String(firstName),
      lastName: String(lastName),
      fullName: String(fullName),
      email,
      phone,
      location,
      city: String(overrides?.city || savedAutoApply["city"] || location.split(",")[0] || ""),
      state: String(overrides?.state || savedAutoApply["state"] || ""),
      country: String(overrides?.country || savedAutoApply["country"] || "India"),
      linkedinUrl,
      githubUrl,
      portfolioUrl,
      websiteUrl: portfolioUrl,
      currentCompany: String(overrides?.currentCompany || savedAutoApply["currentCompany"] || parsedResumeData.work?.[0]?.company || ""),
      currentTitle: String(overrides?.currentTitle || savedAutoApply["currentTitle"] || parsedResumeData.work?.[0]?.position || "Software Engineer"),
      yearsOfExperience: Number(overrides?.yearsOfExperience || savedAutoApply["yearsOfExperience"] || 2),
      authorizedToWork: Boolean(overrides?.authorizedToWork ?? (savedAutoApply["authorizedToWork"] ?? true)),
      requireSponsorship: Boolean(overrides?.requireSponsorship ?? (savedAutoApply["requireSponsorship"] ?? false)),
      noticePeriodDays: Number(overrides?.noticePeriodDays || savedAutoApply["noticePeriodDays"] || 0),
      expectedSalary: String(overrides?.expectedSalary || savedAutoApply["expectedSalary"] || ""),
      gender: String(overrides?.gender || savedAutoApply["gender"] || "Decline to self-identify"),
      race: String(overrides?.race || savedAutoApply["race"] || "Decline to self-identify"),
      veteranStatus: String(overrides?.veteranStatus || savedAutoApply["veteranStatus"] || "I am not a protected veteran"),
      disabilityStatus: String(overrides?.disabilityStatus || savedAutoApply["disabilityStatus"] || "I do not have a disability"),
    };

    // 3. Prepare Resume PDF file
    let resumePdfPath: string | undefined = getUploadedResume()?.path;
    if (!resumePdfPath && !opts.skipPdf && targetResume?.latex) {
      try {
        const compileRes = await latexCompiler.compile(targetResume.latex, `resume_${targetResume.id}`);
        if (compileRes.success && compileRes.pdfBuffer) {
          const tempPdf = path.join(this.screenshotsDir, `resume_${targetResume.id}_${Date.now()}.pdf`);
          await fs.writeFile(tempPdf, compileRes.pdfBuffer);
          resumePdfPath = tempPdf;
        }
      } catch (err) {
        console.warn("[AutoApplier] Could not compile latex resume to PDF:", err);
      }
    }

    return { profile, resumePdfPath, resumeContext: summarizeResume(parsedResumeData, targetResume?.latex) };
  }

  private lock: Promise<void> = Promise.resolve();

  /** Emits {jobId, outcome, applicationId} when the user submits or closes a tab that was left open. */
  public readonly events = new EventEmitter();
  private tabs = new Map<string, Page>();

  public async focusTab(jobId: string): Promise<boolean> {
    const page = this.tabs.get(jobId);
    if (!page || page.isClosed()) return false;
    await page.bringToFront().catch(() => {});
    return true;
  }

  public async closeTab(jobId: string): Promise<void> {
    const page = this.tabs.get(jobId);
    this.tabs.delete(jobId);
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }

  /**
   * Watches a tab left open for the user. A confirmation page means they submitted, a closed tab means they gave up.
   */
  private watchTab(page: Page, jobId: string, resumeId: string | undefined, ats: string, fieldCount: number): void {
    this.tabs.set(jobId, page);
    const baseline = page.url();
    let done = false;
    let timer: NodeJS.Timeout | null = null;
    const finish = async (outcome: "submitted" | "closed") => {
      if (done) return;
      done = true;
      if (timer) clearInterval(timer);
      this.tabs.delete(jobId);
      let applicationId: string | undefined;
      if (outcome === "submitted") {
        applicationId = await this.recordApplication(jobId, resumeId, ats, fieldCount).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 4000));
        await page.close().catch(() => {});
      }
      this.events.emit("tab", { jobId, outcome, applicationId });
      browserSession.release();
    };
    page.on("close", () => void finish("closed"));
    timer = setInterval(async () => {
      if (done || page.isClosed()) return;
      try {
        const url = page.url();
        if (url !== baseline && SUCCESS_URL.test(url)) return void finish("submitted");
        for (const frame of page.frames()) {
          const text = await frame.evaluate(() => document.body?.innerText || "").catch(() => "");
          if (SUCCESS_TEXT.test(text)) return void finish("submitted");
        }
      } catch {
        // the page is navigating; check again on the next tick
      }
    }, 2500);
  }

  /**
   * Runs one application. Runs are serialized because they share one persistent browser profile.
   */
  public executeAutoApply(options: AutoApplyOptions): Promise<AutoApplyResult> {
    const run = this.lock.then(() => this.runApply(options));
    this.lock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  /**
   * Applies to a job. Only returns "submitted" after a confirmation signal is seen on the page.
   */
  private async runApply(options: AutoApplyOptions): Promise<AutoApplyResult> {
    const logs: string[] = [];
    const fieldsFilled: FieldFillRecord[] = [];
    const log = (msg: string) => {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logs.push(entry);
      console.log(`[AutoApplier] ${entry}`);
    };

    const db = getDatabase();
    const [jobRecord] = await db
      .select({ job: jobs, company: companies })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(jobs.id, options.jobId))
      .limit(1);

    if (!jobRecord?.job) throw new Error(`Job '${options.jobId}' not found in database`);

    const job = jobRecord.job;
    const companyName = jobRecord.company?.name || "Company";
    const targetUrl = resolveApplyUrl(job.applyUrl || job.sourceUrl);
    const base = { jobId: job.id, title: job.title, company: companyName, url: targetUrl, logs };

    const appliedIndex = await AppliedIndex.load();
    const duplicate = appliedIndex.check(job);
    if (duplicate) {
      log(`Skipped, ${duplicate}.`);
      return { ...base, atsType: "generic", status: "already_applied", fieldsFilled, reason: duplicate };
    }

    log(`Starting Auto-Apply for "${job.title}" at ${companyName}`);
    log(`Target URL: ${targetUrl}`);

    const config = await getAutoApplyConfig();
    const waitForLogin = options.waitForLogin ?? config.onLogin === "wait";
    // Signing in needs a window the user can see.
    const headless = options.mode === "tabs" || waitForLogin ? false : (options.headless ?? config.headless);
    const { profile, resumePdfPath, resumeContext } = await this.resolveApplicantProfile(
      job.id,
      options.resumeId,
      options.profileOverrides
    );
    log(`Applicant: ${profile.fullName} (${profile.email || "no email provided"})`);

    const fillCtx: FillContext = {
      profile,
      resumePdfPath,
      resumeContext,
      bestGuess: config.fillGaps || !!options.forceSubmit,
      jobTitle: job.title,
      companyName,
      jobDescription: job.description,
      log,
    };

    let liveCtx: BrowserContext | null = null;
    const opened = new Set<Page>();
    let handedOver: Page | null = null;
    const onPage = (p: Page) => opened.add(p);
    let atsType: ATSSystemType = "generic";
    let screenshotPath: string | undefined;
    let screenshotBase64: string | undefined;
    const snap = async (page: Page, prefix: string) => {
      const file = path.join(this.screenshotsDir, `${prefix}_${job.id}_${Date.now()}.png`);
      const buf = await page.screenshot({ fullPage: true }).catch(() => null);
      if (buf) {
        await fs.writeFile(file, buf);
        screenshotPath = file;
        screenshotBase64 = `data:image/png;base64,${buf.toString("base64")}`;
      }
    };
    const stop = (
      status: "needs_review" | "failed" | "skipped" | "needs_login",
      reason: string,
      unfilledFields?: string[]
    ): AutoApplyResult => {
      log(`Stopped: ${reason}`);
      return {
        ...base,
        atsType,
        status,
        reason,
        error: status === "failed" ? reason : undefined,
        unfilledFields,
        fieldsFilled,
        screenshotBase64,
        screenshotPath,
        logs,
      };
    };

    let signedInOnce = false;
    /** The page needs a login. Either wait for the user to sign in, or hand the job back as needs_login. */
    const walled = async (live: BrowserContext, page: Page, reason: string): Promise<AutoApplyResult> => {
      if (waitForLogin && !signedInOnce) {
        signedInOnce = true;
        log(`${reason} Waiting for you to sign in in the browser window (up to 5 minutes)...`);
        if (await this.waitForSignIn(live, page)) {
          log("Sign-in detected. Continuing.");
          throw new SignedInRetry();
        }
        return stop("needs_login", "Timed out waiting for you to sign in.");
      }
      return stop("needs_login", reason);
    };

    try {
      log(`Launching ${headless ? "headless" : "visible"} browser...`);
      const live = await browserSession.get(headless);
      liveCtx = live;
      live.on("page", onPage);
      const watchdog = setTimeout(
        () => {
          for (const p of opened) if (p !== handedOver) p.close().catch(() => {});
        },
        waitForLogin ? SIGN_IN_TIMEOUT_MS + JOB_TIMEOUT_MS : JOB_TIMEOUT_MS
      );

      try {
        const flow = async (): Promise<AutoApplyResult> => {
          let page = await browserSession.newPage(live);
          opened.add(page);

          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(async (err) => {
            if (/closed/i.test(String(err))) throw err;
            log("The page was slow to load, trying once more...");
            await page.goto(targetUrl, { waitUntil: "commit", timeout: 45000 });
            await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
          });
          await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
          await this.dismissOverlays(page, log);

          let scope: string | undefined;
          if (/linkedin\.com/i.test(page.url())) {
            const entry = await this.openLinkedInApply(live, page, log);
            if (entry.kind === "login") return await walled(live, page, entry.reason);
            if (entry.kind === "skipped") return stop("skipped", entry.reason);
            if (entry.kind === "applied") {
              const applicationId = await this.recordApplication(job.id, options.resumeId, "linkedin", 0);
              log("LinkedIn shows this job as already applied. Recorded on your board.");
              return { ...base, atsType, status: "already_applied", fieldsFilled, reason: "Already applied on LinkedIn", applicationId, logs };
            }
            page = entry.page;
            scope = entry.scope;
          }

          atsType = detectATS(page.url(), await page.content());
          log(`Detected ATS platform: [${atsType.toUpperCase()}]`);
          const wall = loginWallReason(page.url(), atsType);
          if (wall) return await walled(live, page, wall);

          if (!scope) {
            page = await this.revealApplicationForm(live, page, log);
            await this.dismissOverlays(page, log);
          }

          let submitSelector: string | null = null;
          let surface: Page | Frame = page;
          const unfilled = new Set<string>();
          let hops = 0;
          let lastSignature = "";

          for (let step = 1; step <= MAX_FORM_STEPS; step++) {
            surface = scope ? page : await formAnalyzer.findFormSurface(page);
            const fields = await formAnalyzer.analyzeForm(surface, scope);

            if (fields.length === 0) {
              if (hops < MAX_NAV_HOPS) {
                const moved = await this.agentNavigate(live, page, fillCtx);
                if (moved) {
                  page = moved;
                  hops++;
                  step--;
                  atsType = detectATS(page.url(), await page.content());
                  continue;
                }
              }
              if (step === 1) {
                return stop("needs_review", "No application form found (expired job, login wall, or unsupported page).");
              }
              break;
            }
            if (fields.some((f) => f.type === "password") && fields.length <= 4) {
              return await walled(live, page, "This site needs you to sign in.");
            }
            log(`Step ${step}: found ${fields.length} form controls.`);

            await this.fillStep(surface, scope, fields, fillCtx, fieldsFilled, unfilled);

            submitSelector = await formAnalyzer.findSubmitButtonSelector(surface, scope);
            if (submitSelector) break;

            const navRoot = scope ? page.locator(scope) : surface;
            const next = navRoot.getByRole("button", { name: /^(next|continue|review|save (and|&) continue)/i }).first();
            if (!(await next.isVisible().catch(() => false))) break;

            const signature = fields.map((f) => `${f.label}|${f.currentValue}`).join("~") + [...unfilled].join(",");
            if (signature === lastSignature) {
              log("The form did not advance. Stopping instead of looping.");
              break;
            }
            lastSignature = signature;
            log("Multi-step form, continuing to the next step.");
            await next.click().catch(() => {});
            await page.waitForTimeout(1500);
          }

          await page.waitForTimeout(800);
          await snap(page, "app");
          log(`Filled ${fieldsFilled.length} fields; ${unfilled.size} required field(s) unresolved.`);

          if (options.mode === "tabs") {
            handedOver = page;
            this.watchTab(page, job.id, options.resumeId, atsType, fieldsFilled.length);
            log("Filled and left open in the browser. Review it and click Submit yourself.");
            return {
              ...base,
              url: page.url(),
              atsType,
              status: "awaiting_user",
              fieldsFilled,
              unfilledFields: [...unfilled],
              screenshotBase64,
              screenshotPath,
              logs,
            };
          }

          if (options.mode === "review") {
            return {
              ...base,
              url: page.url(),
              atsType,
              status: "ready_for_review",
              fieldsFilled,
              unfilledFields: [...unfilled],
              screenshotBase64,
              screenshotPath,
              logs,
            };
          }
          if (unfilled.size > 0 && !options.forceSubmit && !fillCtx.bestGuess) {
            return stop("needs_review", `${unfilled.size} required field(s) could not be filled.`, [...unfilled]);
          }
          if (!submitSelector) return stop("needs_review", "Could not find a submit button.");

          // Last duplicate check, in case this job was applied to while the form was being filled.
          const lateDuplicate = (await AppliedIndex.load()).check(job);
          if (lateDuplicate) {
            return { ...base, atsType, status: "already_applied", fieldsFilled, reason: lateDuplicate, logs };
          }

          for (let attempt = 1; attempt <= MAX_SUBMIT_ATTEMPTS; attempt++) {
            log(attempt === 1 ? "Submitting application..." : `Submitting again (attempt ${attempt})...`);
            const urlBefore = page.url();
            const submitLoc = surface.locator(submitSelector).first();
            await submitLoc
              .click({ timeout: 8000 })
              .catch(() => submitLoc.click({ force: true, timeout: 5000 }));

            let outcome = await this.waitForOutcome(page, urlBefore);
            let problems = { invalid: [] as string[], captcha: false };
            if (outcome !== "success") {
              problems = await formAnalyzer.collectProblems(surface).catch(() => problems);
              if (problems.captcha && waitForLogin) {
                log("A captcha is blocking the submit. Solve it in the browser window (up to 5 minutes)...");
                outcome = await this.waitForCaptcha(page, surface, submitSelector, urlBefore);
              }
            }

            if (outcome === "success") {
              await snap(page, "result");
              const applicationId = await this.recordApplication(job.id, options.resumeId, atsType, fieldsFilled.length);
              log(`Application confirmed and recorded on your board (${applicationId}).`);
              return {
                ...base,
                url: page.url(),
                atsType,
                status: "submitted",
                fieldsFilled,
                screenshotBase64,
                screenshotPath,
                confirmationMessage: `Application submitted to ${companyName} for ${job.title}.`,
                logs,
                applicationId,
              };
            }

            if (problems.invalid.length > 0 && attempt < MAX_SUBMIT_ATTEMPTS) {
              log(`The form flagged ${problems.invalid.length} problem(s): ${problems.invalid.join("; ").slice(0, 160)}. Fixing and retrying.`);
              fillCtx.bestGuess = true;
              const again = await formAnalyzer.analyzeForm(surface, scope).catch(() => []);
              await this.fillStep(surface, scope, again, fillCtx, fieldsFilled, unfilled, true);
              submitSelector = (await formAnalyzer.findSubmitButtonSelector(surface, scope)) ?? submitSelector;
              continue;
            }

            await snap(page, "result");
            if (problems.invalid.length > 0) return stop("needs_review", "The form rejected the submission.", problems.invalid);
            if (problems.captcha) {
              return stop("needs_review", "Blocked by a captcha. Use Open & finish to solve it in the browser.");
            }
            return stop(
              "needs_review",
              "Clicked submit but could not confirm it went through. Check the screenshot before retrying."
            );
          }
          return stop("needs_review", "The form would not accept the submission.");
        };
        try {
          return await flow();
        } catch (err) {
          if (err instanceof SignedInRetry) return await flow();
          throw err;
        }
      } finally {
        clearTimeout(watchdog);
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message.split("\n")[0] : String(err);
      const errMsg = /has been closed|Target closed/i.test(raw)
        ? "The browser window was closed during the run."
        : /net::ERR|Timeout .* exceeded.*goto|ERR_NAME_NOT_RESOLVED/i.test(raw)
          ? `The page would not load (${raw.slice(0, 80)}).`
          : raw;
      log(`Error during auto-application: ${errMsg}`);
      return stop("failed", errMsg);
    } finally {
      liveCtx?.off("page", onPage);
      for (const p of opened) {
        if (p !== handedOver && !p.isClosed()) await p.close().catch(() => {});
      }
      if (liveCtx) browserSession.release();
    }
  }

  /**
   * LinkedIn job page. Needs a connected session. Uses Easy Apply when offered, otherwise follows
   * the external Apply link to the company's own form.
   */
  private async openLinkedInApply(
    context: BrowserContext,
    page: Page,
    log: (m: string) => void
  ): Promise<
    | { kind: "skipped"; reason: string }
    | { kind: "login"; reason: string }
    | { kind: "applied" }
    | { kind: "ok"; page: Page; scope?: string }
  > {
    const cookies = await context.cookies("https://www.linkedin.com");
    if (!cookies.some((c) => c.name === "li_at")) {
      return { kind: "login", reason: "LinkedIn needs you to sign in." };
    }
    if (/authwall|\/login|checkpoint/i.test(page.url())) {
      return { kind: "login", reason: "Your LinkedIn session expired. Sign in again." };
    }
    await page.waitForTimeout(2500);

    const text = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
    if (/no longer accepting applications/i.test(text)) return { kind: "skipped", reason: "LinkedIn says this job is closed." };
    if (await page.getByText(/^Applied\b|See application status/i).first().isVisible().catch(() => false)) {
      return { kind: "applied" };
    }

    const easy = page.locator("button:has-text('Easy Apply'), a:has-text('Easy Apply')").first();
    if (await easy.isVisible().catch(() => false)) {
      log("LinkedIn Easy Apply found, opening it.");
      await easy.click().catch(() => {});
      const dialog = page.locator("[role='dialog']").first();
      await dialog.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      if (!(await dialog.isVisible().catch(() => false))) {
        return { kind: "skipped", reason: "Easy Apply did not open." };
      }
      return { kind: "ok", page, scope: "[role='dialog']" };
    }

    const external = page
      .getByRole("button", { name: /^Apply$/ })
      .or(page.getByRole("link", { name: /^Apply$/ }))
      .first();
    if (!(await external.isVisible().catch(() => false))) {
      return { kind: "skipped", reason: "No Apply button on the LinkedIn page." };
    }
    log("LinkedIn external Apply found, following it to the company site.");
    const popup = context.waitForEvent("page", { timeout: 6000 }).catch(() => null);
    await external.click().catch(() => {});
    const leaving = page.getByRole("button", { name: /^Continue$/ }).first();
    if (await leaving.isVisible().catch(() => false)) await leaving.click().catch(() => {});
    const opened = await popup;
    const target = opened ?? page;
    await target.waitForLoadState("domcontentloaded").catch(() => {});
    target.setDefaultTimeout(20000);
    await target.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    return { kind: "ok", page: target };
  }

  /**
   * Polls until the user has signed in: a LinkedIn session cookie appears, or no password box is left on screen.
   */
  private async waitForSignIn(context: BrowserContext, page: Page): Promise<boolean> {
    const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
    const startedOnLinkedIn = /linkedin\.com/i.test(page.url());
    const started = Date.now();
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const open = context.pages().filter((p) => !p.isClosed());
      if (open.length === 0) return false;
      if (startedOnLinkedIn) {
        const cookies = await context.cookies("https://www.linkedin.com").catch(() => []);
        if (cookies.some((c) => c.name === "li_at")) {
          await new Promise((r) => setTimeout(r, 2500));
          return true;
        }
        continue;
      }
      if (Date.now() - started < 6000) continue;
      let passwordVisible = false;
      for (const p of open) {
        passwordVisible ||= await p.locator("input[type='password']").first().isVisible().catch(() => false);
      }
      if (!passwordVisible) {
        await new Promise((r) => setTimeout(r, 1500));
        return true;
      }
    }
    return false;
  }

  /**
   * The page is not a form yet. Ask the LLM which visible link or button leads to the application.
   */
  private async agentNavigate(context: BrowserContext, page: Page, ctx: FillContext): Promise<Page | null> {
    const clickables = await formAnalyzer.listClickables(page).catch(() => []);
    if (clickables.length === 0) return null;
    const digest = await formAnalyzer.pageDigest(page).catch(() => ({ title: "", text: "" }));

    const prompt = `You are a browser agent applying for the job "${ctx.jobTitle}" at ${ctx.companyName}.
The browser is on ${page.url()}
Page title: ${digest.title}
Page text (start): ${digest.text}

Clickable elements:
${clickables.map((c) => `${c.id}: ${c.text} (${c.kind})`).join("\n")}

Pick the single element to click to reach or continue the job application form (for example "Apply", "Apply now", "Start application", or a cookie banner that blocks the page).
Never pick sign in, log in, create account, save job, share, or unrelated navigation.
If nothing suitable exists, return null.
Reply with ONLY JSON: {"id": "<element id or null>", "reason": "<short reason>"}`;

    let id: string | null = null;
    try {
      const raw = await agentLLM.generateText(prompt);
      const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? "{}") as { id?: string | null; reason?: string };
      id = parsed.id != null && parsed.id !== "null" ? String(parsed.id) : null;
      ctx.log(`Agent navigation: ${id ? `click "${clickables.find((c) => c.id === id)?.text ?? id}"` : "nothing to click"}${parsed.reason ? ` (${parsed.reason})` : ""}`);
    } catch (err) {
      ctx.log(`Agent navigation unavailable: ${err instanceof Error ? err.message.slice(0, 80) : err}`);
      return null;
    }
    if (!id || !clickables.some((c) => c.id === id)) return null;

    const popup = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
    await page.locator(`[data-af-click="${id}"]`).first().click({ timeout: 8000 }).catch(() => {});
    const opened = await popup;
    const target = opened ?? page;
    if (opened) opened.setDefaultTimeout(20000);
    await target.waitForLoadState("domcontentloaded").catch(() => {});
    await target.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await target.waitForTimeout(1000);
    return target;
  }

  /**
   * Waits for a confirmation signal after clicking submit.
   */
  private async waitForOutcome(page: Page, urlBefore: string, windowMs = 18000): Promise<"success" | "unknown"> {
    const deadline = Date.now() + windowMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1000);
      const urlNow = page.url();
      if (urlNow !== urlBefore && SUCCESS_URL.test(urlNow)) return "success";
      for (const frame of page.frames()) {
        const text = await frame.evaluate(() => document.body?.innerText || "").catch(() => "");
        if (SUCCESS_TEXT.test(text)) return "success";
      }
    }
    return "unknown";
  }

  /**
   * Writes the submitted application to the board without relying on an ON CONFLICT clause.
   */
  private async recordApplication(
    jobId: string,
    resumeId: string | undefined,
    ats: string,
    fieldCount: number
  ): Promise<string> {
    const db = getDatabase();
    const notes = `Auto-applied via Huntly (${ats.toUpperCase()}). Filled ${fieldCount} fields.`;
    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.jobId, jobId))
      .limit(1);
    if (existing) {
      await db
        .update(applications)
        .set({ status: "applied", appliedAt: new Date(), notes, updatedAt: new Date() })
        .where(eq(applications.id, existing.id));
      return existing.id;
    }
    const id = uuidv4();
    await db.insert(applications).values({
      id,
      jobId,
      resumeVersionId: resumeId || null,
      status: "applied",
      appliedAt: new Date(),
      notes,
    });
    return id;
  }

  private async dismissOverlays(page: Page, log: (m: string) => void) {
    const selectors = [
      "#onetrust-accept-btn-handler",
      "button:has-text('Accept all')",
      "button:has-text('Accept All')",
      "button:has-text('Accept')",
      "button:has-text('I Agree')",
      "button:has-text('Got it')",
      ".cookie-accept",
    ];
    for (const sel of selectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible().catch(() => false)) {
        log("Dismissing cookie banner.");
        await btn.click().catch(() => {});
        await page.waitForTimeout(500);
        return;
      }
    }
  }

  /**
   * Opens the application form when the page is only a job description. Follows a new tab if one opens.
   */
  private async revealApplicationForm(context: BrowserContext, page: Page, log: (m: string) => void): Promise<Page> {
    const surface = await formAnalyzer.findFormSurface(page);
    if ((await formAnalyzer.analyzeForm(surface)).length >= 4) return page;

    const candidates = [
      "a[href*='#app']",
      "[data-qa='btn-apply']",
      "a:has-text('Apply for this job')",
      "button:has-text('Apply for this job')",
      "a:has-text('Apply now')",
      "button:has-text('Apply now')",
      "a:has-text('Apply Now')",
      "button:has-text('Apply Now')",
      "a:has-text('Apply')",
      "button:has-text('Apply')",
    ];
    for (const sel of candidates) {
      const btn = page.locator(sel).first();
      if (!(await btn.isVisible().catch(() => false))) continue;
      log(`Opening application form via ${sel}`);
      const popup = context.waitForEvent("page", { timeout: 4000 }).catch(() => null);
      await btn.click().catch(() => {});
      const opened = await popup;
      if (opened) {
        await opened.waitForLoadState("domcontentloaded").catch(() => {});
        opened.setDefaultTimeout(20000);
        page = opened;
      }
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(1200);
      break;
    }
    return page;
  }

  /**
   * One pass over the visible controls. Answering a question can reveal follow-ups, so it re-scans up to three times.
   */
  private async fillStep(
    surface: Page | Frame,
    scope: string | undefined,
    firstFields: DetectedFormField[],
    ctx: FillContext,
    fieldsFilled: FieldFillRecord[],
    unfilled: Set<string>,
    retryAll = false
  ): Promise<void> {
    const done = new Set<string>();
    const keyOf = (f: DetectedFormField) => `${f.type}|${f.label || f.name}`;
    let fields = firstFields;
    for (let pass = 1; pass <= 3; pass++) {
      let progressed = false;
      for (const field of fields) {
        const label = field.label || field.name || field.category;
        if (done.has(keyOf(field))) continue;
        // On a retry after a validation error, only touch controls that are still empty.
        if (retryAll && field.currentValue && field.type !== "radio") continue;
        try {
          const rec = await this.fillControl(surface, field, ctx);
          if (rec) {
            fieldsFilled.push(rec);
            unfilled.delete(label);
            done.add(keyOf(field));
            progressed = true;
          } else if (field.required && !field.currentValue) {
            unfilled.add(label);
          } else {
            done.add(keyOf(field));
          }
        } catch (err: unknown) {
          ctx.log(`Could not fill "${label}": ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
          if (field.required) unfilled.add(label);
        }
      }
      if (!progressed) break;
      await new Promise((r) => setTimeout(r, 700));
      fields = (await formAnalyzer.analyzeForm(surface, scope).catch(() => [])).filter((f) => !done.has(keyOf(f)));
      if (fields.length === 0) break;
    }
  }

  /**
   * Waits for the user to solve a captcha, then submits again if the page did not do it by itself.
   */
  private async waitForCaptcha(
    page: Page,
    surface: Page | Frame,
    submitSelector: string,
    urlBefore: string
  ): Promise<"success" | "unknown"> {
    const deadline = Date.now() + CAPTCHA_TIMEOUT_MS;
    let clickedAgain = false;
    while (Date.now() < deadline) {
      if (page.isClosed()) return "unknown";
      if ((await this.waitForOutcome(page, urlBefore, 3000)) === "success") return "success";
      const solved = await surface
        .evaluate(() =>
          Array.from(document.querySelectorAll("textarea[name$='captcha-response'], input[name$='captcha-response']")).some(
            (e) => ((e as HTMLTextAreaElement).value || "").length > 20
          )
        )
        .catch(() => false);
      if (solved && !clickedAgain) {
        clickedAgain = true;
        await surface.locator(submitSelector).first().click({ timeout: 5000 }).catch(() => {});
      }
    }
    return "unknown";
  }

  /**
   * Fills a control. If the normal strategy fails and best-guess mode is on, picks the most reasonable value
   * so a required question never blocks the application.
   */
  private async fillControl(surface: Page | Frame, field: DetectedFormField, ctx: FillContext): Promise<FieldFillRecord | null> {
    let failure: unknown = null;
    try {
      const rec = await this.fillControlCore(surface, field, ctx);
      if (rec) return rec;
    } catch (err) {
      failure = err;
    }
    if (ctx.bestGuess && field.required && !field.currentValue) {
      try {
        const guessed = await this.bestGuessFill(surface, field, ctx);
        if (guessed) return guessed;
      } catch (err) {
        failure = failure ?? err;
      }
    }
    if (failure) throw failure;
    return null;
  }

  /**
   * Last resort for a required field: the least committal sensible value.
   */
  private async bestGuessFill(surface: Page | Frame, field: DetectedFormField, ctx: FillContext): Promise<FieldFillRecord | null> {
    const loc = surface.locator(field.selector).first();
    const label = field.label || field.name || field.category;
    const rec = (value: string, type: FieldFillRecord["type"]): FieldFillRecord => ({
      field: field.name,
      label,
      category: field.category,
      value,
      type,
    });
    const safe = (opts: Array<{ label: string; value: string }>) => {
      const real = opts.filter((o) => o.label.trim() && !/^(select|choose|please|--)/i.test(o.label.trim()));
      return (
        real.find((o) => /prefer not|decline|not (applicable|specified)|n\/a|none of/i.test(o.label)) ??
        real.find((o) => /other/i.test(o.label)) ??
        real[0] ??
        null
      );
    };

    if (field.type === "file" || PROFILE_LINKS.includes(field.category)) return null;

    if (field.type === "checkbox") {
      await loc.check({ force: true }).catch(() => loc.click({ force: true }));
      return rec("checked", "checkbox");
    }

    if (field.type === "radio" && field.options?.length) {
      const pick = safe(field.options);
      if (!pick) return null;
      await this.clickChoice(surface, pick);
      ctx.log(`Best guess "${pick.label}" for [${label}]`);
      return rec(pick.label, "radio");
    }

    if (field.type === "select" && field.options?.length) {
      const pick = safe(field.options);
      if (!pick) return null;
      await loc.selectOption(pick.value !== "" ? { value: pick.value } : { label: pick.label });
      ctx.log(`Best guess "${pick.label}" for [${label}]`);
      return rec(pick.label, "select");
    }

    if (field.type === "combobox") {
      await loc.click({ timeout: 5000 }).catch(() => loc.click({ force: true, timeout: 3000 }));
      await surface.waitForTimeout(400);
      const owner = await loc.getAttribute("aria-controls").catch(() => null);
      const optionLoc = owner ? surface.locator(`[id="${owner}"] [role='option']`) : surface.locator("[role='option']:visible");
      const texts = (await optionLoc.allTextContents()).map((t) => t.trim()).filter(Boolean);
      const pick = safe(texts.map((t) => ({ label: t, value: t })));
      if (!pick) {
        await loc.press("Escape").catch(() => {});
        return null;
      }
      const target = optionLoc.filter({ hasText: pick.label }).first();
      await target.click({ timeout: 4000 }).catch(() => target.click({ force: true, timeout: 3000 }));
      ctx.log(`Best guess "${pick.label}" for [${label}]`);
      return rec(pick.label, "select");
    }

    // Text-like. Ask once more, plainly; if the model is unreachable use a neutral value.
    let value = "";
    try {
      value = await aiAnswerGenerator.generateAnswer({
        question: `${label} (required, give a short truthful answer based on the resume)`,
        jobTitle: ctx.jobTitle,
        company: ctx.companyName,
        jobDescription: ctx.jobDescription,
        profile: ctx.profile,
        resumeContext: ctx.resumeContext,
      });
    } catch {
      value = "";
    }
    if (!value) {
      if (field.type === "number") value = /year|experience/i.test(label) ? String(ctx.profile.yearsOfExperience || 1) : "0";
      else if (field.type === "email") value = ctx.profile.email;
      else if (field.type === "tel") value = ctx.profile.phone;
      else if (field.type === "url") value = ctx.profile.linkedinUrl || ctx.profile.portfolioUrl || ctx.profile.githubUrl;
      else if (field.type === "textarea")
        value = `I am interested in the ${ctx.jobTitle} role at ${ctx.companyName} and believe my background is a strong fit.`;
      else value = "N/A";
    }
    if (!value) return null;
    if (field.type === "number") value = value.match(/\d+(\.\d+)?/)?.[0] ?? "0";
    await this.safeType(surface, loc, value);
    ctx.log(`Best guess for [${label}]`);
    return rec(value, "ai_generated");
  }

  /** Clicks a radio option even when its input is visually hidden or the page re-rendered. */
  private async clickChoice(surface: Page | Frame, option: { label: string; value: string }): Promise<void> {
    const byAttr = surface.locator(option.value).first();
    if ((await byAttr.count().catch(() => 0)) > 0) {
      try {
        await byAttr.check({ force: true, timeout: 4000 });
        return;
      } catch {
        // fall through to the label
      }
    }
    const byLabel = surface.getByLabel(option.label, { exact: true }).first();
    try {
      await byLabel.check({ force: true, timeout: 4000 });
    } catch {
      await surface.getByText(option.label, { exact: true }).first().click({ timeout: 4000 });
    }
  }

  /** fill() first; if the field is covered or custom, click it and type like a person would. */
  private async safeType(surface: Page | Frame, loc: Locator, value: string): Promise<void> {
    try {
      await loc.fill(value, { timeout: 6000 });
    } catch {
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      await loc.click({ force: true, timeout: 4000 });
      await surface.waitForTimeout(150);
      const page = "keyboard" in surface ? surface : surface.page();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(value, { delay: 8 });
    }
  }

  /**
   * Fills one detected control. Known categories come from the profile, everything else goes through the AI answerer.
   */
  private async fillControlCore(
    surface: Page | Frame,
    field: DetectedFormField,
    ctx: FillContext
  ): Promise<FieldFillRecord | null> {
    const { profile, log } = ctx;
    const loc = surface.locator(field.selector).first();
    const label = field.label || field.name || field.category;
    const record = (value: string, type: FieldFillRecord["type"]): FieldFillRecord => ({
      field: field.name,
      label,
      category: field.category,
      value,
      type,
    });

    if (field.type === "file") {
      if (field.category === "resume" && ctx.resumePdfPath && fsSync.existsSync(ctx.resumePdfPath)) {
        await loc.setInputFiles(ctx.resumePdfPath);
        log(`Uploaded resume: ${path.basename(ctx.resumePdfPath)}`);
        return record(path.basename(ctx.resumePdfPath), "file");
      }
      return null;
    }

    if (field.type === "checkbox") {
      // Required acknowledgements get ticked; optional boxes (newsletters, follow company) are left alone.
      if (!CONSENT.test(label) && !field.required) return null;
      await loc.check({ force: true }).catch(() => loc.click({ force: true }));
      return record("checked", "checkbox");
    }

    if (field.type === "radio") {
      if (field.currentValue || !field.options?.length) return null;
      const answer = await this.chooseAnswer(field, ctx, field.options.map((o) => o.label));
      const option = answer ? pickFor(field.options, answer, field.category) : null;
      if (!option) return null;
      await this.clickChoice(surface, option);
      log(`Selected "${option.label}" for [${label}]`);
      return record(option.label, "radio");
    }

    if (!(await loc.isVisible().catch(() => false))) return null;

    if (field.type === "select") {
      if (!field.options?.length) return null;
      const answer = await this.chooseAnswer(field, ctx, field.options.map((o) => o.label));
      const option = answer ? pickFor(field.options, answer, field.category) : null;
      if (!option) return null;
      await loc.selectOption(option.value !== "" ? { value: option.value } : { label: option.label });
      log(`Selected "${option.label}" for [${label}]`);
      return record(option.label, "select");
    }

    if (field.type === "combobox") {
      const picked = await this.fillCombobox(surface, loc, field, ctx);
      if (!picked) return null;
      log(`Selected "${picked}" for [${label}]`);
      return record(picked, "select");
    }

    // Plain text, textarea, email, tel, url, number
    const fixed = profileAnswer(field.category, profile);
    const overwriteable = ["first_name", "last_name", "full_name", "email", "phone"].includes(field.category);
    if (field.currentValue && !overwriteable) return null;

    // "If so, please explain" only matters when the question before it was answered yes.
    if (fixed == null && !field.required && /^(if (so|yes|applicable)|please (explain|specify))|if you answered/i.test(label)) return null;

    // Profile links are facts. Take them from the profile or the resume, never from the model.
    if (fixed == null && PROFILE_LINKS.includes(field.category)) {
      const found = findProfileLink(field.category, ctx.resumeContext);
      if (!found) return null;
      await this.safeType(surface, loc, found);
      log(`Filled [${label}] from the resume`);
      return record(found, "text");
    }

    let value = fixed;
    let kind: FieldFillRecord["type"] = "text";
    const wantsAI =
      value == null &&
      (field.category === "custom_question" ||
        field.category === "cover_letter" ||
        field.type === "textarea" ||
        field.required);
    if (wantsAI) {
      log(`AI answering: "${label}"`);
      value = await aiAnswerGenerator.generateAnswer({
        question: field.category === "cover_letter" ? "Write a brief 3 sentence cover note for this role" : label,
        jobTitle: ctx.jobTitle,
        company: ctx.companyName,
        jobDescription: ctx.jobDescription,
        profile,
        resumeContext: ctx.resumeContext,
      });
      kind = "ai_generated";
    }
    if (!value) return null;
    if (field.type === "number") {
      const n = value.match(/\d+(\.\d+)?/)?.[0];
      if (!n) return null;
      value = n;
    }
    await this.safeType(surface, loc, value);
    log(`Filled [${label}]`);
    return record(value, kind);
  }

  private async chooseAnswer(field: DetectedFormField, ctx: FillContext, optionTexts: string[]): Promise<string | null> {
    const fixed = profileAnswer(field.category, ctx.profile);
    if (fixed) return fixed;
    if (!field.label) return null;
    return aiAnswerGenerator.generateAnswer({
      question: field.label,
      jobTitle: ctx.jobTitle,
      company: ctx.companyName,
      jobDescription: ctx.jobDescription,
      profile: ctx.profile,
      resumeContext: ctx.resumeContext,
      options: optionTexts.slice(0, 60),
    });
  }

  /**
   * Handles react-select style dropdowns: open, read the rendered options, pick, click.
   */
  private async fillCombobox(
    surface: Page | Frame,
    loc: Locator,
    field: DetectedFormField,
    ctx: FillContext
  ): Promise<string | null> {
    // Options of the control that was just opened, not of other hidden lists on the page (phone country picker).
    const optionsNow = async () => {
      const owner = await loc.getAttribute("aria-controls").catch(() => null);
      return owner ? surface.locator(`[id="${owner}"] [role='option']`) : surface.locator("[role='option']:visible");
    };
    await loc.click({ timeout: 5000 }).catch(() => loc.click({ force: true, timeout: 3000 }));
    await surface.waitForTimeout(350);
    let texts = (await (await optionsNow()).allTextContents()).map((t) => t.trim()).filter(Boolean);
    // When we typed a query ourselves, only suggestions containing it as a whole word count ("India" must not pick "Indianapolis").
    let typedQuery = "";

    const fixed = profileAnswer(field.category, ctx.profile);
    let answer = fixed;
    if (fixed && (texts.length === 0 || texts.length > 40)) {
      typedQuery = ["city", "location", "state", "country"].includes(field.category) ? fixed.slice(0, 30) : "";
      await loc.fill(fixed.slice(0, 30));
      await surface.waitForTimeout(600);
      texts = (await (await optionsNow()).allTextContents()).map((t) => t.trim()).filter(Boolean);
    }
    if (!answer && texts.length === 0 && field.label) {
      // Typeahead (for example a city): ask for a value, type it, then read what the site suggests.
      const typed = await this.chooseAnswer(field, ctx, []);
      if (typed) {
        typedQuery = typed.slice(0, 30);
        await loc.fill(typed.slice(0, 30));
        await surface.waitForTimeout(900);
        texts = (await (await optionsNow()).allTextContents()).map((t) => t.trim()).filter(Boolean);
        answer = typed;
      }
    }
    if (!answer && texts.length > 0 && field.label) {
      answer = await this.chooseAnswer(field, ctx, texts);
    }
    if (!answer || texts.length === 0) {
      await loc.press("Escape").catch(() => {});
      return null;
    }
    const candidates = typedQuery
      ? texts.filter((t) => new RegExp(`\\b${typedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t))
      : texts;
    const match = pickFor(candidates.map((t) => ({ label: t, value: t })), answer, field.category);
    if (!match) {
      await loc.press("Escape").catch(() => {});
      return null;
    }
    const target = (await optionsNow()).filter({ hasText: match.label }).first();
    await target.click({ timeout: 4000 }).catch(() => target.click({ force: true, timeout: 3000 }));
    return match.label;
  }
}

const JOB_TIMEOUT_MS = 4 * 60 * 1000;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_NAV_HOPS = 3;
const MAX_SUBMIT_ATTEMPTS = 3;
const CAPTCHA_TIMEOUT_MS = 5 * 60 * 1000;
const agentLLM = new GeminiClient();

/** Thrown after the user signs in, to restart the flow from the job URL. */
class SignedInRetry extends Error {}
const MAX_FORM_STEPS = 5;
const CONSENT = /agree|consent|acknowledge|privacy|terms|certify|confirm|accurate|gdpr|data processing/i;
const SUCCESS_TEXT =
  /thank you for (applying|your application|your interest)|application (has been |was )?(successfully )?(submitted|received|sent)|we('ve| have) received your application|successfully (submitted|applied)|your application is (in|complete)|application complete|application (was )?sent|your application was sent/i;
function summarizeResume(parsed: Record<string, unknown>, latex?: string | null): string {
  const fromParsed = Object.keys(parsed).length ? JSON.stringify(parsed) : "";
  const fromLatex = (latex ?? "")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/[{}$%&_^~\\]/g, " ")
    .replace(/\s+/g, " ");
  return (fromParsed.length > 200 ? fromParsed : fromLatex).slice(0, 4500);
}

const SUCCESS_URL = /confirm|thank|success|submitted|complete/i;

interface FillContext {
  profile: ApplicantProfile;
  resumePdfPath?: string;
  resumeContext: string;
  bestGuess: boolean;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  log: (m: string) => void;
}

/** Lever and Ashby show the description first; the form lives one path segment deeper. */
export function resolveApplyUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    if (u.hostname === "jobs.lever.co" && segments.length === 2) u.pathname += "/apply";
    if (u.hostname === "jobs.ashbyhq.com" && segments.length === 2) u.pathname += "/application";
    return u.toString();
  } catch {
    return url;
  }
}

function loginWallReason(url: string, ats: ATSSystemType): string | null {
  if (ats === "workday") return "Workday requires an account.";
  if (/indeed\.com|glassdoor\.com|naukri\.com|wellfound\.com/i.test(url)) {
    return "This site requires you to be logged in.";
  }
  return null;
}

const PROFILE_LINKS = ["linkedin", "github", "portfolio"];

/** Looks for the user's own profile URL inside the resume text. */
function findProfileLink(category: string, resumeText: string): string | null {
  const patterns: Record<string, RegExp> = {
    linkedin: /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[\w\-%.]+/i,
    github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w\-.]+/i,
    portfolio: /https?:\/\/(?!.*(?:linkedin|github)\.com)[\w.\-]+\.[a-z]{2,}[\w\-./?%&=]*/i,
  };
  const m = resumeText.match(patterns[category] ?? /$^/);
  if (!m) return null;
  return /^https?:/i.test(m[0]) ? m[0] : `https://${m[0]}`;
}

/** Deterministic answers from the profile, no AI needed. */
function profileAnswer(category: string, p: ApplicantProfile): string | null {
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const map: Record<string, string> = {
    first_name: p.firstName,
    last_name: p.lastName,
    full_name: p.fullName,
    email: p.email,
    phone: p.phone,
    linkedin: p.linkedinUrl,
    github: p.githubUrl,
    portfolio: p.portfolioUrl,
    city: p.city,
    state: p.state,
    country: p.country,
    location: p.location,
    consent: "Yes",
    referral_source: "LinkedIn",
    work_authorization: yes(p.authorizedToWork),
    sponsorship: yes(p.requireSponsorship),
    salary: p.expectedSalary,
    notice_period: p.noticePeriodDays ? `${p.noticePeriodDays} days` : "Immediately",
    gender: p.gender,
    race: p.race,
    veteran: p.veteranStatus,
    disability: p.disabilityStatus,
  };
  const v = map[category];
  return v && v.trim() ? v : null;
}

/** Picks an option for a field, with category-specific fallbacks (consent wording, referral source). */
export function pickFor<T extends { label: string }>(options: T[], answer: string, category: string): T | null {
  const direct = pickOption(options, answer);
  if (direct) return direct;
  const first = (re: RegExp) => options.find((o) => re.test(o.label)) ?? null;
  if (category === "consent") return first(/accept|agree|acknowledge|consent|^yes/i);
  if (category === "referral_source") return first(/linkedin/i) ?? first(/job board|online|internet|website/i) ?? first(/other/i);
  return null;
}

/** Matches an answer to the closest option label. */
export function pickOption<T extends { label: string }>(options: T[], answer: string): T | null {
  const a = answer.trim().toLowerCase();
  if (!a) return null;
  const real = options.filter((o) => o.label.trim() && !/^(select|choose|please|--)/i.test(o.label.trim()));
  const L = (o: T) => o.label.trim().toLowerCase();
  const decline = /decline|prefer not|do not wish|don't wish|not to (say|disclose)/;
  const found =
    real.find((o) => L(o) === a) ??
    real.find((o) => L(o).startsWith(a)) ??
    (/^yes\b/.test(a) ? real.find((o) => /^yes\b/.test(L(o))) : undefined) ??
    (/^no\b/.test(a) ? real.find((o) => /^no\b/.test(L(o))) : undefined) ??
    (decline.test(a) ? real.find((o) => decline.test(L(o))) : undefined) ??
    real.find((o) => L(o).includes(a)) ??
    real.find((o) => a.includes(L(o)) && L(o).length > 2);
  return found ?? null;
}

export const defaultAutoApplier = new AutoApplierEngine();
