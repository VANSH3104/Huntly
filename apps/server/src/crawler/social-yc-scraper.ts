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
  platform: "twitter" | "yc" | "hn";
  postedAt?: Date;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryFormatted?: string;
  equityRange?: string;
  ycBatch?: string;
  founderHandle?: string;
  contactEmail?: string;
}

export interface ParsedCompensation {
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryFormatted?: string;
  equityRange?: string;
  ycBatch?: string;
  founderHandle?: string;
  contactEmail?: string;
}

/**
 * Extracts salary, equity, YC batch, founder handle, and email from text
 */
export function extractMetadataFromText(text: string): ParsedCompensation {
  const res: ParsedCompensation = {};

  // 1. Extract YC Batch (e.g. YC W24, YC S23, YC W25, Y Combinator W24)
  const ycMatch = text.match(/\b(?:YC|Y\s*Combinator)\s*([WSFwsf]\d{2}|\d{4})\b/i);
  if (ycMatch) {
    res.ycBatch = `YC ${ycMatch[1].toUpperCase()}`;
  }

  // 2. Extract Twitter handle (e.g. @founder_name or /username)
  const handleMatch = text.match(/(?:^|\s)@([a-zA-Z0-9_]{3,20})\b/);
  if (handleMatch?.[1] && !["gmail", "yahoo", "hotmail", "here", "team", "all"].includes(handleMatch[1].toLowerCase())) {
    res.founderHandle = `@${handleMatch[1]}`;
  }

  // 3. Extract direct contact email
  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i);
  if (emailMatch?.[1] && !emailMatch[1].endsWith(".png") && !emailMatch[1].endsWith(".jpg")) {
    res.contactEmail = emailMatch[1].toLowerCase();
  }

  // 4. Extract Equity Range (e.g. 0.5% - 1.5% equity, 1% equity, 0.25%-0.75%)
  const equityMatch = text.match(/(\d+(?:\.\d+)?\s*%\s*(?:-|to)\s*\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*%\s*equity|\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?\s*%\s*equity)/i);
  if (equityMatch) {
    res.equityRange = equityMatch[1].trim();
  }

  // 5. Extract USD Salary ($120k - $180k or $120,000 - $180,000)
  const usdMatch = text.match(/\$\s*(\d{2,3}(?:,\d{3})*|\d{2,3})\s*(?:k|K)?\s*(?:-|to|–)\s*\$?\s*(\d{2,3}(?:,\d{3})*|\d{2,3})\s*(?:k|K)?/);
  if (usdMatch?.[1] && usdMatch?.[2]) {
    let min = parseInt(usdMatch[1].replace(/,/g, ""), 10);
    let max = parseInt(usdMatch[2].replace(/,/g, ""), 10);
    if (min < 1000) min *= 1000;
    if (max < 1000) max *= 1000;
    res.salaryMin = min;
    res.salaryMax = max;
    res.salaryCurrency = "USD";
    res.salaryFormatted = `$${Math.round(min / 1000)}k - $${Math.round(max / 1000)}k`;
  }

  // 6. Extract INR Salary (e.g. 15-25 LPA or ₹15L - ₹25L)
  if (!res.salaryFormatted) {
    const inrMatch = text.match(/(?:₹|INR|Rs\.?)\s*(\d{1,2}(?:\.\d+)?)\s*(?:-|to|–)\s*(\d{1,2}(?:\.\d+)?)\s*(?:LPA|L|lakhs?|lac)/i) ||
                     text.match(/(\d{1,2}(?:\.\d+)?)\s*(?:-|to|–)\s*(\d{1,2}(?:\.\d+)?)\s*(?:LPA|lakhs?\s*per\s*annum)/i);
    if (inrMatch?.[1] && inrMatch?.[2]) {
      const minL = parseFloat(inrMatch[1]);
      const maxL = parseFloat(inrMatch[2]);
      res.salaryMin = Math.round(minL * 100000);
      res.salaryMax = Math.round(maxL * 100000);
      res.salaryCurrency = "INR";
      res.salaryFormatted = `₹${minL} - ₹${maxL} LPA`;
    }
  }

  return res;
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
      let handle: string | undefined;
      const handleMatch = item.title.match(/([A-Za-z0-9_]+)\s*\(@([A-Za-z0-9_]+)\)/i);
      if (handleMatch?.[1]) {
        company = handleMatch[1].trim();
        handle = `@${handleMatch[2]}`;
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

      const fullSnippet = `${item.title} ${item.snippet}`;
      const meta = extractMetadataFromText(fullSnippet);

      jobItems.push({
        id: uuidv4(),
        title,
        companyName: company,
        location: loc || "Remote / Global",
        url: item.url,
        description: `Direct hiring tweet from ${company} on X (Twitter):\n\n${item.snippet}\n\nApply or DM directly via: ${item.url}`,
        platform: "twitter",
        postedAt: new Date(),
        founderHandle: handle || meta.founderHandle,
        contactEmail: meta.contactEmail,
        salaryMin: meta.salaryMin,
        salaryMax: meta.salaryMax,
        salaryCurrency: meta.salaryCurrency,
        salaryFormatted: meta.salaryFormatted,
        equityRange: meta.equityRange,
        ycBatch: meta.ycBatch,
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

      const fullSnippet = `${item.title} ${item.snippet}`;
      const meta = extractMetadataFromText(fullSnippet);

      jobItems.push({
        id: uuidv4(),
        title: title.slice(0, 100),
        companyName: company.slice(0, 80),
        location: loc || "Remote / YC Network",
        url: item.url,
        description: `Verified Y Combinator startup opening at ${company} ${meta.ycBatch ? `(${meta.ycBatch})` : ""}:\n\n${item.snippet}\n\nView and apply directly: ${item.url}`,
        platform: "yc",
        postedAt: new Date(),
        ycBatch: meta.ycBatch || "YC Startup",
        salaryMin: meta.salaryMin,
        salaryMax: meta.salaryMax,
        salaryCurrency: meta.salaryCurrency,
        salaryFormatted: meta.salaryFormatted,
        equityRange: meta.equityRange,
        contactEmail: meta.contactEmail,
      });
    }

    return jobItems;
  }

  /**
   * Scrapes unlisted founder job posts from the monthly "Ask HN: Who is hiring?" thread
   */
  async scrapeHNJobs(options: {
    keywords?: string;
    role?: string;
    limit?: number;
  }): Promise<SocialJobItem[]> {
    const role = (options.role || options.keywords || "Software Engineer").toLowerCase();
    const limit = options.limit || 30;
    const jobItems: SocialJobItem[] = [];

    try {
      // 1. Search Hacker News Algolia API for the most recent "Ask HN: Who is hiring?" thread
      const searchUrl = `https://hn.algolia.com/api/v1/search?tags=story,author_whoishiring&query=Ask+HN:+Who+is+hiring&hitsPerPage=2`;
      const threadRes = await fetch(searchUrl, {
        headers: { "User-Agent": "AgentForge/1.0" },
      });

      if (!threadRes.ok) return [];
      const threadData = await threadRes.json();
      const latestThread = threadData.hits?.[0];
      if (!latestThread?.objectID) return [];

      const storyId = latestThread.objectID;

      // 2. Fetch top hiring comments in this story
      const commentsUrl = `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=60`;
      const commentsRes = await fetch(commentsUrl, {
        headers: { "User-Agent": "AgentForge/1.0" },
      });

      if (!commentsRes.ok) return [];
      const commentsData = await commentsRes.json();
      const hits = commentsData.hits || [];

      for (const hit of hits) {
        if (jobItems.length >= limit) break;
        const commentText = hit.comment_text || "";
        if (!commentText || commentText.length < 50) continue;

        // Clean HTML tags
        const cleanText = commentText
          .replace(/<p>/g, "\n\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();

        // Check if relevant to role
        if (!cleanText.toLowerCase().includes(role) && !cleanText.toLowerCase().includes("engineer") && !cleanText.toLowerCase().includes("developer")) {
          continue;
        }

        // Top line format usually: Company | Title/Role | Location | Remote | Full-Time | Salary
        const firstLine = cleanText.split("\n")[0] || cleanText.slice(0, 120);
        const parts = firstLine.split(/\||–|-/).map((p: string) => p.trim()).filter(Boolean);

        const company = parts[0] || "HN Tech Company";
        const title = parts[1] || `${role.charAt(0).toUpperCase() + role.slice(1)}`;
        const location = parts[2] || (/remote/i.test(cleanText) ? "Remote" : "Global / Onsite");

        const meta = extractMetadataFromText(cleanText);
        const itemUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;

        jobItems.push({
          id: uuidv4(),
          title: title.slice(0, 100),
          companyName: company.slice(0, 80),
          location,
          url: itemUrl,
          description: `Direct Founder / Engineering Lead post on Hacker News ("${latestThread.title}"):\n\n${cleanText.slice(0, 800)}...\n\nDirect Thread Comment: ${itemUrl}`,
          platform: "hn",
          postedAt: hit.created_at ? new Date(hit.created_at) : new Date(),
          founderHandle: hit.author ? `@${hit.author}` : undefined,
          contactEmail: meta.contactEmail,
          salaryMin: meta.salaryMin,
          salaryMax: meta.salaryMax,
          salaryCurrency: meta.salaryCurrency,
          salaryFormatted: meta.salaryFormatted,
          equityRange: meta.equityRange,
          ycBatch: meta.ycBatch,
        });
      }
    } catch (err: any) {
      console.warn("[SocialYCScraper] Error fetching Hacker News jobs:", err?.message);
    }

    return jobItems;
  }

  /**
   * Ingests scraped Twitter / YC / HN jobs into the database
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
        
        // Add parsed metadata into skills list for instant badge visibility
        if (item.ycBatch) extractedSkills.push(item.ycBatch);
        if (item.equityRange) extractedSkills.push(`Equity: ${item.equityRange}`);
        if (item.salaryFormatted) extractedSkills.push(`Pay: ${item.salaryFormatted}`);

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
            country: isRemote ? undefined : "Global",
            remote: isRemote,
            remoteType: isRemote ? "FULLY_REMOTE" : "ON_SITE",
            salaryMin: item.salaryMin,
            salaryMax: item.salaryMax,
            salaryCurrency: item.salaryCurrency,
            salaryFormatted: item.salaryFormatted,
            equityRange: item.equityRange,
            ycBatch: item.ycBatch,
            founderHandle: item.founderHandle,
            contactEmail: item.contactEmail,
            platform: item.platform,
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
