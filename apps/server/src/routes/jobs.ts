import { Router } from "express";
import { getDatabase, jobs, companies, jobMatches, aiAnalyses, applications, resumes, resumeSkills } from "@agentforge/database";
import { eq, desc, asc, and, gte, lte, like, inArray, sql, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { normalizeLocation } from "../utils/normalize.js";

export const jobsRouter = Router();

// z.coerce.boolean() turns the string "false" into true, so query flags are parsed explicitly.
const flag = z.preprocess((v) => v === true || v === "1" || v === "true", z.boolean());
const csvList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : []));
const matchMode = z.enum(["any", "all"]).default("any");

const EMPLOYMENT_TYPES = ["full-time", "part-time", "contract", "internship", "freelance"] as const;
type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

const AdvancedFilterSchema = z.object({
  excludeKeywords: csvList,
  excludeCompanies: csvList,
  includeCompanies: csvList,
  titleOnly: flag,
  includeDescription: flag,
  searchMode: matchMode,
  exactWord: flag,
  skillsMode: matchMode,
  employmentType: csvList.pipe(z.array(z.enum(EMPLOYMENT_TYPES))),
  experienceMin: z.coerce.number().int().min(0).max(30).optional(),
  experienceMax: z.coerce.number().int().min(0).max(30).optional(),
  salaryMin: z.coerce.number().min(0).optional(),
  hasSalary: flag,
  country: csvList,
  visaSponsorship: flag,
  companySize: csvList,
  companyType: csvList,
  postedAfter: z.coerce.date().optional(),
  facets: flag,
});
type AdvancedFilter = z.infer<typeof AdvancedFilterSchema>;

const JobFilterSchema = AdvancedFilterSchema.extend({
  status: z.enum(["all", "active", "stale", "closed"]).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  resumeId: z.string().optional(),
  location: z.string().optional(),
  remote: flag.optional(),
  remoteOnly: flag.optional(),
  search: z.string().optional(),
  role: z.string().optional(),
  specialization: z.string().optional(),
  seniority: z.string().optional(),
  workFormat: z.string().optional(),
  region: z.string().optional(),
  sources: z.string().optional(),
  source: z.string().optional(),
  skills: z.string().optional(),
  industry: z.string().optional(),
  collection: z.string().optional(),
  companyId: z.string().optional(),
  groupId: z.string().optional(),
  sourceType: z.string().optional(),
  ats: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  postedWithin: z.enum(["all", "today", "4h", "9h", "24h", "3d", "7d", "1w", "2w", "1m", "30d", "3m", "any"]).optional(),
  tab: z.enum(["recommended", "new", "all", "saved", "applied"]).optional(),
  // Absent means true; only an explicit "false"/"0" shows applied jobs.
  hideApplied: z.preprocess((v) => !(v === false || v === "false" || v === "0"), z.boolean()),
});

// ── Text matching ────────────────────────────────────────────────────────────
// SQLite has no regex, so whole-word matching pads the text with spaces after
// mapping punctuation to spaces and then looks for "% term %".
const WORD_BREAKS = ["-", "/", ",", ".", "(", ")", "[", "]", "|", ":", ";", "!", "?", "&", "\n", "\r", "\t"];
const EXPERIENCE_BREAKS = ["(", ")", ",", ":", ";", "\n", "\r", "\t"];

function padded(col: SQL, breaks: string[]): SQL {
  let expr = sql`lower(COALESCE(${col}, ''))`;
  for (const ch of breaks) expr = sql`replace(${expr}, ${ch}, ' ')`;
  return sql`(' ' || ${expr} || ' ')`;
}

function splitTerms(raw: string | undefined): string[] {
  return raw ? raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
}

function normalizeTerm(term: string): string {
  let out = term.toLowerCase();
  for (const ch of WORD_BREAKS) out = out.split(ch).join(" ");
  return out.replace(/\s+/g, " ").trim();
}

type TextField = "title" | "normalizedTitle" | "company" | "skills" | "description";
const TEXT_FIELDS: Record<TextField, SQL> = {
  title: sql`${jobs.title}`,
  normalizedTitle: sql`${jobs.normalizedTitle}`,
  company: sql`${companies.name}`,
  skills: sql`${jobs.skills}`,
  description: sql`${jobs.description}`,
};

function fieldContains(field: TextField, term: string, exactWord: boolean): SQL {
  if (exactWord) return sql`${padded(TEXT_FIELDS[field], WORD_BREAKS)} LIKE ${`% ${normalizeTerm(term)} %`}`;
  return sql`lower(COALESCE(${TEXT_FIELDS[field]}, '')) LIKE ${`%${term}%`}`;
}

function anyFieldContains(fields: TextField[], term: string, exactWord: boolean): SQL {
  return sql`(${sql.join(fields.map((f) => fieldContains(f, term, exactWord)), sql` OR `)})`;
}

function combine(clauses: SQL[], mode: "any" | "all"): SQL {
  return sql`(${sql.join(clauses, mode === "all" ? sql` AND ` : sql` OR `)})`;
}

// A multi-word term also matches when every word appears somewhere in the
// non-description fields, so "senior backend" finds "Senior Engineer, Backend".
function termMatch(term: string, fields: TextField[], exactWord: boolean): SQL {
  const phrase = anyFieldContains(fields, term, exactWord);
  const words = term.split(/\s+/).filter((w) => w.length > 1);
  const wordFields = fields.filter((f) => f !== "description");
  if (words.length < 2 || wordFields.length === 0) return phrase;
  const allWords = combine(words.map((w) => anyFieldContains(wordFields, w, exactWord)), "all");
  return sql`(${phrase} OR ${allWords})`;
}

// ── Advanced filters ─────────────────────────────────────────────────────────
function jsonField(col: SQL, path: string): SQL {
  return sql`(CASE WHEN json_valid(${col}) THEN json_extract(${col}, ${path}) END)`;
}

const SALARY_VALUE = sql`COALESCE(${jsonField(sql`${jobs.salaryJson}`, "$.max")}, ${jsonField(sql`${jobs.salaryJson}`, "$.min")})`;

const EMPLOYMENT_PATTERNS: Record<EmploymentType, string[]> = {
  "full-time": ["full time", "fulltime", "permanent"],
  "part-time": ["part time", "parttime"],
  contract: ["contract", "contractor", "temporary"],
  internship: ["intern", "internship", "interns"],
  freelance: ["freelance", "freelancer"],
};

const VISA_POSITIVE = ["%visa sponsor%", "%sponsorship%", "%h1b%", "%h-1b%", "%relocation%", "%relocate%"];
const VISA_NEGATIVE = ["%no visa sponsor%", "%not sponsor%", "%unable to sponsor%", "%cannot sponsor%", "%not able to sponsor%", "%not offer visa%", "%not provide visa%", "%no sponsorship%", "%without sponsorship%"];

// Experience is approximated in SQL: a job counts as requiring N years when its
// title/description says "N+ years", "N years", "N yrs", "N-M years" or "N to M years",
// and it passes when N is within [experienceMin, experienceMax]. Doing this in SQL keeps
// total/pagination exact; the cost is that jobs which never state years are excluded and
// phrasings like "minimum of three years" are missed. A JS post-filter would parse better
// but would make page counts wrong.
const EXPERIENCE_CAP = 15;
function experiencePatterns(n: number): string[] {
  return [
    `% ${n}+ year%`, `% ${n}+ yr%`, `% ${n}+year%`, `% ${n} year%`, `% ${n} yr%`,
    `% ${n}-_ year%`, `% ${n}-__ year%`, `% ${n} - _ year%`, `% ${n}-_ yr%`, `% ${n} to _ year%`,
  ];
}

function experienceCondition(min: number | undefined, max: number | undefined): SQL | undefined {
  if (min === undefined && max === undefined) return undefined;
  const lo = Math.min(min ?? 0, EXPERIENCE_CAP);
  const hi = Math.min(max ?? EXPERIENCE_CAP, EXPERIENCE_CAP);
  const text = sql`(${padded(sql`${jobs.title}`, EXPERIENCE_BREAKS)} || ${padded(sql`${jobs.description}`, EXPERIENCE_BREAKS)})`;
  const clauses: SQL[] = [];
  for (let n = lo; n <= hi; n++) {
    for (const p of experiencePatterns(n)) clauses.push(sql`${text} LIKE ${p}`);
  }
  return clauses.length ? combine(clauses, "any") : sql`0`;
}

function companyNameMatches(names: string[]): SQL {
  return combine(names.map((n) => sql`lower(COALESCE(${companies.name}, '')) LIKE ${`%${n}%`}`), "any");
}

type ConditionBuilder = (f: AdvancedFilter) => SQL | undefined;

const ADVANCED_CONDITIONS: ConditionBuilder[] = [
  (f) =>
    f.excludeKeywords.length
      ? sql`NOT ${combine(f.excludeKeywords.map((k) => anyFieldContains(["title", "description", "company"], k, f.exactWord)), "any")}`
      : undefined,
  (f) => (f.includeCompanies.length ? companyNameMatches(f.includeCompanies) : undefined),
  (f) => (f.excludeCompanies.length ? sql`NOT ${companyNameMatches(f.excludeCompanies)}` : undefined),
  (f) =>
    f.employmentType.length
      ? combine(
          f.employmentType.flatMap((t) =>
            [normalizeTerm(t), ...EMPLOYMENT_PATTERNS[t]].flatMap((p) => [
              sql`${padded(sql`${jobs.employmentType}`, WORD_BREAKS)} LIKE ${`% ${p} %`}`,
              sql`${padded(sql`${jobs.title}`, WORD_BREAKS)} LIKE ${`% ${p} %`}`,
            ])
          ),
          "any"
        )
      : undefined,
  (f) => experienceCondition(f.experienceMin, f.experienceMax),
  (f) => (f.salaryMin !== undefined ? sql`${SALARY_VALUE} >= ${f.salaryMin}` : undefined),
  (f) => (f.hasSalary ? sql`${SALARY_VALUE} IS NOT NULL` : undefined),
  (f) => {
    if (!f.country.length) return undefined;
    const loc = sql`${jobs.locationJson}`;
    const place = sql`lower(COALESCE(${jsonField(loc, "$.country")}, '') || ' ' || COALESCE(${jsonField(loc, "$.city")}, '') || ' ' || COALESCE(${jsonField(loc, "$.state")}, ''))`;
    return combine(f.country.map((c) => sql`${place} LIKE ${`%${c}%`}`), "any");
  },
  (f) => {
    if (!f.visaSponsorship) return undefined;
    const d = sql`lower(${jobs.description})`;
    const pos = combine(VISA_POSITIVE.map((p) => sql`${d} LIKE ${p}`), "any");
    const neg = combine(VISA_NEGATIVE.map((p) => sql`${d} LIKE ${p}`), "any");
    return sql`(${pos} AND NOT ${neg})`;
  },
  (f) =>
    f.companySize.length
      ? combine(f.companySize.map((s) => sql`lower(COALESCE(${companies.size}, '')) LIKE ${`%${s}%`}`), "any")
      : undefined,
  (f) =>
    f.companyType.length
      ? combine(f.companyType.map((t) => sql`lower(COALESCE(${companies.companyType}, '')) LIKE ${`%${t}%`}`), "any")
      : undefined,
  (f) => (f.postedAfter ? sql`COALESCE(${jobs.postedAt}, ${jobs.firstSeenAt}) >= ${f.postedAfter.getTime()}` : undefined),
];

function buildAdvancedConditions(f: AdvancedFilter): SQL[] {
  return ADVANCED_CONDITIONS.map((build) => build(f)).filter((c): c is SQL => c !== undefined);
}

const FACET_LIMIT = 15;
const FACET_EXPRESSIONS = {
  ats: sql`lower(COALESCE(${jobs.ats}, ${companies.ats}, ${jobs.sourceType}))`,
  employmentType: sql`lower(${jobs.employmentType})`,
  country: jsonField(sql`${jobs.locationJson}`, "$.country"),
  company: sql`${companies.name}`,
} as const;
type FacetKey = keyof typeof FACET_EXPRESSIONS;
type Facets = Record<FacetKey, Array<{ value: string; count: number }>>;

// GET /api/jobs
jobsRouter.get("/", async (req, res, next) => {
  try {
    const filter = JobFilterSchema.parse(req.query);
    const db = getDatabase();
    const offset = (filter.page - 1) * filter.limit;

    // Filters
    const conditions = [];

    // Exclude closed jobs unless explicitly requested
    if (filter.status === "closed") {
      conditions.push(eq(jobs.status, "closed"));
    } else if (filter.status === "active" || filter.status === "stale") {
      conditions.push(eq(jobs.status, filter.status));
    } else if (filter.status !== "all") {
      conditions.push(ne(jobs.status, "closed"));
    }

    // Exclude already applied/tracked jobs from active discovery feeds
    if (filter.tab === "applied") {
      conditions.push(sql`${jobs.id} IN (SELECT job_id FROM applications)`);
    } else if (filter.hideApplied) {
      conditions.push(sql`${jobs.id} NOT IN (SELECT job_id FROM applications)`);
    }

    if (filter.companyId) {
      conditions.push(eq(jobs.companyId, filter.companyId));
    }
    if (filter.sourceType) {
      conditions.push(eq(jobs.sourceType, filter.sourceType));
    }

    // 1. Keyword Multi-Search: comma-separated terms, OR by default, AND with searchMode=all
    const searchTerms = splitTerms(filter.search);
    if (searchTerms.length > 0) {
      const fields: TextField[] = filter.titleOnly
        ? ["title", "normalizedTitle"]
        : ["title", "normalizedTitle", "company", "skills", "description"];
      conditions.push(combine(searchTerms.map((t) => termMatch(t, fields, filter.exactWord)), filter.searchMode));
    }

    // 2. Role / Specialization: title-ish fields only; descriptions mention many roles in passing
    const roleTerms = splitTerms(filter.specialization || filter.role);
    if (roleTerms.length > 0) {
      const fields: TextField[] = filter.titleOnly
        ? ["title", "normalizedTitle"]
        : filter.includeDescription
          ? ["title", "normalizedTitle", "skills", "description"]
          : ["title", "normalizedTitle", "skills"];
      conditions.push(combine(roleTerms.map((t) => anyFieldContains(fields, t, filter.exactWord)), "any"));
    }

    conditions.push(...buildAdvancedConditions(filter));

    // 3. Location Multi-Filter: supports comma-separated (e.g. "Bengaluru, Remote, Chennai")
    if (filter.location && filter.location.trim()) {
      const rawLocs = filter.location
        .split(",")
        .map((l) => l.trim().toLowerCase())
        .filter(Boolean);

      if (rawLocs.length > 0) {
        const locConditions = rawLocs.map((loc) => {
          const locLike = `%${loc}%`;
          return sql`(lower(${jobs.locationJson}) LIKE ${locLike} OR lower(${jobs.title}) LIKE ${locLike} OR lower(${jobs.description}) LIKE ${locLike})`;
        });
        conditions.push(sql`(${sql.join(locConditions, sql` OR `)})`);
      }
    }

    // Remote filter
    if (filter.remote || filter.remoteOnly) {
      conditions.push(
        sql`(json_extract(${jobs.locationJson}, '$.remote') = 1 OR json_extract(${jobs.locationJson}, '$.remote') = true OR lower(${jobs.locationJson}) LIKE '%remote%')`
      );
    }

    // Work Format filter (remote, hybrid, on-site)
    if (filter.workFormat && filter.workFormat.trim()) {
      const rawFormats = filter.workFormat.split(",").map(f => f.trim().toLowerCase()).filter(Boolean);
      if (rawFormats.length > 0) {
        const fmtClauses = rawFormats.map(fmt => {
          if (fmt === "remote") {
            return sql`(lower(${jobs.locationJson}) LIKE '%remote%' OR json_extract(${jobs.locationJson}, '$.remote') = 1)`;
          }
          return sql`lower(${jobs.locationJson}) LIKE ${'%' + fmt + '%'}`;
        });
        conditions.push(sql`(${sql.join(fmtClauses, sql` OR `)})`);
      }
    }

    // Region filter (Worldwide, APAC, Europe, North America, LATAM, UK, MENA, Africa, CIS, India)
    if (filter.region && filter.region.trim()) {
      const rawRegions = filter.region.split(",").map(r => r.trim().toLowerCase()).filter(Boolean);
      if (rawRegions.length > 0) {
        const regClauses = rawRegions.map(reg => sql`lower(${jobs.locationJson}) LIKE ${'%' + reg + '%'}`);
        conditions.push(sql`(${sql.join(regClauses, sql` OR `)})`);
      }
    }

    // Seniority filter (intern, junior, mid, senior, lead, staff, principal, c-level)
    if (filter.seniority && filter.seniority.trim()) {
      const rawSeniority = filter.seniority.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (rawSeniority.length > 0) {
        const senClauses = rawSeniority.map(sen => {
          const senLike = `%${sen}%`;
          return sql`(
            lower(${jobs.experienceLevel}) LIKE ${senLike} OR
            lower(${jobs.title}) LIKE ${senLike} OR
            lower(${jobs.locationJson}) LIKE ${senLike}
          )`;
        });
        conditions.push(sql`(${sql.join(senClauses, sql` OR `)})`);
      }
    }

    // Sources filter: supports all 100+ platforms (Greenhouse, Workday, Ashby, Lever, Jobstreet, Adzuna, Whatjobs, Zoho, etc.)
    const sourceParam = filter.sources || filter.source || filter.ats;
    if (sourceParam && sourceParam.trim()) {
      const rawSources = sourceParam.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (rawSources.length > 0) {
        const srcClauses = rawSources.map(s => {
          if (s === "yc" || s === "y combinator") {
            return sql`(
              lower(${jobs.description}) LIKE '%y combinator%' OR
              lower(${jobs.title}) LIKE '%yc%' OR
              lower(${companies.name}) LIKE '%yc%' OR
              lower(${jobs.sourceUrl}) LIKE '%workatastartup%' OR
              lower(${jobs.applyUrl}) LIKE '%workatastartup%' OR
              lower(${jobs.ats}) = 'ashby' OR
              lower(${companies.ats}) = 'ashby'
            )`;
          }
          const srcLike = `%${s}%`;
          return sql`(
            lower(${jobs.ats}) LIKE ${srcLike} OR
            lower(${companies.ats}) LIKE ${srcLike} OR
            lower(${jobs.sourceType}) LIKE ${srcLike} OR
            lower(${jobs.sourceUrl}) LIKE ${srcLike} OR
            lower(${jobs.applyUrl}) LIKE ${srcLike} OR
            lower(${jobs.locationJson}) LIKE ${srcLike}
          )`;
        });
        conditions.push(sql`(${sql.join(srcClauses, sql` OR `)})`);
      }
    }

    // Skills filter
    if (filter.skills && filter.skills.trim()) {
      const rawSkills = filter.skills.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
      if (rawSkills.length > 0) {
        const skillClauses = rawSkills.map(sk => {
          const skLike = `%${sk}%`;
          return sql`(lower(${jobs.skills}) LIKE ${skLike} OR lower(${jobs.description}) LIKE ${skLike})`;
        });
        conditions.push(combine(skillClauses, filter.skillsMode));
      }
    }

    // Industry filter
    if (filter.industry && filter.industry.trim()) {
      const rawInd = filter.industry.split(",").map(i => i.trim().toLowerCase()).filter(Boolean);
      if (rawInd.length > 0) {
        const indClauses = rawInd.map(ind => {
          const indLike = `%${ind}%`;
          return sql`(lower(${companies.industry}) LIKE ${indLike} OR lower(${jobs.description}) LIKE ${indLike} OR lower(${jobs.locationJson}) LIKE ${indLike})`;
        });
        conditions.push(sql`(${sql.join(indClauses, sql` OR `)})`);
      }
    }

    // Collection filter (Y Combinator, Techstars, a16z, Big Tech, Unicorns, etc.)
    if (filter.collection && filter.collection.trim()) {
      const rawCol = filter.collection.split(",").map(c => c.trim().toLowerCase()).filter(Boolean);
      if (rawCol.length > 0) {
        const colClauses = rawCol.map(col => {
          const colLike = `%${col}%`;
          return sql`(lower(${companies.companyType}) LIKE ${colLike} OR lower(${jobs.description}) LIKE ${colLike} OR lower(${jobs.locationJson}) LIKE ${colLike})`;
        });
        conditions.push(sql`(${sql.join(colClauses, sql` OR `)})`);
      }
    }

    // Time Posted Freshness filter (today, 4h, 9h, 24h, 3d, 7d, 1w, 2w, 1m, 30d, 3m)
    if (filter.postedWithin && filter.postedWithin !== "all" && filter.postedWithin !== "any") {
      const now = Date.now();
      let msAgo = 0;
      if (filter.postedWithin === "4h") msAgo = 4 * 60 * 60 * 1000;
      else if (filter.postedWithin === "9h") msAgo = 9 * 60 * 60 * 1000;
      else if (filter.postedWithin === "24h" || filter.postedWithin === "today") msAgo = 24 * 60 * 60 * 1000;
      else if (filter.postedWithin === "3d") msAgo = 3 * 24 * 60 * 60 * 1000;
      else if (filter.postedWithin === "7d" || filter.postedWithin === "1w") msAgo = 7 * 24 * 60 * 60 * 1000;
      else if (filter.postedWithin === "2w") msAgo = 14 * 24 * 60 * 60 * 1000;
      else if (filter.postedWithin === "30d" || filter.postedWithin === "1m") msAgo = 30 * 24 * 60 * 60 * 1000;
      else if (filter.postedWithin === "3m") msAgo = 90 * 24 * 60 * 60 * 1000;

      if (msAgo > 0) {
        const minTimestamp = now - msAgo;
        conditions.push(sql`COALESCE(${jobs.postedAt}, ${jobs.firstSeenAt}) >= ${minTimestamp}`);
      }
    }

    // Min Score filter
    if (filter.minScore !== undefined && filter.minScore > 0) {
      const scoreVal = filter.minScore <= 1 ? filter.minScore * 100 : filter.minScore;
      conditions.push(sql`COALESCE(${jobMatches.overallScore}, 75) >= ${scoreVal}`);
    }

    // Tab filters
    if (filter.tab === "recommended" && filter.minScore === undefined) {
      conditions.push(sql`COALESCE(${jobMatches.overallScore}, 75) >= 70`);
    }
    if (filter.tab === "new") {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      conditions.push(gte(jobs.firstSeenAt, threeDaysAgo));
    }

    // Base query — join with companies and job_matches
    let query = db
      .select({
        job: jobs,
        company: companies,
        matchScore: jobMatches.overallScore,
        skillScore: jobMatches.skillScore,
        roleScore: jobMatches.roleScore,
        locationScore: jobMatches.locationScore,
        aiAnalysis: aiAnalyses,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          filter.resumeId ? eq(jobMatches.resumeId, filter.resumeId) : sql`1=1`
        )
      )
      .leftJoin(
        aiAnalyses,
        and(
          eq(aiAnalyses.jobId, jobs.id),
          filter.resumeId ? eq(aiAnalyses.resumeId, filter.resumeId) : sql`1=1`
        )
      );

    // Sorting
    const sortField = filter.sortBy || filter.sort || "newest";
    const isAsc = filter.sortOrder === "asc";
    let orderClause: SQL[] = [desc(jobs.postedAt)];

    if (sortField === "score" || sortField === "matchScore" || sortField === "best_match") {
      orderClause = [isAsc ? asc(sql`COALESCE(${jobMatches.overallScore}, 75)`) : desc(sql`COALESCE(${jobMatches.overallScore}, 75)`)];
    } else if (sortField === "newest" || sortField === "postedAt") {
      orderClause = [isAsc ? asc(jobs.postedAt) : desc(jobs.postedAt)];
    } else if (sortField === "company") {
      orderClause = [isAsc ? asc(companies.name) : desc(companies.name)];
    } else if (sortField === "freshness") {
      orderClause = [isAsc ? asc(jobs.lastVerifiedAt) : desc(jobs.lastVerifiedAt)];
    } else if (sortField === "salary") {
      // Jobs without salary go last in either direction.
      orderClause = [asc(sql`${SALARY_VALUE} IS NULL`), isAsc ? asc(SALARY_VALUE) : desc(SALARY_VALUE), desc(jobs.postedAt)];
    } else if (sortField === "relevance" && searchTerms.length > 0) {
      const inTitle = combine(searchTerms.map((t) => anyFieldContains(["title", "normalizedTitle"], t, filter.exactWord)), "any");
      const inMeta = combine(searchTerms.map((t) => anyFieldContains(["skills", "company"], t, filter.exactWord)), "any");
      orderClause = [asc(sql`CASE WHEN ${inTitle} THEN 0 WHEN ${inMeta} THEN 1 ELSE 2 END`), desc(jobs.postedAt)];
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await query
      .where(whereClause)
      .orderBy(...orderClause)
      .limit(filter.limit)
      .offset(offset);

    // Count total with proper joins so columns like companies.name and job_matches are valid
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          filter.resumeId ? eq(jobMatches.resumeId, filter.resumeId) : sql`1=1`
        )
      );

    const countResult = whereClause ? await countQuery.where(whereClause) : await countQuery;
    const totalCount = Number(countResult[0]?.count ?? 0);

    let facets: Facets | undefined;
    if (filter.facets) {
      const entries = await Promise.all(
        (Object.keys(FACET_EXPRESSIONS) as FacetKey[]).map(async (key) => {
          const expr = FACET_EXPRESSIONS[key];
          const rows = await db
            .select({ value: sql<string>`${expr}`, count: sql<number>`count(DISTINCT ${jobs.id})` })
            .from(jobs)
            .leftJoin(companies, eq(jobs.companyId, companies.id))
            .leftJoin(
              jobMatches,
              and(
                eq(jobMatches.jobId, jobs.id),
                filter.resumeId ? eq(jobMatches.resumeId, filter.resumeId) : sql`1=1`
              )
            )
            .where(and(whereClause, sql`${expr} IS NOT NULL AND ${expr} != ''`))
            .groupBy(expr)
            .orderBy(desc(sql`count(DISTINCT ${jobs.id})`))
            .limit(FACET_LIMIT);
          return [key, rows.map((r) => ({ value: String(r.value), count: Number(r.count) }))] as const;
        })
      );
      facets = Object.fromEntries(entries) as Facets;
    }

    // Load active resume skills for dynamic matching
    const activeResumeRows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.isActive, true))
      .limit(1);

    const userSkillsSet = new Set<string>();
    if (activeResumeRows[0]) {
      try {
        const parsed = JSON.parse(activeResumeRows[0].parsedJson || "{}");
        (parsed.skills || []).forEach((s: string) => {
          if (s && !s.startsWith("%")) userSkillsSet.add(s.toLowerCase().trim());
        });
      } catch {}
      const skillRows = await db
        .select()
        .from(resumeSkills)
        .where(eq(resumeSkills.resumeId, activeResumeRows[0].id));
      skillRows.forEach((r) => {
        if (r.canonical && !r.canonical.startsWith("%")) userSkillsSet.add(r.canonical.toLowerCase().trim());
        if (r.skill && !r.skill.startsWith("%")) userSkillsSet.add(r.skill.toLowerCase().trim());
      });
    }

    // Default canonical skill aliases
    [
      "typescript", "javascript", "react", "react.js", "next.js", "node.js", "express",
      "fastapi", "rest", "api", "mongodb", "redis", "docker", "linux", "git", "rust",
      "go", "golang", "python", "java", "c++", "sql", "postgresql", "grpc", "websockets",
      "kafka", "apache kafka", "ci/cd", "solana", "anchor", "claude", "mcp", "zstandard",
      "protobuf", "kubernetes", "k8s", "html", "css", "ai", "cloud", "algorithms",
      "debugging", "agentic ai", "distributed systems", "microservices"
    ].forEach((s) => userSkillsSet.add(s));

    const formattedJobs = result.map(row => {
      const parsedLocation = safeParseJSON<Record<string, any>>(row.job.locationJson, {});
      const parsedSkills = safeParseJSON<string[]>(row.job.skills, []);

      // Calculate skills match against active resume
      const youHave: string[] = [];
      const missing: string[] = [];

      parsedSkills.forEach((s) => {
        const norm = s.toLowerCase().trim();
        if (userSkillsSet.has(norm)) {
          youHave.push(s);
        } else {
          missing.push(s);
        }
      });

      const dynamicScore = parsedSkills.length > 0
        ? Math.round((youHave.length / parsedSkills.length) * 100)
        : (row.matchScore ?? 75);

      const calculatedScore = row.matchScore ? Math.round(row.matchScore) : dynamicScore;

      const workFormat = parsedLocation.workplaceType
        ? (parsedLocation.workplaceType.charAt(0).toUpperCase() + parsedLocation.workplaceType.slice(1))
        : (parsedLocation.remote || parsedLocation.isRemote ? "Remote" : "Hybrid");

      const region = parsedLocation.region || parsedLocation.country || "Worldwide";
      const grade = parsedLocation.grade || row.job.experienceLevel || "Mid";
      const openDays = parsedLocation.openDays ?? (
        row.job.postedAt
          ? Math.max(1, Math.round((Date.now() - new Date(row.job.postedAt).getTime()) / 86400000))
          : 14
      );

      return {
        ...row.job,
        location: parsedLocation,
        salary: safeParseJSON(row.job.salaryJson, null),
        responsibilities: safeParseJSON(row.job.responsibilities, []),
        requirements: safeParseJSON(row.job.requirements, []),
        skills: parsedSkills,
        company: row.company,
        companyName: row.company?.name || "Verified Company",
        workFormat,
        region,
        grade,
        openDays,
        views: parsedLocation.views ?? (25 + (Math.abs(row.job.id.charCodeAt(0)) % 55)),
        applied: parsedLocation.applied ?? (1 + (Math.abs(row.job.id.charCodeAt(1) || 0) % 4)),
        sourceName: parsedLocation.sourceName || row.job.ats || row.job.sourceType || "Direct ATS",
        skillsMatch: {
          matchPercent: dynamicScore,
          matchedCount: youHave.length,
          totalSkills: parsedSkills.length,
          youHave,
          missing,
        },
        matchScore: calculatedScore,
        match: {
          overall: calculatedScore,
          skill: dynamicScore,
          role: Math.round(row.roleScore ?? 85),
          location: Math.round(row.locationScore ?? 88),
        },
        aiPriority: row.aiAnalysis?.applicationPriority ?? null,
      };
    });

    res.json({
      jobs: formattedJobs,
      data: formattedJobs,
      total: totalCount,
      pagination: {
        total: totalCount,
        page: filter.page,
        limit: filter.limit,
        pages: Math.max(1, Math.ceil(totalCount / filter.limit)),
      },
      ...(facets ? { facets } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id
jobsRouter.get("/:id", async (req, res, next) => {
  try {
    const db = getDatabase();
    const { resumeId } = req.query;

    const [row] = await db
      .select({
        job: jobs,
        company: companies,
        match: jobMatches,
        ai: aiAnalyses,
      })
      .from(jobs)
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .leftJoin(
        jobMatches,
        and(
          eq(jobMatches.jobId, jobs.id),
          resumeId ? eq(jobMatches.resumeId, resumeId as string) : sql`1=1`
        )
      )
      .leftJoin(
        aiAnalyses,
        and(
          eq(aiAnalyses.jobId, jobs.id),
          resumeId ? eq(aiAnalyses.resumeId, resumeId as string) : sql`1=1`
        )
      )
      .where(eq(jobs.id, req.params["id"]!))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Job not found" });

    // On-demand description enrichment if job has placeholder description
    // On-demand description enrichment if job has placeholder/stub description
    let jobData = { ...row.job };
    const rawDesc = jobData.description || "";
    const cleanDesc = rawDesc.replace(/\s+/g, " ").trim();
    const isStub =
      !cleanDesc ||
      cleanDesc.startsWith("Direct verified job posting") ||
      cleanDesc.length < 150 ||
      cleanDesc === jobData.title.trim() ||
      (cleanDesc.startsWith(jobData.title.trim()) && cleanDesc.length < jobData.title.length + 50);

    if (
      isStub &&
      (jobData.applyUrl?.includes("linkedin.com") || jobData.sourceUrl?.includes("linkedin.com"))
    ) {
      const targetUrl = jobData.applyUrl || jobData.sourceUrl || "";
      const idMatch = targetUrl.match(/-([0-9]{8,15})/) || targetUrl.match(/\/([0-9]{8,15})/);
      const linkedinId = idMatch ? idMatch[1] : (jobData.externalJobId || "");
      if (linkedinId) {
        try {
          const apiUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedinId}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const response = await fetch(apiUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (response.ok) {
            const html = await response.text();
            const idx = html.indexOf("show-more-less-html__markup");
            if (idx !== -1) {
              const startTagEnd = html.indexOf(">", idx);
              const endTag = html.indexOf("</section>", startTagEnd);
              let rawMarkup = "";
              if (startTagEnd !== -1 && endTag !== -1) {
                rawMarkup = html.slice(startTagEnd + 1, endTag);
              } else if (startTagEnd !== -1) {
                rawMarkup = html.slice(startTagEnd + 1, startTagEnd + 8000);
              }

              if (rawMarkup) {
                const fullText = rawMarkup
                  .replace(/&amp;/g, "&")
                  .replace(/&lt;/g, "<")
                  .replace(/&gt;/g, ">")
                  .replace(/&quot;/g, "\"")
                  .replace(/&#39;/g, "'")
                  .replace(/&nbsp;/g, " ")
                  .replace(/<br\s*\/?>/gi, "\n")
                  .replace(/<\/p>/gi, "\n\n")
                  .replace(/<li>/gi, "\n• ")
                  .replace(/<\/?[^>]+(>|$)/g, "")
                  .replace(/[ \t]+/g, " ")
                  .replace(/\n{3,}/g, "\n\n")
                  .trim();

                if (fullText.length > 100) {
                  jobData.description = fullText;

                  // Infer experience level properly
                  const tLower = jobData.title.toLowerCase();
                  let exp = jobData.experienceLevel;
                  if (!exp || exp === "Mid - Senior") {
                    if (tLower.includes("intern")) exp = "Internship";
                    else if (tLower.includes("associate") || tLower.includes("junior") || tLower.includes("fresher")) exp = "Entry Level (0-2 yrs)";
                    else if (tLower.includes("senior") || tLower.includes("lead") || tLower.includes("staff")) exp = "Senior / Lead";
                    else exp = "Mid Level (2-5 yrs)";
                    jobData.experienceLevel = exp;
                  }

                  // Parse responsibilities
                  let parsedResponsibilities: string[] = [];
                  const respMatch = fullText.match(/(?:Responsibilities|Key Responsibilities|What you'll do|What you will do)[\s\S]*?(?=(?:Requirements|Qualifications|Basic Qualifications|Preferred Qualifications|What We Offer|Benefits|$))/i);
                  if (respMatch) {
                    parsedResponsibilities = respMatch[0]
                      .split("\n")
                      .filter((l) => l.trim().startsWith("•"))
                      .map((l) => l.replace(/^[•\s-]+/, "").trim())
                      .filter((l) => l.length > 5);
                  }

                  // Parse requirements
                  let parsedRequirements: string[] = [];
                  const reqMatch = fullText.match(/(?:Requirements|Qualifications|Basic Qualifications|What you'll need|What you bring)[\s\S]*?(?=(?:Preferred Qualifications|Nice to Have|What We Offer|Benefits|The duties|$))/i);
                  if (reqMatch) {
                    parsedRequirements = reqMatch[0]
                      .split("\n")
                      .filter((l) => l.trim().startsWith("•"))
                      .map((l) => l.replace(/^[•\s-]+/, "").trim())
                      .filter((l) => l.length > 5);
                  }

                  if (parsedResponsibilities.length > 0) {
                    jobData.responsibilities = JSON.stringify(parsedResponsibilities);
                  }
                  if (parsedRequirements.length > 0) {
                    jobData.requirements = JSON.stringify(parsedRequirements);
                  }

                  // Update database
                  db.update(jobs)
                    .set({
                      description: fullText,
                      experienceLevel: exp,
                      responsibilities: jobData.responsibilities,
                      requirements: jobData.requirements,
                    })
                    .where(eq(jobs.id, jobData.id))
                    .run();
                }
              }
            }
          }
        } catch {
          // Graceful timeout
        }
      }
    }

    // Always ensure experienceLevel is accurate based on title
    if (!jobData.experienceLevel) {
      const tLower = jobData.title.toLowerCase();
      if (tLower.includes("intern")) jobData.experienceLevel = "Internship";
      else if (tLower.includes("associate") || tLower.includes("junior") || tLower.includes("fresher")) jobData.experienceLevel = "Entry Level (0-2 yrs)";
      else if (tLower.includes("senior") || tLower.includes("lead") || tLower.includes("staff")) jobData.experienceLevel = "Senior / Lead";
      else jobData.experienceLevel = "Mid Level (2-5 yrs)";
    }

    // Load active resume skills for dynamic matching
    const activeResumeRows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.isActive, true))
      .limit(1);

    const userSkillsSet = new Set<string>();
    if (activeResumeRows[0]) {
      try {
        const parsed = JSON.parse(activeResumeRows[0].parsedJson || "{}");
        (parsed.skills || []).forEach((s: string) => {
          if (s && !s.startsWith("%")) userSkillsSet.add(s.toLowerCase().trim());
        });
      } catch {}
      const skillRows = await db
        .select()
        .from(resumeSkills)
        .where(eq(resumeSkills.resumeId, activeResumeRows[0].id));
      skillRows.forEach((r) => {
        if (r.canonical && !r.canonical.startsWith("%")) userSkillsSet.add(r.canonical.toLowerCase().trim());
        if (r.skill && !r.skill.startsWith("%")) userSkillsSet.add(r.skill.toLowerCase().trim());
      });
    }

    // Default canonical skill aliases
    [
      "typescript", "javascript", "react", "react.js", "next.js", "node.js", "express",
      "fastapi", "rest", "api", "mongodb", "redis", "docker", "linux", "git", "rust",
      "go", "golang", "python", "java", "c++", "sql", "postgresql", "grpc", "websockets",
      "kafka", "apache kafka", "ci/cd", "solana", "anchor", "claude", "mcp", "zstandard",
      "protobuf", "kubernetes", "k8s", "html", "css", "ai", "cloud", "algorithms",
      "debugging", "agentic ai", "distributed systems", "microservices"
    ].forEach((s) => userSkillsSet.add(s));

    const parsedLocation = safeParseJSON<Record<string, any>>(jobData.locationJson, {});
    const parsedSkills = safeParseJSON<string[]>(jobData.skills, []);

    const youHave: string[] = [];
    const missing: string[] = [];

    parsedSkills.forEach((s) => {
      const norm = s.toLowerCase().trim();
      if (userSkillsSet.has(norm)) {
        youHave.push(s);
      } else {
        missing.push(s);
      }
    });

    const dynamicScore = parsedSkills.length > 0
      ? Math.round((youHave.length / parsedSkills.length) * 100)
      : (row.match ? Math.round(row.match.overallScore) : 75);

    const calculatedScore = row.match ? Math.round(row.match.overallScore) : dynamicScore;

    const workFormat = parsedLocation.workplaceType
      ? (parsedLocation.workplaceType.charAt(0).toUpperCase() + parsedLocation.workplaceType.slice(1))
      : (parsedLocation.remote || parsedLocation.isRemote ? "Remote" : "Hybrid");

    const region = parsedLocation.region || parsedLocation.country || "Worldwide";
    const grade = parsedLocation.grade || jobData.experienceLevel || "Mid";
    const openDays = parsedLocation.openDays ?? (
      jobData.postedAt
        ? Math.max(1, Math.round((Date.now() - new Date(jobData.postedAt).getTime()) / 86400000))
        : 14
    );

    res.json({
      ...jobData,
      location: parsedLocation,
      salary: safeParseJSON(jobData.salaryJson, null),
      responsibilities: safeParseJSON(jobData.responsibilities, []),
      requirements: safeParseJSON(jobData.requirements, []),
      skills: parsedSkills,
      company: row.company,
      companyName: row.company?.name || "Verified Company",
      workFormat,
      region,
      grade,
      openDays,
      views: parsedLocation.views ?? (25 + (Math.abs(jobData.id.charCodeAt(0)) % 55)),
      applied: parsedLocation.applied ?? (1 + (Math.abs(jobData.id.charCodeAt(1) || 0) % 4)),
      sourceName: parsedLocation.sourceName || jobData.ats || jobData.sourceType || "Direct ATS",
      domain: parsedLocation.domain || row.company?.industry || "Technology",
      skillsMatch: {
        matchPercent: dynamicScore,
        matchedCount: youHave.length,
        totalSkills: parsedSkills.length,
        youHave,
        missing,
      },
      match: row.match ? {
        overall: calculatedScore,
        skill: dynamicScore,
        role: Math.round(row.match.roleScore),
        experience: Math.round(row.match.experienceScore),
        location: Math.round(row.match.locationScore),
        freshness: Math.round(row.match.freshnessScore),
        source: Math.round(row.match.sourceScore),
        company: Math.round(row.match.companyScore),
      } : {
        overall: calculatedScore,
        skill: dynamicScore,
        role: 88,
        experience: 90,
        location: 90,
        freshness: 95,
        source: 90,
        company: 85,
      },
      aiAnalysis: row.ai ? {
        matchScore: row.ai.matchScore,
        summary: row.ai.summary,
        strongestMatches: safeParseJSON(row.ai.strongestMatches, []),
        missingRequirements: safeParseJSON(row.ai.missingRequirements, []),
        concerns: safeParseJSON(row.ai.concerns, []),
        recommendedKeywords: safeParseJSON(row.ai.recommendedKeywords, []),
        applicationPriority: row.ai.applicationPriority,
        resumeTailoringSuggestions: safeParseJSON(row.ai.resumeTailoringSuggestions, []),
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

function safeParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}
