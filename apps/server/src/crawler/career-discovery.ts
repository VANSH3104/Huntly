import * as cheerio from "cheerio";
import { CAREER_PATH_CANDIDATES } from "@agentforge/shared";

export interface CareerPageResult {
  url: string;
  ats: string | null;
  confidence: number;
}

// ─── ATS Detection ──────────────────────────────────────────────

const ATS_PATTERNS: Array<{ name: string; patterns: (string | RegExp)[] }> = [
  {
    name: "greenhouse",
    patterns: ["greenhouse.io", "boards.greenhouse.io", /greenhouse/i],
  },
  {
    name: "lever",
    patterns: ["lever.co", "jobs.lever.co", /lever\.co/],
  },
  {
    name: "ashby",
    patterns: ["ashbyhq.com", "jobs.ashbyhq.com", /ashby/i],
  },
  {
    name: "workday",
    patterns: ["myworkdayjobs.com", "workday.com", /workday/i],
  },
  {
    name: "smartrecruiters",
    patterns: ["smartrecruiters.com", /smartrecruiters/i],
  },
  {
    name: "workable",
    patterns: ["apply.workable.com", "workable.com", /workable/i],
  },
  {
    name: "bamboohr",
    patterns: ["bamboohr.com", /bamboohr/i],
  },
  {
    name: "icims",
    patterns: ["icims.com", /\.icims\.com/],
  },
  {
    name: "jobvite",
    patterns: ["jobs.jobvite.com", /jobvite/i],
  },
  {
    name: "recruitee",
    patterns: ["recruitee.com", /\.recruitee\.com/],
  },
  {
    name: "teamtailor",
    patterns: ["teamtailor.com", /teamtailor/i],
  },
  {
    name: "rippling",
    patterns: ["rippling.com/jobs", /rippling/i],
  },
  {
    name: "personio",
    patterns: ["personio.de", /personio/i],
  },
  {
    name: "breezy",
    patterns: ["breezy.hr", /breezy\.hr/],
  },
  {
    name: "successfactors",
    patterns: ["successfactors.com", /successfactors/i],
  },
];

export function detectATS(url: string, htmlContent?: string): string | null {
  // Check URL first
  for (const ats of ATS_PATTERNS) {
    for (const pattern of ats.patterns) {
      if (typeof pattern === "string") {
        if (url.toLowerCase().includes(pattern.toLowerCase())) return ats.name;
      } else {
        if (pattern.test(url)) return ats.name;
      }
    }
  }

  // Check HTML content (iframes, script sources, links)
  if (htmlContent) {
    for (const ats of ATS_PATTERNS) {
      for (const pattern of ats.patterns) {
        if (typeof pattern === "string") {
          if (htmlContent.toLowerCase().includes(pattern.toLowerCase())) return ats.name;
        } else {
          if (pattern.test(htmlContent)) return ats.name;
        }
      }
    }
  }

  return null;
}

// ─── Career Page Discovery ──────────────────────────────────────

export class CareerPageDiscoverer {
  async discover(domain: string, homepageHtml?: string): Promise<CareerPageResult | null> {
    const baseUrl = `https://${domain}`;

    // 1. Try common paths
    for (const path of CAREER_PATH_CANDIDATES) {
      const url = `${baseUrl}${path}`;
      const result = await this.tryUrl(url);
      if (result) return result;
    }

    // 2. Extract from homepage links
    if (homepageHtml) {
      const links = extractCareerLinks(homepageHtml, baseUrl);
      for (const link of links) {
        const result = await this.tryUrl(link);
        if (result) return result;
      }
    }

    // 3. Try sitemap
    const sitemapResult = await this.trySitemap(baseUrl);
    if (sitemapResult) return sitemapResult;

    return null;
  }

  private async tryUrl(url: string): Promise<CareerPageResult | null> {
    try {
      const resp = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
        redirect: "follow",
        headers: { "User-Agent": "AgentForge/1.0 (career page discovery)" },
      });

      if (resp.ok) {
        const finalUrl = resp.url || url;
        const ats = detectATS(finalUrl);
        return { url: finalUrl, ats, confidence: ats ? 0.95 : 0.7 };
      }
    } catch {
      // Ignore — try next
    }
    return null;
  }

  private async trySitemap(baseUrl: string): Promise<CareerPageResult | null> {
    try {
      const robotsResp = await fetch(`${baseUrl}/robots.txt`, {
        signal: AbortSignal.timeout(5000),
      });
      if (robotsResp.ok) {
        const robots = await robotsResp.text();
        const sitemapMatch = robots.match(/Sitemap:\s*(https?:\/\/[^\s]+)/i);
        if (sitemapMatch?.[1]) {
          return await this.parseSitemap(sitemapMatch[1]);
        }
      }

      // Default sitemap
      return await this.parseSitemap(`${baseUrl}/sitemap.xml`);
    } catch {
      return null;
    }
  }

  private async parseSitemap(sitemapUrl: string): Promise<CareerPageResult | null> {
    try {
      const resp = await fetch(sitemapUrl, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return null;

      const xml = await resp.text();
      const careerUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map(m => m[1]!)
        .filter(url =>
          /career|careers|jobs|job|opportunities|open-roles/i.test(url)
        );

      if (careerUrls.length > 0) {
        const url = careerUrls[0]!;
        return { url, ats: detectATS(url), confidence: 0.8 };
      }
    } catch {
      // Ignore
    }
    return null;
  }
}

// ─── Career Link Extraction ─────────────────────────────────────

function extractCareerLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().toLowerCase();

    const isCareerLink =
      /career|careers|job|jobs|work.with.us|join.us|opportunities|open.roles/.test(href.toLowerCase()) ||
      /career|jobs|join|opportunities/.test(text);

    if (isCareerLink) {
      try {
        const absolute = new URL(href, baseUrl).toString();
        links.push(absolute);
      } catch {
        // Ignore invalid URLs
      }
    }
  });

  return [...new Set(links)];
}
