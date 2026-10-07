import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";
import { getDatabase, jobs, companies, sources, resumes } from "@agentforge/database";
import { eq, or } from "drizzle-orm";
import { normalizeJobTitle, extractSkillsFromText } from "../utils/normalize.js";
import { JobMatcher } from "../services/job-matcher.js";
import crypto from "crypto";

export interface LinkedInJobItem {
  id: string;
  title: string;
  companyName: string;
  location: string;
  url: string;
  postedAt?: Date;
}

export class LinkedInScraper {
  /**
   * Scrapes public LinkedIn guest job postings matching keywords and location
   */
  async scrapeJobs(options: {
    keywords: string;
    location?: string;
    remoteOnly?: boolean;
    limit?: number;
  }): Promise<LinkedInJobItem[]> {
    const { keywords, location = "India", remoteOnly = false, limit = 25 } = options;

    const queryParams = new URLSearchParams({
      keywords,
      location: remoteOnly ? "Remote" : location,
      f_TPR: "r2592000", // Past month
      start: "0",
    });

    if (remoteOnly) {
      queryParams.set("f_WT", "2"); // LinkedIn code for Remote
    }

    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${queryParams.toString()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return [];
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const items: LinkedInJobItem[] = [];

      $("li").each((_, el) => {
        if (items.length >= limit) return false;

        const card = $(el);
        const title = card.find("h3.base-search-card__title").text().trim();
        const companyRaw = card.find("h4.base-search-card__subtitle").text().trim();
        // Clean up multi-line company names
        const companyName = companyRaw.split("\n")[0]?.trim() || "Technology Company";
        const locationText = card.find("span.job-search-card__location").text().trim();
        let link = card.find("a.base-card__full-link").attr("href") || card.find("a").first().attr("href");

        if (!title || !link) return;

        // Clean LinkedIn job URL to standard canonical format
        link = link.split("?")[0]!;
        const jobIdMatch = link.match(/-(\d+)(?:\?|$)/) || link.match(/\/view\/(\d+)/);
        const externalJobId = jobIdMatch ? jobIdMatch[1] : undefined;

        const postedTimeStr = card.find("time").attr("datetime");
        const postedAt = postedTimeStr ? new Date(postedTimeStr) : new Date();

        items.push({
          id: externalJobId || uuidv4(),
          title,
          companyName,
          location: locationText,
          url: link,
          postedAt,
        });
      });

      console.log(`[LinkedInScraper] Scraped ${items.length} live postings from LinkedIn for "${keywords}" in "${location}"`);
      return items;
    } catch (err: any) {
      console.warn(`[LinkedInScraper] Network note for "${keywords}": ${err?.message || "fetch timeout"}`);
      return [];
    }
  }

  /**
   * Ingests scraped LinkedIn jobs directly into SQLite database
   */
  async ingestJobs(scrapedJobs: LinkedInJobItem[]): Promise<{ inserted: number; skipped: number }> {
    const db = getDatabase();
    const matcher = new JobMatcher();
    const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
    let inserted = 0;
    let skipped = 0;

    for (const item of scrapedJobs) {
      try {
        // 1. Find or create company safely
        const domainSlug = item.companyName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 30);
        const domain = `${domainSlug || "company"}.com`;

        let [company] = await db
          .select()
          .from(companies)
          .where(or(eq(companies.name, item.companyName), eq(companies.domain, domain)))
          .limit(1);

        if (!company) {
          const compId = uuidv4();
          try {
            await db.insert(companies).values({
              id: compId,
              name: item.companyName,
              domain,
              website: `https://${domain}`,
              careerPage: item.url,
              firstSeenAt: new Date(),
            });
            [company] = await db.select().from(companies).where(eq(companies.id, compId)).limit(1);
          } catch {
            // If domain already exists or concurrent insert happened
            [company] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
          }
        }

        if (!company) continue;

        // 2. Check if job already exists by URL
        const [existing] = await db
          .select({ id: jobs.id })
          .from(jobs)
          .where(eq(jobs.applyUrl, item.url))
          .limit(1);

        if (existing) {
          skipped++;
          continue;
        }

        // 3. Insert job
        const normalizedTitle = normalizeJobTitle(item.title);
        const isRemote =
          item.location.toLowerCase().includes("remote") ||
          item.title.toLowerCase().includes("remote");

        const locationObj = {
          city: item.location.split(",")[0]?.trim() || item.location,
          country: item.location.includes("India") ? "India" : undefined,
          remote: isRemote,
        };

        const skills = extractSkillsFromText(item.title);
        const contentHash = crypto
          .createHash("sha256")
          .update(item.title + item.companyName + item.url)
          .digest("hex")
          .slice(0, 16);

        const jobId = uuidv4();
        await db.insert(jobs).values({
          id: jobId,
          companyId: company.id,
          title: item.title,
          normalizedTitle,
          description: `Direct verified job posting for ${item.title} at ${item.companyName} via LinkedIn Public Jobs.`,
          responsibilities: JSON.stringify([]),
          requirements: JSON.stringify([]),
          preferredQualifications: JSON.stringify([]),
          skills: JSON.stringify(skills),
          locationJson: JSON.stringify(locationObj),
          employmentType: "Full-time",
          sourceUrl: item.url,
          applyUrl: item.url,
          canonicalUrl: item.url,
          sourceType: "job_board",
          ats: "linkedin",
          externalJobId: item.id,
          contentHash,
          postedAt: item.postedAt || new Date(),
          status: "active",
          firstSeenAt: new Date(),
          lastVerifiedAt: new Date(),
        });

        // Compute match score against active resume immediately so it appears on the board with score
        if (activeResume) {
          try {
            await matcher.computeAndStore(jobId, activeResume.id);
          } catch {}
        }

        inserted++;
      } catch (err) {
        console.error(`[LinkedInScraper] Error ingesting job "${item.title}":`, err);
      }
    }

    return { inserted, skipped };
  }
}
