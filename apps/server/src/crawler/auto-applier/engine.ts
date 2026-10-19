import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
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
} from "@agentforge/database";
import { detectATS } from "./ats-detector.js";
import { formAnalyzer } from "./form-analyzer.js";
import { aiAnswerGenerator } from "./ai-answer-generator.js";
import { latexCompiler } from "../../services/latex-compiler.js";
import type {
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
    overrides?: Partial<ApplicantProfile>
  ): Promise<{ profile: ApplicantProfile; resumePdfPath?: string }> {
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
      expectedSalary: String(overrides?.expectedSalary || savedAutoApply["expectedSalary"] || "Competitive"),
      gender: String(overrides?.gender || savedAutoApply["gender"] || "Decline to self-identify"),
      race: String(overrides?.race || savedAutoApply["race"] || "Decline to self-identify"),
      veteranStatus: String(overrides?.veteranStatus || savedAutoApply["veteranStatus"] || "I am not a protected veteran"),
      disabilityStatus: String(overrides?.disabilityStatus || savedAutoApply["disabilityStatus"] || "I do not have a disability"),
    };

    // 3. Prepare Resume PDF file
    let resumePdfPath: string | undefined;
    if (targetResume?.latex) {
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

    return { profile, resumePdfPath };
  }

  /**
   * Executes the auto-apply workflow for a given job.
   */
  public async executeAutoApply(options: AutoApplyOptions): Promise<AutoApplyResult> {
    const logs: string[] = [];
    const fieldsFilled: FieldFillRecord[] = [];
    const log = (msg: string) => {
      const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logs.push(entry);
      console.log(`[AutoApplier] ${entry}`);
    };

    const db = getDatabase();

    // Fetch Job & Company
    const [jobRecord] = await db
      .select({ job: jobs, company: companies })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(eq(jobs.id, options.jobId))
      .limit(1);

    if (!jobRecord || !jobRecord.job) {
      throw new Error(`Job '${options.jobId}' not found in database`);
    }

    const job = jobRecord.job;
    const companyName = jobRecord.company?.name || "Company";
    const targetUrl = job.applyUrl || job.sourceUrl;

    log(`Starting Auto-Apply for: "${job.title}" at ${companyName}`);
    log(`Target URL: ${targetUrl}`);

    // Resolve Applicant Profile
    const { profile, resumePdfPath } = await this.resolveApplicantProfile(
      job.id,
      options.resumeId,
      options.profileOverrides
    );
    log(`Applicant: ${profile.fullName} (${profile.email || "no email provided"})`);

    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      log("Launching Playwright automated browser...");
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
        ],
      });

      context = await browser.newContext({
        viewport: { width: 1280, height: 960 },
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      });

      page = await context.newPage();
      page.setDefaultTimeout(30000);

      log(`Navigating to ${targetUrl}...`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
      await page.waitForTimeout(2500);

      // Handle cookie consent / overlay banners
      await this.dismissOverlays(page, log);

      // Check if we need to click "Apply" or "Apply for this job" to open the form
      await this.revealApplicationForm(page, log);

      const html = await page.content();
      const currentUrl = page.url();
      const atsType = detectATS(currentUrl, html);
      log(`Detected ATS platform: [${atsType.toUpperCase()}]`);

      // Analyze page form fields
      log("Interrogating DOM for form fields and screening questions...");
      const detectedFields = await formAnalyzer.analyzeForm(page);
      log(`Found ${detectedFields.length} potential form fields.`);

      // Fill Form Fields
      for (const field of detectedFields) {
        try {
          const fillRecord = await this.fillField(
            page,
            field,
            profile,
            resumePdfPath,
            job.title,
            companyName,
            job.description,
            log
          );
          if (fillRecord) {
            fieldsFilled.push(fillRecord);
          }
        } catch (fillErr: unknown) {
          const msg = fillErr instanceof Error ? fillErr.message : String(fillErr);
          log(`Skipped field "${field.label || field.name}": ${msg}`);
        }
      }

      await page.waitForTimeout(1500);

      // Capture preview screenshot
      const screenshotFilename = `app_${job.id}_${Date.now()}.png`;
      const screenshotPath = path.join(this.screenshotsDir, screenshotFilename);
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      await fs.writeFile(screenshotPath, screenshotBuffer);
      const screenshotBase64 = `data:image/png;base64,${screenshotBuffer.toString("base64")}`;
      log(`Captured filled application screenshot (${Math.round(screenshotBuffer.length / 1024)} KB)`);

      // Review Mode: Return state for user approval
      if (options.mode === "review") {
        log("Ready for review! Application fields filled and preview screenshot generated.");
        return {
          jobId: job.id,
          title: job.title,
          company: companyName,
          url: currentUrl,
          atsType,
          status: "ready_for_review",
          fieldsFilled,
          screenshotBase64,
          screenshotPath,
          logs,
        };
      }

      // Full Automation Mode: Submit the application!
      log("Full Auto Mode: Submitting application form...");
      const submitSelector = await formAnalyzer.findSubmitButtonSelector(page);

      if (submitSelector) {
        log(`Clicking submit button via selector: ${submitSelector}`);
        await page.click(submitSelector);
      } else {
        log("Clicking submit button via text match...");
        await page.getByRole("button", { name: /submit|apply/i }).first().click();
      }

      // Wait for navigation or submission acknowledgement
      await page.waitForTimeout(4000);

      // Capture confirmation screenshot
      const confirmFilename = `confirmed_${job.id}_${Date.now()}.png`;
      const confirmPath = path.join(this.screenshotsDir, confirmFilename);
      const confirmBuffer = await page.screenshot({ fullPage: true });
      await fs.writeFile(confirmPath, confirmBuffer);
      const confirmBase64 = `data:image/png;base64,${confirmBuffer.toString("base64")}`;

      // Update Database Application Record
      const appId = uuidv4();
      await db
        .insert(applications)
        .values({
          id: appId,
          jobId: job.id,
          resumeVersionId: options.resumeId || null,
          status: "applied",
          appliedAt: new Date(),
          notes: `Auto-applied via AgentForge Crawler (${atsType.toUpperCase()}). Filled ${fieldsFilled.length} fields.`,
        })
        .onConflictDoUpdate({
          target: applications.jobId,
          set: {
            status: "applied",
            appliedAt: new Date(),
            notes: `Auto-applied via AgentForge Crawler (${atsType.toUpperCase()}). Filled ${fieldsFilled.length} fields.`,
            updatedAt: new Date(),
          },
        });

      log(`✓ Successfully submitted application and recorded in database (Application ID: ${appId})`);

      return {
        jobId: job.id,
        title: job.title,
        company: companyName,
        url: currentUrl,
        atsType,
        status: "submitted",
        fieldsFilled,
        screenshotBase64: confirmBase64,
        screenshotPath: confirmPath,
        confirmationMessage: `Application successfully submitted to ${companyName} for ${job.title}!`,
        logs,
        applicationId: appId,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`Error during auto-application: ${errMsg}`);

      return {
        jobId: job.id,
        title: job.title,
        company: companyName,
        url: targetUrl,
        atsType: "generic",
        status: "failed",
        fieldsFilled,
        logs,
        error: errMsg,
      };
    } finally {
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Dismiss cookie banners or modal overlays.
   */
  private async dismissOverlays(page: Page, log: (m: string) => void) {
    try {
      const cookieButtons = [
        "button:has-text('Accept')",
        "button:has-text('Accept All')",
        "button:has-text('I Agree')",
        "button:has-text('Got it')",
        "#onetrust-accept-btn-handler",
        ".cookie-accept",
      ];
      for (const sel of cookieButtons) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          log(`Dismissing cookie banner: ${sel}`);
          await btn.click().catch(() => {});
          await page.waitForTimeout(500);
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * If on a job description page, clicks "Apply" to open the form if needed.
   */
  private async revealApplicationForm(page: Page, log: (m: string) => void) {
    try {
      const applySelectors = [
        "a[href*='#apply']",
        "a:has-text('Apply for this job')",
        "button:has-text('Apply for this job')",
        "a:has-text('Apply Now')",
        "button:has-text('Apply Now')",
        "[data-qa='btn-apply']",
      ];

      for (const sel of applySelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible().catch(() => false)) {
          log(`Clicking to reveal application form: ${sel}`);
          await btn.click().catch(() => {});
          await page.waitForTimeout(1500);
          break;
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Fills an individual detected field according to its category and type.
   */
  private async fillField(
    page: Page,
    field: any,
    profile: ApplicantProfile,
    resumePdfPath: string | undefined,
    jobTitle: string,
    companyName: string,
    jobDescription: string,
    log: (m: string) => void
  ): Promise<FieldFillRecord | null> {
    const loc = page.locator(field.selector).first();
    const isVisible = await loc.isVisible().catch(() => false);
    if (!isVisible && field.type !== "file") {
      return null;
    }

    // Resume / File Upload
    if (field.category === "resume" && resumePdfPath && fsSync.existsSync(resumePdfPath)) {
      log(`Uploading resume PDF: ${path.basename(resumePdfPath)}`);
      await loc.setInputFiles(resumePdfPath);
      return {
        field: field.name || "resume",
        label: field.label || "Resume / CV",
        category: "resume",
        value: path.basename(resumePdfPath),
        type: "file",
      };
    }

    // First Name
    if (field.category === "first_name" && profile.firstName) {
      await loc.fill(profile.firstName);
      log(`Filled First Name: ${profile.firstName}`);
      return { field: field.name, label: field.label, category: "first_name", value: profile.firstName, type: "text" };
    }

    // Last Name
    if (field.category === "last_name" && profile.lastName) {
      await loc.fill(profile.lastName);
      log(`Filled Last Name: ${profile.lastName}`);
      return { field: field.name, label: field.label, category: "last_name", value: profile.lastName, type: "text" };
    }

    // Full Name
    if (field.category === "full_name" && profile.fullName) {
      await loc.fill(profile.fullName);
      log(`Filled Full Name: ${profile.fullName}`);
      return { field: field.name, label: field.label, category: "full_name", value: profile.fullName, type: "text" };
    }

    // Email
    if (field.category === "email" && profile.email) {
      await loc.fill(profile.email);
      log(`Filled Email: ${profile.email}`);
      return { field: field.name, label: field.label, category: "email", value: profile.email, type: "text" };
    }

    // Phone
    if (field.category === "phone" && profile.phone) {
      await loc.fill(profile.phone);
      log(`Filled Phone: ${profile.phone}`);
      return { field: field.name, label: field.label, category: "phone", value: profile.phone, type: "text" };
    }

    // LinkedIn
    if (field.category === "linkedin" && profile.linkedinUrl) {
      await loc.fill(profile.linkedinUrl);
      log(`Filled LinkedIn: ${profile.linkedinUrl}`);
      return { field: field.name, label: field.label, category: "linkedin", value: profile.linkedinUrl, type: "text" };
    }

    // GitHub
    if (field.category === "github" && profile.githubUrl) {
      await loc.fill(profile.githubUrl);
      log(`Filled GitHub: ${profile.githubUrl}`);
      return { field: field.name, label: field.label, category: "github", value: profile.githubUrl, type: "text" };
    }

    // Portfolio
    if (field.category === "portfolio" && profile.portfolioUrl) {
      await loc.fill(profile.portfolioUrl);
      log(`Filled Portfolio: ${profile.portfolioUrl}`);
      return { field: field.name, label: field.label, category: "portfolio", value: profile.portfolioUrl, type: "text" };
    }

    // Location / City
    if ((field.category === "location" || field.category === "city") && profile.location) {
      await loc.fill(profile.location);
      log(`Filled Location: ${profile.location}`);
      return { field: field.name, label: field.label, category: field.category, value: profile.location, type: "text" };
    }

    // Select Dropdowns (e.g. Work Auth, Sponsorship, Gender, Veteran, Disability)
    if (field.type === "select" && field.options && field.options.length > 0) {
      const optionTexts = field.options.map((o: any) => o.label);
      const answer = await aiAnswerGenerator.generateAnswer({
        question: field.label || field.name,
        jobTitle,
        company: companyName,
        jobDescription,
        profile,
        options: optionTexts,
      });

      const matchedOption = field.options.find(
        (o: any) => o.label.toLowerCase() === answer.toLowerCase() || o.label.toLowerCase().includes(answer.toLowerCase())
      );

      if (matchedOption) {
        await loc.selectOption(matchedOption.value || matchedOption.label);
        log(`Selected option "${matchedOption.label}" for [${field.label || field.name}]`);
        return {
          field: field.name,
          label: field.label,
          category: field.category,
          value: matchedOption.label,
          type: "select",
        };
      }
    }

    // Custom Questions / Textareas (AI Answering)
    if (field.category === "custom_question" || field.type === "textarea" || (field.required && !field.currentValue)) {
      log(`AI Generating answer for question: "${field.label || field.name}"...`);
      const answer = await aiAnswerGenerator.generateAnswer({
        question: field.label || field.name,
        jobTitle,
        company: companyName,
        jobDescription,
        profile,
      });

      await loc.fill(answer);
      log(`Filled AI Answer: "${answer.slice(0, 60)}..."`);
      return {
        field: field.name,
        label: field.label || field.name,
        category: "custom_question",
        value: answer,
        type: "ai_generated",
      };
    }

    return null;
  }
}

export const defaultAutoApplier = new AutoApplierEngine();
