/**
 * ATS Adapters — each adapter handles a specific ATS platform's API
 * to extract jobs without relying on HTML scraping.
 */

import type { ExtractedJob } from "./extractor.js";
import { normalizeLocation } from "../utils/normalize.js";
import { PlaywrightCrawler } from "./playwright-crawler.js";

let crawlerInstance: PlaywrightCrawler | null = null;
function getBrowserCrawler(): PlaywrightCrawler {
  if (!crawlerInstance) crawlerInstance = new PlaywrightCrawler();
  return crawlerInstance;
}

async function webBrowserFallback(targetUrl: string): Promise<ExtractedJob[]> {
  try {
    const crawler = getBrowserCrawler();
    const result = await crawler.crawl(targetUrl, {
      maxJobs: 100,
      followPagination: true,
      maxPages: 2,
      timeout: 25_000,
    });
    return result.jobs;
  } catch (err: any) {
    console.warn(`[ATS Web Fallback] Playwright fallback failed for ${targetUrl}:`, err?.message);
    return [];
  }
}

export interface ATSAdapter {
  name: string;
  canHandle(url: string): boolean;
  discoverJobs(companyIdentifier: string): Promise<ExtractedJob[]>;
  getJob(jobId: string, companySlug: string): Promise<ExtractedJob | null>;
}

// ─── Greenhouse Adapter ─────────────────────────────────────────

export class GreenhouseAdapter implements ATSAdapter {
  name = "greenhouse";

  canHandle(url: string): boolean {
    return url.includes("greenhouse.io") || url.includes("greenhouse");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/greenhouse\.io\/([^/]+)/);
    return m?.[1] ?? null;
  }

  async discoverJobs(companySlug: string): Promise<ExtractedJob[]> {
    try {
      const resp = await fetch(`https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs?content=true`, {
        headers: { "User-Agent": "Huntly/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return [];

      const data = await resp.json() as {
        jobs?: Array<{
          id: number;
          title: string;
          content?: string;
          location?: { name?: string };
          absolute_url?: string;
          updated_at?: string;
          metadata?: Array<{ name: string; value: unknown }>;
        }>;
      };

      return (data.jobs ?? []).map(job => ({
        title: job.title,
        description: job.content ? stripHtml(job.content) : "",
        location: normalizeLocation(job.location?.name ?? ""),
        sourceUrl: job.absolute_url ?? `https://boards.greenhouse.io/${companySlug}/jobs/${job.id}`,
        applyUrl: job.absolute_url ?? `https://boards.greenhouse.io/${companySlug}/jobs/${job.id}`,
        externalJobId: String(job.id),
        postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
      }));
    } catch (err) {
      console.error(`[Greenhouse] Failed for ${companySlug}:`, err);
      return [];
    }
  }

  async getJob(jobId: string, companySlug: string): Promise<ExtractedJob | null> {
    try {
      const resp = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs/${jobId}?questions=true`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!resp.ok) return null;
      const job = await resp.json() as {
        id: number;
        title: string;
        content?: string;
        location?: { name?: string };
        absolute_url?: string;
      };
      return {
        title: job.title,
        description: job.content ? stripHtml(job.content) : "",
        location: normalizeLocation(job.location?.name ?? ""),
        sourceUrl: job.absolute_url ?? "",
        applyUrl: job.absolute_url ?? "",
        externalJobId: String(job.id),
      };
    } catch {
      return null;
    }
  }
}

// ─── Lever Adapter ──────────────────────────────────────────────

export class LeverAdapter implements ATSAdapter {
  name = "lever";

  canHandle(url: string): boolean {
    return url.includes("lever.co");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/jobs\.lever\.co\/([^/]+)/);
    return m?.[1] ?? null;
  }

  async discoverJobs(companySlug: string): Promise<ExtractedJob[]> {
    try {
      const resp = await fetch(`https://api.lever.co/v0/postings/${companySlug}?mode=json`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return [];

      const jobs = await resp.json() as Array<{
        id?: string;
        text?: string;
        description?: string;
        descriptionPlain?: string;
        hostedUrl?: string;
        applyUrl?: string;
        workplaceType?: string;
        categories?: {
          location?: string;
          team?: string;
          commitment?: string;
        };
        createdAt?: number;
      }>;

      return jobs.map(job => ({
        title: job.text ?? "Unknown",
        description: job.descriptionPlain ?? stripHtml(job.description ?? ""),
        location: normalizeLocation(job.categories?.location ?? ""),
        sourceUrl: job.hostedUrl ?? `https://jobs.lever.co/${companySlug}/${job.id}`,
        applyUrl: job.applyUrl ?? job.hostedUrl ?? `https://jobs.lever.co/${companySlug}/${job.id}`,
        externalJobId: job.id,
        postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
      }));
    } catch (err) {
      console.error(`[Lever] Failed for ${companySlug}:`, err);
      return [];
    }
  }

  async getJob(jobId: string, companySlug: string): Promise<ExtractedJob | null> {
    try {
      const resp = await fetch(`https://api.lever.co/v0/postings/${companySlug}/${jobId}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) return null;
      const job = await resp.json() as {
        id?: string;
        text?: string;
        descriptionPlain?: string;
        hostedUrl?: string;
        categories?: { location?: string };
      };
      return {
        title: job.text ?? "",
        description: job.descriptionPlain ?? "",
        location: normalizeLocation(job.categories?.location ?? ""),
        sourceUrl: job.hostedUrl ?? "",
        applyUrl: job.hostedUrl ?? "",
        externalJobId: job.id,
      };
    } catch {
      return null;
    }
  }
}

// ─── Ashby Adapter ──────────────────────────────────────────────

export class AshbyAdapter implements ATSAdapter {
  name = "ashby";

  canHandle(url: string): boolean {
    return url.includes("ashbyhq.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/ashbyhq\.com\/([^/]+)/);
    return m?.[1] ?? null;
  }

  async discoverJobs(companySlug: string): Promise<ExtractedJob[]> {
    try {
      const resp = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${companySlug}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return [];

      const data = await resp.json() as {
        jobs?: Array<{
          id?: string;
          title?: string;
          descriptionHtml?: string;
          descriptionPlain?: string;
          location?: string;
          employmentType?: string;
          publishedAt?: string;
          jobUrl?: string;
        }>;
      };

      return (data.jobs ?? []).map(job => ({
        title: job.title ?? "",
        description: job.descriptionPlain ?? stripHtml(job.descriptionHtml ?? ""),
        location: normalizeLocation(job.location ?? ""),
        sourceUrl: job.jobUrl ?? `https://jobs.ashbyhq.com/${companySlug}/${job.id}`,
        applyUrl: job.jobUrl ?? `https://jobs.ashbyhq.com/${companySlug}/${job.id}`,
        externalJobId: job.id,
        postedAt: job.publishedAt ? new Date(job.publishedAt) : undefined,
      }));
    } catch (err) {
      console.error(`[Ashby] Failed for ${companySlug}:`, err);
      return [];
    }
  }

  async getJob(jobId: string, companySlug: string): Promise<ExtractedJob | null> {
    return null; // Ashby doesn't have a public single-job API
  }
}

// ─── Workday Adapter (Public CXS API) ───────────────────────────

export class WorkdayAdapter implements ATSAdapter {
  name = "workday";

  canHandle(url: string): boolean {
    return url.includes("myworkdayjobs.com") || url.includes("workday.com");
  }

  extractSlug(url: string): string | null {
    // e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite
    const m = url.match(/https?:\/\/([^.]+)\.[^/]*myworkdayjobs\.com\/([^/?#]+)/i);
    return m ? `${m[1]}/${m[2]}` : null;
  }

  async discoverJobs(identifier: string): Promise<ExtractedJob[]> {
    const [tenant, site = "careers"] = identifier.split("/");
    const fallbackUrl = `https://${tenant}.wd1.myworkdayjobs.com/en-US/${site}`;

    try {
      if (!tenant) return [];

      const endpoint = `https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Huntly/1.0" },
        body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0 }),
        signal: AbortSignal.timeout(12000),
      });

      if (!resp.ok) {
        console.warn(`[Workday] HTTP ${resp.status} for ${identifier}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const data = (await resp.json()) as {
        jobPostings?: Array<{
          title: string;
          externalPath: string;
          locationsText?: string;
          postedOn?: string;
          bulletFields?: string[];
        }>;
      };

      const jobs = (data.jobPostings ?? []).map((j) => {
        const fullUrl = `https://${tenant}.wd1.myworkdayjobs.com/en-US/${site}${j.externalPath}`;
        return {
          title: j.title ?? "Role",
          description: j.bulletFields?.join(" · ") ?? "",
          location: normalizeLocation(j.locationsText ?? ""),
          sourceUrl: fullUrl,
          applyUrl: fullUrl,
          externalJobId: j.externalPath?.replace(/^\//, ""),
          postedAt: j.postedOn ? new Date(j.postedOn) : undefined,
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[Workday] HTTP discover failed for ${identifier}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(_jobId: string, _companySlug: string): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── BambooHR Adapter ───────────────────────────────────────────

export class BambooHRAdapter implements ATSAdapter {
  name = "bamboohr";

  canHandle(url: string): boolean {
    return url.includes("bamboohr.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.bamboohr\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(subdomain: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${subdomain}.bamboohr.com/careers`;
    try {
      const resp = await fetch(`https://${subdomain}.bamboohr.com/careers/list`, {
        headers: { "Accept": "application/json", "User-Agent": "Huntly/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[BambooHR] HTTP ${resp.status} for ${subdomain}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const data = (await resp.json()) as {
        result?: Array<{
          id: string | number;
          jobOpeningName: string;
          location?: { city?: string; state?: string };
          department?: { label?: string };
        }>;
      };

      const jobs = (data.result ?? []).map((j) => {
        const loc = [j.location?.city, j.location?.state].filter(Boolean).join(", ");
        const url = `https://${subdomain}.bamboohr.com/careers/${j.id}`;
        return {
          title: j.jobOpeningName,
          description: j.department?.label ?? "",
          location: normalizeLocation(loc),
          sourceUrl: url,
          applyUrl: url,
          externalJobId: String(j.id),
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[BambooHR] HTTP discover failed for ${subdomain}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Breezy HR Adapter ──────────────────────────────────────────

export class BreezyHRAdapter implements ATSAdapter {
  name = "breezy";

  canHandle(url: string): boolean {
    return url.includes("breezy.hr");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.breezy\.hr/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${slug}.breezy.hr`;
    try {
      const resp = await fetch(`https://${slug}.breezy.hr/json`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[Breezy] HTTP ${resp.status} for ${slug}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const list = (await resp.json()) as Array<{
        id: string;
        name: string;
        url: string;
        location?: { name?: string };
        type?: { name?: string };
        department?: string;
        updated?: string;
      }>;

      const jobs = (list ?? []).map((j) => ({
        title: j.name,
        description: [j.department, j.type?.name].filter(Boolean).join(" · "),
        location: normalizeLocation(j.location?.name ?? ""),
        sourceUrl: j.url,
        applyUrl: j.url,
        externalJobId: j.id,
        postedAt: j.updated ? new Date(j.updated) : undefined,
      }));

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[Breezy] HTTP discover failed for ${slug}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Rippling Adapter ───────────────────────────────────────────

export class RipplingAdapter implements ATSAdapter {
  name = "rippling";

  canHandle(url: string): boolean {
    return url.includes("rippling.com") || url.includes("rippling-ats.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/(?:rippling\.com\/jobs\/|([a-z0-9-]+)\.rippling-ats\.com)/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://ats.rippling.com/${slug}/jobs`;
    try {
      const resp = await fetch(`https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[Rippling] HTTP ${resp.status} for ${slug}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const list = (await resp.json()) as Array<{
        id: string;
        name: string;
        url: string;
        department?: { name?: string };
        workLocation?: { name?: string };
      }>;

      const jobs = (list ?? []).map((j) => ({
        title: j.name,
        description: j.department?.name ?? "",
        location: normalizeLocation(j.workLocation?.name ?? ""),
        sourceUrl: j.url,
        applyUrl: j.url,
        externalJobId: j.id,
      }));

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[Rippling] HTTP discover failed for ${slug}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── SmartRecruiters Adapter ────────────────────────────────────

export class SmartRecruitersAdapter implements ATSAdapter {
  name = "smartrecruiters";

  canHandle(url: string): boolean {
    return url.includes("smartrecruiters.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/smartrecruiters\.com\/([^/?#]+)/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://careers.smartrecruiters.com/${slug}`;
    try {
      const resp = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[SmartRecruiters] HTTP ${resp.status} for ${slug}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const data = (await resp.json()) as {
        content?: Array<{
          id: string;
          name: string;
          location?: { fullLocation?: string };
          releasedDate?: string;
          function?: { label?: string };
        }>;
      };

      const jobs = (data.content ?? []).map((j) => ({
        title: j.name,
        description: j.function?.label ?? "",
        location: normalizeLocation(j.location?.fullLocation ?? ""),
        sourceUrl: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
        applyUrl: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
        externalJobId: j.id,
        postedAt: j.releasedDate ? new Date(j.releasedDate) : undefined,
      }));

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[SmartRecruiters] HTTP discover failed for ${slug}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Workable Adapter ───────────────────────────────────────────

export class WorkableAdapter implements ATSAdapter {
  name = "workable";

  canHandle(url: string): boolean {
    return url.includes("workable.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/apply\.workable\.com\/([^/?#]+)/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://apply.workable.com/${slug}`;
    try {
      const resp = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[Workable] HTTP ${resp.status} for ${slug}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const data = (await resp.json()) as {
        jobs?: Array<{
          shortcode: string;
          title: string;
          url: string;
          city?: string;
          country?: string;
          department?: string;
          published_on?: string;
        }>;
      };

      const jobs = (data.jobs ?? []).map((j) => {
        const loc = [j.city, j.country].filter(Boolean).join(", ");
        return {
          title: j.title,
          description: j.department ?? "",
          location: normalizeLocation(loc),
          sourceUrl: j.url,
          applyUrl: j.url,
          externalJobId: j.shortcode,
          postedAt: j.published_on ? new Date(j.published_on) : undefined,
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[Workable] HTTP discover failed for ${slug}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Recruitee Adapter ──────────────────────────────────────────

export class RecruiteeAdapter implements ATSAdapter {
  name = "recruitee";

  canHandle(url: string): boolean {
    return url.includes("recruitee.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.recruitee\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${slug}.recruitee.com`;
    try {
      const resp = await fetch(`https://${slug}.recruitee.com/api/offers/`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) {
        console.warn(`[Recruitee] HTTP ${resp.status} for ${slug}, attempting web browser fallback...`);
        return await webBrowserFallback(fallbackUrl);
      }

      const data = (await resp.json()) as {
        offers?: Array<{
          id: number;
          title: string;
          careers_url: string;
          location?: string;
          department?: string;
          published_at?: string;
        }>;
      };

      const jobs = (data.offers ?? []).map((j) => ({
        title: j.title,
        description: j.department ?? "",
        location: normalizeLocation(j.location ?? ""),
        sourceUrl: j.careers_url,
        applyUrl: j.careers_url,
        externalJobId: String(j.id),
        postedAt: j.published_at ? new Date(j.published_at) : undefined,
      }));

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch (err: any) {
      console.warn(`[Recruitee] HTTP discover failed for ${slug}, falling back to web browser:`, err?.message);
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Pinpoint Adapter ───────────────────────────────────────────

export class PinpointAdapter implements ATSAdapter {
  name = "pinpoint";

  canHandle(url: string): boolean {
    return url.includes("pinpointhq.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.pinpointhq\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${slug}.pinpointhq.com`;
    try {
      const resp = await fetch(`https://${slug}.pinpointhq.com/postings.json`, {
        headers: { Accept: "application/json", "User-Agent": "Huntly/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return await webBrowserFallback(fallbackUrl);

      const data = (await resp.json()) as {
        data?: Array<{
          id: string | number;
          title: string;
          url: string;
          description?: string;
          key_responsibilities?: string;
          skills_knowledge_expertise?: string;
          workplace_type?: string;
          location?: { city?: string; province?: string; name?: string };
        }>;
      };

      const jobs = (data.data ?? []).map((j) => {
        const loc = [j.location?.city, j.location?.province, j.location?.name].filter(Boolean).join(", ");
        const body = [j.description, j.key_responsibilities, j.skills_knowledge_expertise].filter(Boolean).join("\n\n");
        return {
          title: j.title,
          description: stripHtml(body),
          location: normalizeLocation(loc || (j.workplace_type === "remote" ? "Remote" : "")),
          sourceUrl: j.url,
          applyUrl: j.url,
          externalJobId: String(j.id),
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch {
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Keka Adapter (India & Global Tech) ─────────────────────────

export class KekaAdapter implements ATSAdapter {
  name = "keka";

  canHandle(url: string): boolean {
    return url.includes("keka.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.keka\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${slug}.keka.com/careers`;
    try {
      const resp = await fetch(`https://${slug}.keka.com/careers/api/jobs/default/active`, {
        headers: { Accept: "application/json", "User-Agent": "Huntly/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return await webBrowserFallback(fallbackUrl);

      const list = (await resp.json()) as Array<{
        id: string;
        title: string;
        jobDescription?: string;
        department?: { title?: string };
        jobLocations?: Array<{ city?: string; state?: string; country?: string }>;
        isRemote?: boolean;
        datePosted?: string;
      }>;

      const jobs = (list ?? []).map((j) => {
        const firstLoc = j.jobLocations?.[0];
        const loc = firstLoc ? [firstLoc.city, firstLoc.state, firstLoc.country].filter(Boolean).join(", ") : "";
        const url = `https://${slug}.keka.com/careers/jobdetails/${j.id}`;
        return {
          title: j.title,
          description: stripHtml(j.jobDescription ?? j.department?.title ?? ""),
          location: normalizeLocation(loc || (j.isRemote ? "Remote" : "")),
          sourceUrl: url,
          applyUrl: url,
          externalJobId: j.id,
          postedAt: j.datePosted ? new Date(j.datePosted) : undefined,
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch {
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Teamtailor Adapter ─────────────────────────────────────────

export class TeamtailorAdapter implements ATSAdapter {
  name = "teamtailor";

  canHandle(url: string): boolean {
    return url.includes("teamtailor.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.teamtailor\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const url = `https://${slug}.teamtailor.com/jobs`;
    return await webBrowserFallback(url);
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── JazzHR Adapter ─────────────────────────────────────────────

export class JazzHRAdapter implements ATSAdapter {
  name = "jazzhr";

  canHandle(url: string): boolean {
    return url.includes("applytojob.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.applytojob\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const url = `https://${slug}.applytojob.com/apply`;
    return await webBrowserFallback(url);
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Join.com Adapter ───────────────────────────────────────────

export class JoinAdapter implements ATSAdapter {
  name = "join";

  canHandle(url: string): boolean {
    return url.includes("join.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/join\.com\/(?:companies|jobs)\/([^/?#]+)/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://join.com/companies/${slug}`;
    try {
      const resp = await fetch(`https://api.join.com/v1/companies/${slug}/jobs?pageSize=25`, {
        headers: { Accept: "application/json", "User-Agent": "Huntly/1.0" },
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return await webBrowserFallback(fallbackUrl);

      const data = (await resp.json()) as {
        jobs?: Array<{
          id: number | string;
          title: string;
          workplaceType?: string;
          city?: { cityName?: string; countryName?: string };
          createdAt?: string;
        }>;
      };

      const jobs = (data.jobs ?? []).map((j) => {
        const loc = [j.city?.cityName, j.city?.countryName].filter(Boolean).join(", ");
        const url = `https://join.com/companies/${slug}/jobs/${j.id}`;
        return {
          title: j.title,
          description: "",
          location: normalizeLocation(loc || (j.workplaceType === "remote" ? "Remote" : "")),
          sourceUrl: url,
          applyUrl: url,
          externalJobId: String(j.id),
          postedAt: j.createdAt ? new Date(j.createdAt) : undefined,
        };
      });

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch {
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Zoho Recruit Adapter ───────────────────────────────────────

export class ZohoAdapter implements ATSAdapter {
  name = "zohorecruit";

  canHandle(url: string): boolean {
    return url.includes("zohorecruit.com") || url.includes("zohorecruit.eu");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.zohorecruit\.[a-z]+/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const url = `https://${slug}.zohorecruit.com/jobs/Careers`;
    return await webBrowserFallback(url);
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── iCIMS Adapter ──────────────────────────────────────────────

export class ICIMSAdapter implements ATSAdapter {
  name = "icims";

  canHandle(url: string): boolean {
    return url.includes("icims.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/careers-([^.]+)\.icims\.com/i) || url.match(/([^.]+)\.icims\.com/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const url = `https://careers-${slug}.icims.com/jobs/search`;
    return await webBrowserFallback(url);
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Personio Adapter ───────────────────────────────────────────

export class PersonioAdapter implements ATSAdapter {
  name = "personio";

  canHandle(url: string): boolean {
    return url.includes("personio.de") || url.includes("personio.com");
  }

  extractSlug(url: string): string | null {
    const m = url.match(/https?:\/\/([^.]+)\.jobs\.personio\.[a-z]+/i);
    return m?.[1] ?? null;
  }

  async discoverJobs(slug: string): Promise<ExtractedJob[]> {
    const fallbackUrl = `https://${slug}.jobs.personio.com`;
    try {
      const resp = await fetch(`https://${slug}.jobs.personio.de/xml`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!resp.ok) return await webBrowserFallback(fallbackUrl);

      const text = await resp.text();
      const matches = [...text.matchAll(/<position>([\s\S]*?)<\/position>/gi)];
      const jobs: ExtractedJob[] = [];

      for (const m of matches) {
        const block = m[1] ?? "";
        const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
        const title = block.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? "";
        const office = block.match(/<office>([\s\S]*?)<\/office>/)?.[1]?.trim() ?? "";
        if (title) {
          const jobUrl = `https://${slug}.jobs.personio.de/job/${id}`;
          jobs.push({
            title,
            description: "",
            location: normalizeLocation(office),
            sourceUrl: jobUrl,
            applyUrl: jobUrl,
            externalJobId: id,
          });
        }
      }

      return jobs.length > 0 ? jobs : await webBrowserFallback(fallbackUrl);
    } catch {
      return await webBrowserFallback(fallbackUrl);
    }
  }

  async getJob(): Promise<ExtractedJob | null> {
    return null;
  }
}

// ─── Adapter Registry ───────────────────────────────────────────

export const ATS_ADAPTERS: ATSAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  new WorkdayAdapter(),
  new BambooHRAdapter(),
  new BreezyHRAdapter(),
  new RipplingAdapter(),
  new SmartRecruitersAdapter(),
  new WorkableAdapter(),
  new RecruiteeAdapter(),
  new PinpointAdapter(),
  new KekaAdapter(),
  new TeamtailorAdapter(),
  new JazzHRAdapter(),
  new JoinAdapter(),
  new ZohoAdapter(),
  new ICIMSAdapter(),
  new PersonioAdapter(),
];

export function getATSAdapter(atsName: string): ATSAdapter | null {
  return ATS_ADAPTERS.find((a) => a.name === atsName) ?? null;
}

export function extractATSSlug(url: string, ats?: string): string | null {
  for (const adapter of ATS_ADAPTERS) {
    if (ats && adapter.name !== ats) continue;
    if (adapter.canHandle(url)) {
      if ("extractSlug" in adapter && typeof (adapter as any).extractSlug === "function") {
        const slug = (adapter as any).extractSlug(url);
        if (slug) return slug;
      }
    }
  }
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
