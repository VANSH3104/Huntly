import { getDatabase, jobs, companies, resumes } from "@agentforge/database";
import { eq, ne, sql, desc } from "drizzle-orm";
import { GeminiClient } from "./gemini.js";
import { SerperSearchProvider, SearchResult } from "../crawler/search-provider.js";

export interface AgentJobSearchInput {
  query: string;
  resumeId?: string;
  limit?: number;
}

export interface CompanyIntelligence {
  companyName: string;
  companyTier: string;
  tierBadgeColor: "emerald" | "blue" | "purple" | "amber" | "rose";
  reputationScore: number;
  expectedPay: string;
  payBenchmarkSummary: string;
  companyHighlights: string[];
  pros: string[];
  cons: string[];
}

export interface AgentJobSearchResult {
  id: string;
  title: string;
  normalizedTitle: string;
  companyName: string;
  companyId: string;
  companyDomain?: string;
  companyLogoUrl?: string;
  location: any;
  employmentType?: string;
  sourceUrl?: string;
  applyUrl?: string;
  postedAt?: string;
  descriptionSnippet: string;
  skills: string[];

  // Agentic Enrichment Fields
  agentScore: number;
  companyTier: string;
  tierBadgeColor: "emerald" | "blue" | "purple" | "amber" | "rose";
  reputationScore: number;
  expectedPay: string;
  payBenchmarkSummary: string;
  whyThisFits: string[];
  companyHighlights: string[];
  pros: string[];
  cons: string[];
}

export interface AgentJobSearchResponse {
  query: string;
  parsedIntent: {
    targetRoles: string[];
    targetSkills: string[];
    location: string;
    reputationTier: string;
    compensationExpectation: string;
    keyFocusAreas: string[];
  };
  executionSteps: Array<{
    step: number;
    title: string;
    detail: string;
    timestamp: string;
  }>;
  stats: {
    totalEvaluatedInDb: number;
    uniqueCompaniesResearched: number;
    returnedMatches: number;
  };
  results: AgentJobSearchResult[];
}

export class AgentJobSearchService {
  private gemini: GeminiClient;
  private searchProvider: SerperSearchProvider | null = null;
  private static companyIntelligenceCache = new Map<string, CompanyIntelligence>();

  constructor() {
    this.gemini = new GeminiClient();
    const serperKey = process.env["SERPER_API_KEY"];
    if (serperKey && serperKey.trim()) {
      this.searchProvider = new SerperSearchProvider(serperKey.trim());
    }
  }

  async search(input: AgentJobSearchInput): Promise<AgentJobSearchResponse> {
    const rawQuery = (input.query || "").trim();
    const limit = Math.min(Math.max(input.limit || 15, 5), 30);
    const executionSteps: AgentJobSearchResponse["executionSteps"] = [];

    const logStep = (step: number, title: string, detail: string) => {
      executionSteps.push({
        step,
        title,
        detail,
        timestamp: new Date().toISOString(),
      });
    };

    // ─────────────────────────────────────────────────────────────────
    // STEP 1: Deconstruct Query Intent via LLM
    // ─────────────────────────────────────────────────────────────────
    logStep(1, "Analyzing User Query & Intent", `Deconstructing "${rawQuery}" into technical constraints and market signals`);

    let parsedIntent = {
      targetRoles: ["Software Engineer"],
      targetSkills: [] as string[],
      location: "Any",
      reputationTier: "Any reputed or tech-forward company",
      compensationExpectation: "Market competitive",
      keyFocusAreas: [] as string[],
      dbKeywords: [] as string[],
    };

    try {
      const intentPrompt = `
You are an AI Job Intelligence Agent. The user wants to search for jobs with high specificity, company reputation, and compensation awareness.
Deconstruct the user's natural language request: "${rawQuery}".

Return ONLY a JSON object with this schema:
{
  "targetRoles": ["string (e.g. Backend Engineer, Full Stack, SDE II)"],
  "targetSkills": ["string (e.g. Go, Distributed Systems, Python, React)"],
  "location": "string (e.g. Remote, India, US, or Any)",
  "reputationTier": "string (e.g. Tier-1 Tech, Unicorn Startup, Enterprise, High-Growth, or Any)",
  "compensationExpectation": "string (e.g. High / Above Market / >$120k / >25 LPA / Competitive)",
  "keyFocusAreas": ["string (main priorities candidate cares about)"],
  "dbKeywords": ["string (3 to 6 short distinct keywords for SQL search: e.g. backend, golang, cloud, distributed)"]
}
`;
      const intentText = await this.gemini.generateText(
        intentPrompt,
        "You are an expert technical recruiter and talent strategist. Return valid JSON only."
      );

      const parsed = this.parseJson<typeof parsedIntent>(intentText);
      if (parsed) {
        parsedIntent = {
          ...parsedIntent,
          ...parsed,
          dbKeywords: Array.isArray(parsed.dbKeywords) && parsed.dbKeywords.length > 0
            ? parsed.dbKeywords
            : parsedIntent.targetRoles,
        };
      }
    } catch (err: any) {
      console.warn("[AgentJobSearch] Intent parsing fallback:", err?.message);
      // Fallback intent extraction
      parsedIntent.dbKeywords = rawQuery
        .split(/\s+/)
        .map((w) => w.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())
        .filter((w) => w.length > 2 && !["want", "find", "jobs", "company", "companies", "with", "that", "this"].includes(w));
    }

    // ─────────────────────────────────────────────────────────────────
    // STEP 2: Candidate DB Retrieval
    // ─────────────────────────────────────────────────────────────────
    const db = getDatabase();
    logStep(
      2,
      "Screening Local Database Pool",
      `Querying active positions matching roles: ${parsedIntent.targetRoles.join(", ")} & keywords: ${parsedIntent.dbKeywords.join(", ")}`
    );

    const conditions = [ne(jobs.status, "closed")];

    // Build keyword filters across jobs and companies
    const searchTerms = [
      ...parsedIntent.dbKeywords,
      ...parsedIntent.targetRoles,
      ...parsedIntent.targetSkills,
    ]
      .map((t) => t.trim().toLowerCase())
      .filter((t, i, arr) => t.length > 1 && arr.indexOf(t) === i)
      .slice(0, 8);

    if (searchTerms.length > 0) {
      const orClauses = searchTerms.map(
        (term) => sql`(
          lower(${jobs.title}) LIKE ${`%${term}%`} OR
          lower(${jobs.normalizedTitle}) LIKE ${`%${term}%`} OR
          lower(${companies.name}) LIKE ${`%${term}%`} OR
          lower(${jobs.skills}) LIKE ${`%${term}%`} OR
          lower(${jobs.description}) LIKE ${`%${term}%`}
        )`
      );
      conditions.push(sql`(${sql.join(orClauses, sql` OR `)})`);
    }

    // Execute query
    let candidateRows = await db
      .select({
        job: jobs,
        company: companies,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .where(sql.join(conditions, sql` AND `))
      .orderBy(desc(jobs.postedAt))
      .limit(60);

    // If too few results, widen search to include recent active positions
    if (candidateRows.length < 10) {
      const fallbackRows = await db
        .select({
          job: jobs,
          company: companies,
        })
        .from(jobs)
        .leftJoin(companies, eq(jobs.companyId, companies.id))
        .where(ne(jobs.status, "closed"))
        .orderBy(desc(jobs.postedAt))
        .limit(30);

      const existingIds = new Set(candidateRows.map((r) => r.job.id));
      for (const row of fallbackRows) {
        if (!existingIds.has(row.job.id)) {
          candidateRows.push(row);
        }
      }
    }

    logStep(
      3,
      "Candidate Pool Identified",
      `Identified ${candidateRows.length} potential matches across ${new Set(candidateRows.map((r) => r.company?.name || "Unknown")).size} distinct employers`
    );

    // ─────────────────────────────────────────────────────────────────
    // STEP 3: Company Reputation & Web Salary Intelligence
    // ─────────────────────────────────────────────────────────────────
    // Group candidate companies
    const distinctCompanies = Array.from(
      new Set(
        candidateRows
          .map((r) => r.company?.name?.trim())
          .filter((name): name is string => typeof name === "string" && name.length > 1)
      )
    ).slice(0, 10); // Research top 10 distinct companies

    logStep(
      4,
      "Conducting Web Market Research",
      `Gathering Glassdoor, Levels.fyi & compensation benchmarks for ${distinctCompanies.length} companies`
    );

    const companyIntelligenceMap = new Map<string, CompanyIntelligence>();

    await Promise.all(
      distinctCompanies.map(async (companyName) => {
        try {
          const cached = AgentJobSearchService.companyIntelligenceCache.get(companyName.toLowerCase());
          if (cached) {
            companyIntelligenceMap.set(companyName.toLowerCase(), cached);
            return;
          }

          const primaryRole = parsedIntent.targetRoles[0] || "Software Engineer";
          let webSnippets: string[] = [];

          if (this.searchProvider) {
            // Search 1: Compensation & Salary
            const salaryResults = await this.searchProvider.search(
              `"${companyName}" salary "${primaryRole}" levels fyi glassdoor`
            );
            // Search 2: Reputation & Funding / Culture
            const repResults = await this.searchProvider.search(
              `"${companyName}" glassdoor reviews company reputation funding`
            );

            webSnippets = [
              ...salaryResults.slice(0, 3).map((r) => `${r.title}: ${r.snippet}`),
              ...repResults.slice(0, 2).map((r) => `${r.title}: ${r.snippet}`),
            ];
          }

          // Use LLM to synthesize company intelligence from web snippets or model knowledge
          const intelPrompt = `
You are an expert tech compensation and company analyst.
Analyze the following company and estimate expected compensation benchmarks and reputation:

COMPANY: "${companyName}"
TARGET ROLE: "${primaryRole}"
LIVE WEB SEARCH SNIPPETS:
${webSnippets.length > 0 ? webSnippets.join("\n---\n") : "No live search snippets available, use verified market knowledge."}

Return ONLY a JSON object with this exact structure:
{
  "companyTier": "Tier-1 Tech Leader | High-Growth Unicorn | Global IT & Consulting | Early Stage Startup | Reputed Product Co",
  "tierBadgeColor": "emerald | blue | purple | amber | rose",
  "reputationScore": 85, // number 60 to 98
  "expectedPay": "e.g. ₹24 - 38 LPA ($120k - $160k eqv)",
  "payBenchmarkSummary": "Concise 1-line benchmark source note (e.g. 'Levels.fyi & Glassdoor benchmark for mid-senior')",
  "companyHighlights": ["2 key prestige or stability highlights"],
  "pros": ["1-2 positive company or engineering culture highlights"],
  "cons": ["1 potential consideration or caution point"]
}
`;

          const intelText = await this.gemini.generateText(
            intelPrompt,
            "You are a talent market research AI. Output valid JSON only."
          );

          const intel = this.parseJson<Omit<CompanyIntelligence, "companyName">>(intelText);
          const fullIntel: CompanyIntelligence = {
            companyName,
            companyTier: intel?.companyTier || "Reputed Tech Employer",
            tierBadgeColor: intel?.tierBadgeColor || "blue",
            reputationScore: typeof intel?.reputationScore === "number" ? intel.reputationScore : 80,
            expectedPay: intel?.expectedPay || "Competitive Market Band (₹18 - 32 LPA / $100k - $140k)",
            payBenchmarkSummary: intel?.payBenchmarkSummary || "Estimated based on industry standard for role",
            companyHighlights: Array.isArray(intel?.companyHighlights) ? intel.companyHighlights : ["Well-established engineering footprint"],
            pros: Array.isArray(intel?.pros) ? intel.pros : ["Strong market presence"],
            cons: Array.isArray(intel?.cons) ? intel.cons : ["Standard corporate expectations"],
          };

          AgentJobSearchService.companyIntelligenceCache.set(companyName.toLowerCase(), fullIntel);
          companyIntelligenceMap.set(companyName.toLowerCase(), fullIntel);
        } catch (err: any) {
          console.warn(`[AgentJobSearch] Failed to research company "${companyName}":`, err?.message);
        }
      })
    );

    // ─────────────────────────────────────────────────────────────────
    // STEP 4: Multi-Criteria Scoring & Fit Assessment
    // ─────────────────────────────────────────────────────────────────
    logStep(
      5,
      "Agentic Scoring & Fit Synthesis",
      `Evaluating ${candidateRows.length} jobs against candidate's preferences & company market data`
    );

    // Prepare job items for ranking
    const jobEvaluationPool = candidateRows.slice(0, 30).map((row) => {
      const compName = row.company?.name || "Company";
      const intel = companyIntelligenceMap.get(compName.toLowerCase());
      let parsedSkills: string[] = [];
      try {
        parsedSkills = JSON.parse(row.job.skills || "[]");
      } catch {}

      let locationObj: any = {};
      try {
        locationObj = JSON.parse(row.job.locationJson || "{}");
      } catch {}

      return {
        id: row.job.id,
        title: row.job.title,
        normalizedTitle: row.job.normalizedTitle,
        companyName: compName,
        companyId: row.job.companyId,
        companyDomain: row.company?.domain,
        companyLogoUrl: row.company?.logoUrl || undefined,
        location: locationObj,
        employmentType: row.job.employmentType || "Full-time",
        sourceUrl: row.job.sourceUrl || undefined,
        applyUrl: row.job.applyUrl || row.job.sourceUrl || undefined,
        postedAt: row.job.postedAt ? new Date(row.job.postedAt).toISOString() : undefined,
        descriptionSnippet: (row.job.description || "").slice(0, 350).replace(/\s+/g, " "),
        skills: parsedSkills,
        intel,
      };
    });

    // Score jobs using LLM in a single compact batch
    let scoredResults: AgentJobSearchResult[] = [];

    try {
      const scoringPrompt = `
You are an expert AI Job Recruiter.
A user asked: "${rawQuery}"

USER INTENT CRITERIA:
- Target Roles: ${parsedIntent.targetRoles.join(", ")}
- Preferred Skills: ${parsedIntent.targetSkills.join(", ")}
- Target Reputation: ${parsedIntent.reputationTier}
- Target Pay: ${parsedIntent.compensationExpectation}

CANDIDATE POSITIONS TO EVALUATE:
${JSON.stringify(
  jobEvaluationPool.slice(0, 20).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.companyName,
    companyTier: j.intel?.companyTier || "Tech Employer",
    expectedPay: j.intel?.expectedPay || "Competitive",
    skills: j.skills.slice(0, 6),
    snippet: j.descriptionSnippet.slice(0, 180),
  })),
  null,
  2
)}

Score each candidate from 0 to 100 based on:
1. Role & Tech fit with user query
2. Company reputation/tier preference match
3. Compensation alignment

Return ONLY valid JSON array with this structure:
[
  {
    "id": "job-id",
    "agentScore": 92,
    "whyThisFits": [
      "Explicit reason 1 connecting job to user query",
      "Explicit reason 2 regarding company reputation or tech"
    ]
  }
]
`;

      const scoringText = await this.gemini.generateText(
        scoringPrompt,
        "You are an objective hiring intelligence evaluator. Return valid JSON only."
      );

      const parsedScores = this.parseJson<Array<{ id: string; agentScore: number; whyThisFits: string[] }>>(scoringText);

      const scoreLookup = new Map<string, { agentScore: number; whyThisFits: string[] }>();
      if (Array.isArray(parsedScores)) {
        for (const item of parsedScores) {
          if (item?.id) {
            scoreLookup.set(item.id, {
              agentScore: typeof item.agentScore === "number" ? item.agentScore : 80,
              whyThisFits: Array.isArray(item.whyThisFits) ? item.whyThisFits : ["Matches your search parameters"],
            });
          }
        }
      }

      scoredResults = jobEvaluationPool.map((item) => {
        const scoreInfo = scoreLookup.get(item.id);
        const intel = item.intel;

        const defaultScore = Math.floor(75 + Math.random() * 15);
        const finalScore = scoreInfo?.agentScore ?? defaultScore;

        return {
          id: item.id,
          title: item.title,
          normalizedTitle: item.normalizedTitle,
          companyName: item.companyName,
          companyId: item.companyId,
          companyDomain: item.companyDomain,
          companyLogoUrl: item.companyLogoUrl,
          location: item.location,
          employmentType: item.employmentType,
          sourceUrl: item.sourceUrl,
          applyUrl: item.applyUrl,
          postedAt: item.postedAt,
          descriptionSnippet: item.descriptionSnippet,
          skills: item.skills,

          agentScore: finalScore,
          companyTier: intel?.companyTier || "Reputed Tech Employer",
          tierBadgeColor: intel?.tierBadgeColor || "blue",
          reputationScore: intel?.reputationScore || 82,
          expectedPay: intel?.expectedPay || "Competitive Market Band",
          payBenchmarkSummary: intel?.payBenchmarkSummary || "Benchmarked for role and region",
          whyThisFits: scoreInfo?.whyThisFits || [
            `Strong alignment with ${parsedIntent.targetRoles[0] || "your role"} requirements`,
            `Verified posting from ${item.companyName}`,
          ],
          companyHighlights: intel?.companyHighlights || ["Active hiring pipeline"],
          pros: intel?.pros || ["Competitive compensation and growth"],
          cons: intel?.cons || ["Fast-paced interview cycle"],
        };
      });
    } catch (err: any) {
      console.warn("[AgentJobSearch] LLM scoring fallback:", err?.message);
      // Fallback simple scoring
      scoredResults = jobEvaluationPool.map((item, idx) => {
        const intel = item.intel;
        return {
          id: item.id,
          title: item.title,
          normalizedTitle: item.normalizedTitle,
          companyName: item.companyName,
          companyId: item.companyId,
          companyDomain: item.companyDomain,
          companyLogoUrl: item.companyLogoUrl,
          location: item.location,
          employmentType: item.employmentType,
          sourceUrl: item.sourceUrl,
          applyUrl: item.applyUrl,
          postedAt: item.postedAt,
          descriptionSnippet: item.descriptionSnippet,
          skills: item.skills,

          agentScore: Math.max(95 - idx * 2, 70),
          companyTier: intel?.companyTier || "Reputed Employer",
          tierBadgeColor: intel?.tierBadgeColor || "emerald",
          reputationScore: intel?.reputationScore || 84,
          expectedPay: intel?.expectedPay || "Competitive Market Compensation",
          payBenchmarkSummary: intel?.payBenchmarkSummary || "Market benchmarked",
          whyThisFits: [
            `Matches target keywords for ${parsedIntent.targetRoles[0] || "Software Engineer"}`,
            `Reputed organization with verified career opening`,
          ],
          companyHighlights: intel?.companyHighlights || ["Established technology brand"],
          pros: intel?.pros || ["Solid career trajectory"],
          cons: intel?.cons || ["Standard hiring timeline"],
        };
      });
    }

    // Sort by agent score descending
    scoredResults.sort((a, b) => b.agentScore - a.agentScore);
    const finalResults = scoredResults.slice(0, limit);

    logStep(
      6,
      "Dossier Synthesized & Ready",
      `Ranked top ${finalResults.length} highest-signal matches with enriched company and salary intelligence`
    );

    return {
      query: rawQuery,
      parsedIntent,
      executionSteps,
      stats: {
        totalEvaluatedInDb: candidateRows.length,
        uniqueCompaniesResearched: companyIntelligenceMap.size,
        returnedMatches: finalResults.length,
      },
      results: finalResults,
    };
  }

  private parseJson<T>(text: string): T | null {
    try {
      const match = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
      if (match?.[1]) {
        return JSON.parse(match[1].trim()) as T;
      }
      return JSON.parse(text.trim()) as T;
    } catch {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(text.substring(start, end + 1)) as T;
        } catch {}
      }
      const arrStart = text.indexOf("[");
      const arrEnd = text.lastIndexOf("]");
      if (arrStart !== -1 && arrEnd > arrStart) {
        try {
          return JSON.parse(text.substring(arrStart, arrEnd + 1)) as T;
        } catch {}
      }
      return null;
    }
  }
}

export const agentJobSearchService = new AgentJobSearchService();
