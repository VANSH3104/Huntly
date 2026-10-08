import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getDatabase, jobs, companies, sources, resumes } from "@agentforge/database";
import { eq, or } from "drizzle-orm";
import { normalizeJobTitle, extractSkillsFromText } from "../utils/normalize.js";
import { JobMatcher } from "../services/job-matcher.js";
import { SerperSearchProvider, SearchResult } from "./search-provider.js";

export interface SocialJobItem {
  id: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  description: string;
  platform: "twitter" | "yc";
  postedAt?: Date;
}

export class SocialAndYCScraper {
  private serper: SerperSearchProvider | null = null;

  constructor() {
    const key = process.env["SERPER_API_KEY"];
    if (key && key.trim()) {
      this.serper = new SerperSearchProvider(key.trim());
    }
  }

  /**
   * Scrapes live hiring tweets & founder posts from X (Twitter)
   */
  async scrapeTwitterJobs(options: {
    keywords?: string;
    role?: string;
    location?: string;
    limit?: number;
  }): Promise<SocialJobItem[]> {
    if (!this.serper) return [];

    const role = options.role || options.keywords || "Software Engineer";
    const loc = options.location || "";
    const limit = options.limit || 20;

    const searchQueries = [
      `site:x.com ("we are hiring" OR "we're hiring" OR "looking for intern" OR "hiring software engineer" OR "join our team") "${role}" ${loc}`,
      `site:twitter.com ("hiring" OR "looking for developer" OR "internship opening" OR "founding engineer") "${role}"`,
    ];

    const allResults: SearchResult[] = [];
    for (const q of searchQueries) {
      const results = await this.serper.search(q);
      allResults.push(...results);
    }

    const jobItems: SocialJobItem[] = [];
    const seenUrls = new Set<string>();

    for (const item of allResults) {
      if (jobItems.length >= limit) break;
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      // Parse handle or company from tweet title e.g. "Name (@handle) on X: ..."
      let company = "Tech Startup";
      const handleMatch = item.title.match(/([A-Za-z0-9_]+)\s*\(@([A-Za-z0-9_]+)\)/i);
      if (handleMatch?.[1]) {
        company = handleMatch[1].trim();
      } else {
        const xAuthorMatch = item.title.match(/^([^:]+)\s+on\s+(?:X|Twitter)/i);
        if (xAuthorMatch?.[1]) {
          company = xAuthorMatch[1].trim();
        }
      }

      // Extract a clean title
      let title = role;
      if (/intern/i.test(item.snippet) || /intern/i.test(item.title)) {
        title = `${role} Intern`;
      } else if (/founding/i.test(item.snippet)) {
        title = `Founding ${role}`;
      } else if (/senior/i.test(item.snippet)) {
        title = `Senior ${role}`;
      }

      jobItems.push({
        id: uuidv4(),
        title,
        companyName: company,
        location: loc || "Remote / Global",
        url: item.url,
        description: `Direct hiring tweet from ${company} on X (Twitter):\n\n${item.snippet}\n\nApply or DM directly via: ${item.url}`,
        platform: "twitter",
        postedAt: new Date(),
      });
    }

    return jobItems;
  }

  /**
   * Scrapes live Y Combinator startup job postings (jobs.ycombinator.com & Work at a Startup)
   */
  async scrapeYCJobs(options: {
    keywords?: string;
    role?: string;
    location?: string;
    limit?: number;
  }): Promise<SocialJobItem[]> {
    if (!this.serper) return [];

    const role = options.role || options.keywords || "Software Engineer";
    const loc = options.location || "";
    const limit = options.limit || 25;

    const searchQueries = [
      `site:workatastartup.com/jobs "${role}" ${loc}`,
      `site:ycombinator.com/companies/jobs "${role}"`,
      `site:jobs.ashbyhq.com "Y Combinator" "${role}"`,
      `site:boards.greenhouse.io "YC" "${role}"`,
    ];

    const allResults: SearchResult[] = [];
    for (const q of searchQueries) {
      const results = await this.serper.search(q);
      allResults.push(...results);
    }

    const jobItems: SocialJobItem[] = [];
    const seenUrls = new Set<string>();

    for (const item of allResults) {
      if (jobItems.length >= limit) break;
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      // Parse company name from title e.g. "Software Engineer at Acme (YC W24)"
      let company = "YC Startup";
      let title = item.title;

      const atMatch = item.title.match(/^(.*?)\s+(?:at|@)\s+([^(| -]+)/i);
      if (atMatch?.[1] && atMatch?.[2]) {
        title = atMatch[1].trim();
        company = atMatch[2].trim();
      } else {
        const dashMatch = item.title.match(/^(.*?)\s*[-|]\s*([^(| -]+)/);
        if (dashMatch?.[1] && dashMatch?.[2]) {
          title = dashMatch[1].trim();
          company = dashMatch[2].trim();
        }
      }

      jobItems.push({
        id: uuidv4(),
        title: title.slice(0, 100),
        companyName: company.slice(0, 80),
        location: loc || "Remote / YC Network",
        url: item.url,
        description: `Verified Y Combinator startup opening at ${company}:\n\n${item.snippet}\n\nView and apply directly: ${item.url}`,
        platform: "yc",
        postedAt: new Date(),
      });
    }

    return jobItems;
  }

  /**
   * Ingests scraped Twitter / YC jobs into the database
   */
  async ingestJobs(items: SocialJobItem[]): Promise<{ added: number; updated: number; matched: number }> {
    if (items.length === 0) return { added: 0, updated: 0, matched: 0 };

    const db = getDatabase();
    let added = 0;
    let matched = 0;

    const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
    const matcher = new JobMatcher();

    for (const item of items) {
      try {
        // Clean company name and domain
        const cleanCompanyName = item.companyName.replace(/[^a-zA-Z0-9\s]/g, "").trim() || "Tech Employer";
        const domain = `${cleanCompanyName.toLowerCase().replace(/\s+/g, "")}.com`;

        // Upsert company
        const [existingCompany] = await db
          .select()
          .from(companies)
          .where(or(eq(companies.name, cleanCompanyName), eq(companies.domain, domain)))
          .limit(1);

        let companyId: string;
        if (existingCompany) {
          companyId = existingCompany.id;
        } else {
          companyId = uuidv4();
          await db.insert(companies).values({
            id: companyId,
            name: cleanCompanyName,
            domain,
            companyType: item.platform === "yc" ? "STARTUP" : "PRIVATE",
            industry: "Technology",
            ats: item.platform,
            careerPage: item.url,
          });
        }

        // Check if job already exists by URL
        const [existingJob] = await db
          .select()
          .from(jobs)
          .where(eq(jobs.sourceUrl, item.url))
          .limit(1);

        if (existingJob) continue;

        const normalizedTitle = normalizeJobTitle(item.title);
        const extractedSkills = extractSkillsFromText(`${item.title} ${item.description}`);
        const contentHash = crypto
          .createHash("sha256")
          .update(`${item.title}:${cleanCompanyName}:${item.url}`)
          .digest("hex")
          .slice(0, 16);

        const jobId = uuidv4();
        const isRemote = /remote/i.test(item.location) || /remote/i.test(item.description);

        await db.insert(jobs).values({
          id: jobId,
          companyId,
          title: item.title,
          normalizedTitle,
          description: item.description,
          skills: JSON.stringify(extractedSkills),
          locationJson: JSON.stringify({
            city: isRemote ? undefined : item.location,
            country: isRemote ? undefined : "India",
            remote: isRemote,
            remoteType: isRemote ? "FULLY_REMOTE" : "ON_SITE",
          }),
          postedAt: item.postedAt ?? new Date(),
          sourceUrl: item.url,
          applyUrl: item.url,
          sourceType: "job_board",
          ats: item.platform,
          externalJobId: item.id,
          contentHash,
          status: "active",
        });

        added++;

        // Compute match score against active resume
        if (activeResume) {
          await matcher.computeAndStore(jobId, activeResume.id);
          matched++;
        }
      } catch (err: any) {
        console.warn(`[SocialYCScraper] Ingest error for ${item.title}:`, err?.message);
      }
    }

    return { added, updated: 0, matched };
  }
}

export const socialAndYCScraper = new SocialAndYCScraper();
