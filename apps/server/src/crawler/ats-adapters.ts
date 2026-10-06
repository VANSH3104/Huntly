/**
 * ATS Adapters — each adapter handles a specific ATS platform's API
 * to extract jobs without relying on HTML scraping.
 */

import type { ExtractedJob } from "./extractor.js";
import { normalizeLocation } from "../utils/normalize.js";

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
        headers: { "User-Agent": "AgentForge/1.0" },
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

// ─── Adapter Registry ───────────────────────────────────────────

export const ATS_ADAPTERS: ATSAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
];

export function getATSAdapter(atsName: string): ATSAdapter | null {
  return ATS_ADAPTERS.find(a => a.name === atsName) ?? null;
}

export function extractATSSlug(url: string, ats?: string): string | null {
  if (!ats || ats === "greenhouse" || url.includes("greenhouse.io")) {
    const m = url.match(/greenhouse\.io\/([^/]+)/);
    if (m?.[1] && m[1] !== "embed" && m[1] !== "jobs") return m[1];
  }
  if (!ats || ats === "lever" || url.includes("lever.co")) {
    const m = url.match(/jobs\.lever\.co\/([^/]+)/);
    if (m?.[1]) return m[1];
  }
  if (!ats || ats === "ashby" || url.includes("ashbyhq.com")) {
    const m = url.match(/jobs\.ashbyhq\.com\/([^/]+)/);
    if (m?.[1]) return m[1];
  }
  return null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}
