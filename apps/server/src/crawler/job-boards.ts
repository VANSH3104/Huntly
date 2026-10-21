/**
 * Public, key-less job boards and a company-ATS sweeper, all normalized to BoardJob
 * and ingested through one path (ingestBoardJobs).
 */

import { EventEmitter } from "node:events";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { and, eq, or } from "drizzle-orm";
import { getDatabase, jobs, companies, resumes } from "@huntly/database";
import type { JobLocation } from "@huntly/shared";
import { normalizeJobTitle, normalizeLocation, extractSkillsFromText, extractDomain, calculateRoleFingerprint } from "../utils/normalize.js";
import { JobMatcher } from "../services/job-matcher.js";
import { extractMetadataFromText } from "./social-yc-scraper.js";
import {
  type BoardJob, type BoardSource, type FetchOpts, type Sweeper,
  getJson, postJson, getText, decodeEntities, htmlToText, rssTag, toDate, positive, isRemoteText, remoteWithin,
  keywordMatcher, nextPage, titleCaseSlug, mapPool, atsSweep, boardEnabled, countryFromCode, detectCountry, detectCity,
  normalizeEmploymentType, inferExperienceLevel, experienceFromYears, salaryFromText,
} from "./job-boards-shared.js";
import { getPlaywrightEngine } from "./playwright-engine.js";
import { EXTRA_SOURCES } from "./job-boards-extra.js";
import { HARD_BOARDS } from "./job-boards-hard.js";

export type { BoardJob, FetchOpts } from "./job-boards-shared.js";

// ─── Live events ────────────────────────────────────────────────

export interface LiveEvent {
  type: "board_start" | "board_done" | "job_added" | "error";
  board: string;
  at: number;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  fetched?: number;
  added?: number;
  message?: string;
}

export const crawlLive = new EventEmitter();
// Every open SSE tab adds a listener; the default cap of 10 would print leak warnings.
crawlLive.setMaxListeners(0);

export function emitLive(evt: Omit<LiveEvent, "at"> & { at?: number }): void {
  crawlLive.emit("event", { at: Date.now(), ...evt } satisfies LiveEvent);
}

// ─── Boards ─────────────────────────────────────────────────────

async function fetchRemotive({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (keywords) params.set("search", keywords);
  const data = await getJson<{
    jobs: Array<{
      id: number; url: string; title: string; company_name: string; tags?: string[]; job_type?: string;
      publication_date?: string; candidate_required_location?: string; salary?: string; description?: string; category?: string;
    }>;
  }>(`https://remotive.com/api/remote-jobs?${params}`);
  return data.jobs.map(j => {
    const pay = j.salary ? extractMetadataFromText(j.salary) : {};
    return {
      board: "remotive",
      externalId: String(j.id),
      title: j.title,
      companyName: j.company_name,
      location: j.candidate_required_location || "Remote",
      remote: true,
      url: j.url,
      description: htmlToText(j.description),
      employmentType: j.job_type,
      tags: [...(j.tags ?? []), ...(j.category ? [j.category] : [])].map(t => t.trim()),
      salaryMin: pay.salaryMin,
      salaryMax: pay.salaryMax,
      salaryCurrency: pay.salaryCurrency,
      postedAt: toDate(j.publication_date),
    };
  });
}

async function fetchRemoteOK(_opts: FetchOpts): Promise<BoardJob[]> {
  const data = await getJson<Array<{
    id?: string; position?: string; company?: string; tags?: string[]; description?: string; location?: string;
    salary_min?: number; salary_max?: number; url?: string; apply_url?: string; epoch?: number;
  }>>("https://remoteok.com/api");
  // Element 0 is the API legal notice, not a job.
  return data.slice(1).filter(j => j.id && j.position).map(j => ({
    board: "remoteok",
    externalId: String(j.id),
    title: decodeEntities(j.position ?? ""),
    companyName: decodeEntities(j.company ?? ""),
    location: j.location || "Remote",
    remote: true,
    url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
    description: htmlToText(j.description),
    tags: j.tags ?? [],
    salaryMin: positive(j.salary_min),
    salaryMax: positive(j.salary_max),
    salaryCurrency: positive(j.salary_min) ? "USD" : undefined,
    postedAt: toDate(j.epoch),
  }));
}

async function fetchArbeitnow({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  // 300 jobs per page and no search param; scan extra pages when filtering client-side.
  const pages = Math.min(5, Math.ceil(limit / 300) * (keywords ? 3 : 1));
  const responses = await mapPool(Array.from({ length: pages }, (_, i) => i + 1), 3, page =>
    getJson<{ data: Array<{
      slug: string; company_name: string; title: string; description: string; remote: boolean; url: string;
      tags?: string[]; job_types?: string[]; location?: string; created_at?: number;
    }> }>(`https://www.arbeitnow.com/api/job-board-api?page=${page}`).catch(err => {
      console.warn(`[JobBoards] arbeitnow page ${page}:`, err?.message);
      return { data: [] };
    }),
  );
  return responses.flatMap(r => r.data).map(j => ({
    board: "arbeitnow",
    externalId: j.slug,
    title: j.title,
    companyName: j.company_name.replace(/\s+/g, " ").trim(),
    location: j.location || (j.remote ? "Remote" : "Germany"),
    remote: j.remote,
    url: j.url,
    description: htmlToText(j.description),
    employmentType: j.job_types?.[0],
    tags: [...(j.tags ?? []), ...(j.job_types ?? [])],
    postedAt: toDate(j.created_at),
  }));
}

async function fetchJobicy({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = {
    nextCursor?: string; hasMore?: boolean;
    jobs?: Array<{
      id: number; url: string; jobTitle: string; companyName: string; jobIndustry?: string[]; jobType?: string[];
      jobGeo?: string; jobLevel?: string; jobDescription?: string; pubDate?: string;
      salaryMin?: number; salaryMax?: number; salaryCurrency?: string;
    }>;
  };
  const out: NonNullable<Resp["jobs"]> = [];
  let cursor: string | undefined;
  while (out.length < limit) {
    const params = new URLSearchParams({ count: String(Math.min(100, limit - out.length)) });
    if (keywords) params.set("tag", keywords);
    if (cursor) params.set("cursor", cursor);
    const data = await nextPage(getJson<Resp>(`https://jobicy.com/api/v2/remote-jobs?${params}`), out.length, "jobicy");
    if (!data) break;
    out.push(...(data.jobs ?? []));
    if (!data.hasMore || !data.nextCursor || !data.jobs?.length) break;
    cursor = data.nextCursor;
  }
  return out.map(j => ({
    board: "jobicy",
    externalId: String(j.id),
    title: decodeEntities(j.jobTitle),
    companyName: decodeEntities(j.companyName),
    location: j.jobGeo || "Remote",
    remote: true,
    url: j.url,
    description: htmlToText(j.jobDescription),
    employmentType: j.jobType?.[0],
    tags: j.jobIndustry ?? [],
    salaryMin: positive(j.salaryMin),
    salaryMax: positive(j.salaryMax),
    salaryCurrency: j.salaryCurrency,
    postedAt: toDate(j.pubDate),
    experienceLevel: j.jobLevel,
  }));
}

async function fetchHimalayas({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  type Resp = {
    nextCursor?: string;
    jobs?: Array<{
      title: string; companyName: string; companySlug?: string; employmentType?: string; minSalary?: number | null;
      maxSalary?: number | null; currency?: string | null; seniority?: string[]; locationRestrictions?: string[];
      categories?: string[]; parentCategories?: string[]; description?: string; pubDate?: number;
      applicationLink?: string; guid: string;
    }>;
  };
  // The API caps each page at 20 jobs; the search endpoint pages by number, the feed by cursor.
  const out: NonNullable<Resp["jobs"]> = [];
  let cursor: string | undefined;
  for (let page = 1; out.length < limit && page <= Math.ceil(limit / 20); page++) {
    const url = keywords
      ? `https://himalayas.app/jobs/api/search?${new URLSearchParams({ q: keywords, page: String(page) })}`
      : `https://himalayas.app/jobs/api?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`;
    const data = await nextPage(getJson<Resp>(url), out.length, "himalayas");
    if (!data) break;
    out.push(...(data.jobs ?? []));
    if (!data.jobs?.length || (!keywords && !data.nextCursor)) break;
    cursor = data.nextCursor;
  }
  return out.map(j => ({
    board: "himalayas",
    externalId: j.guid,
    title: j.title,
    companyName: j.companyName,
    companyUrl: j.companySlug ? `https://himalayas.app/companies/${j.companySlug}` : undefined,
    location: remoteWithin(j.locationRestrictions ?? []),
    remote: true,
    url: j.guid,
    description: htmlToText(j.description),
    employmentType: j.employmentType,
    tags: [...(j.parentCategories ?? []), ...(j.categories ?? []).slice(0, 5).map(c => c.replace(/-/g, " "))],
    salaryMin: positive(j.minSalary),
    salaryMax: positive(j.maxSalary),
    salaryCurrency: positive(j.minSalary) || positive(j.maxSalary) ? j.currency ?? undefined : undefined,
    postedAt: toDate(j.pubDate),
    experienceLevel: j.seniority?.[0],
  }));
}

async function fetchTheMuse({ keywords, limit }: FetchOpts): Promise<BoardJob[]> {
  const pages = Math.min(50, Math.ceil(limit / 20) * (keywords ? 3 : 1));
  const responses = await mapPool(Array.from({ length: pages }, (_, i) => i), 4, page =>
    getJson<{ results: Array<{
      id: number; name: string; contents?: string; publication_date?: string;
      locations?: Array<{ name: string }>; levels?: Array<{ name: string }>; categories?: Array<{ name: string }>;
      company?: { name: string; short_name?: string }; refs?: { landing_page?: string };
    }> }>(`https://www.themuse.com/api/public/jobs?page=${page}`).catch(err => {
      console.warn(`[JobBoards] themuse page ${page}:`, err?.message);
      return { results: [] };
    }),
  );
  return responses.flatMap(r => r.results).map(j => {
    const location = (j.locations ?? []).map(l => l.name).join("; ");
    return {
      board: "themuse",
      externalId: String(j.id),
      title: j.name,
      companyName: j.company?.name ?? "Unknown",
      location: location || "Unspecified",
      remote: isRemoteText(location),
      url: j.refs?.landing_page ?? `https://www.themuse.com/jobs/${j.company?.short_name ?? "company"}/${j.id}`,
      description: htmlToText(j.contents),
      tags: (j.categories ?? []).map(c => c.name),
      postedAt: toDate(j.publication_date),
      experienceLevel: j.levels?.[0]?.name,
    };
  });
}

const WWR_CATEGORIES = [
  "remote-programming-jobs",
  "remote-full-stack-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-front-end-programming-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-design-jobs",
  "remote-product-jobs",
  "remote-customer-support-jobs",
  "remote-sales-and-marketing-jobs",
  "remote-management-and-finance-jobs",
  "all-other-remote-jobs",
];

async function fetchWeWorkRemotely(_opts: FetchOpts): Promise<BoardJob[]> {
  const feeds = await mapPool(WWR_CATEGORIES, 4, cat =>
    getText(`https://weworkremotely.com/categories/${cat}.rss`, "application/rss+xml").catch(err => {
      console.warn(`[JobBoards] weworkremotely ${cat}:`, err?.message);
      return "";
    }),
  );
  return feeds.flatMap(xml => xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).map(item => {
    // Titles are "Company: Role"; the company never contains ": ".
    const rawTitle = decodeEntities(rssTag(item, "title"));
    const sep = rawTitle.indexOf(": ");
    const link = rssTag(item, "link") || rssTag(item, "guid");
    const region = decodeEntities(rssTag(item, "region"));
    const country = decodeEntities(rssTag(item, "country"));
    return {
      board: "weworkremotely",
      externalId: link,
      title: sep > 0 ? rawTitle.slice(sep + 2) : rawTitle,
      companyName: sep > 0 ? rawTitle.slice(0, sep) : "Unknown",
      location: [region, country].filter(Boolean).join(", ") || "Remote",
      remote: true,
      url: link,
      description: htmlToText(rssTag(item, "description")),
      employmentType: rssTag(item, "type") || undefined,
      tags: [rssTag(item, "category"), ...rssTag(item, "skills").split(/,| and /)].map(s => decodeEntities(s).trim()).filter(Boolean),
      postedAt: toDate(rssTag(item, "pubDate")),
    };
  });
}

async function fetchWorkingNomads(_opts: FetchOpts): Promise<BoardJob[]> {
  const data = await getJson<Array<{
    url: string; title: string; description?: string; company_name: string; category_name?: string;
    tags?: string; location?: string; pub_date?: string;
  }>>("https://www.workingnomads.com/api/exposed_jobs/");
  return data.map(j => ({
    board: "workingnomads",
    externalId: j.url.match(/\/(\d+)\/?$/)?.[1] ?? j.url,
    title: j.title,
    companyName: j.company_name,
    location: j.location || "Remote",
    remote: true,
    url: j.url,
    description: htmlToText(j.description),
    tags: [...(j.category_name ? [j.category_name] : []), ...(j.tags ?? "").split(",").map(t => t.trim()).filter(Boolean)],
    postedAt: toDate(j.pub_date),
  }));
}

// ─── Company ATS sweeper ────────────────────────────────────────

type SweepAts = "greenhouse" | "lever" | "ashby" | "workable" | "smartrecruiters" | "recruitee" | "workday" | "bamboohr" | "breezy" | "rippling";

// Verified live (non-empty boards) on 2026-10-19; a slug that later dies just yields [].
export const ATS_COMPANY_SLUGS: Record<SweepAts, readonly string[]> = {
  greenhouse: [
    "instacart", "coinbase", "reddit", "discord", "stripe", "figma", "dropbox", "robinhood", "pinterest", "lyft",
    "doordashusa", "gitlab", "airtable", "elastic", "asana", "cloudflare", "airbnb", "okta", "datadog", "twilio",
    "brex", "mongodb", "gusto", "chime", "affirm", "cockroachlabs", "vercel", "netlify", "databricks", "squarespace",
    "peloton", "twitch", "roblox", "sofi", "epicgames", "riotgames", "scaleai", "duolingo", "waymo", "nuro",
    "carta", "toast", "flexport", "samsara", "anthropic", "gemini", "verkada", "fivetran", "faire", "newrelic",
    "pagerduty", "launchdarkly", "mixpanel", "intercom", "mozilla", "wikimedia", "coursera", "udemy", "calm", "braze",
    "khanacademy", "betterment", "lattice", "greenhouse", "zocdoc", "justworks", "flatironhealth", "yext", "lucidmotors", "contentful",
    "oscar", "sumologic", "checkr", "zscaler", "algolia", "grafanalabs", "medium", "planetscale", "tripadvisor", "klaviyo",
    "attentive", "tripactions", "nextdoor", "taskrabbit", "razorpaysoftwareprivatelimited", "groww", "inmobi", "agoda", "druva",
    "observeai", "slice", "rubrik", "netskope", "sentinellabs", "purestorage", "block", "honeycomb", "cribl", "singlestore",
    "yugabyte", "neo4j", "starburst", "dremio", "customerio", "postscript", "yotpo", "dialpad", "five9", "zoominfo",
    "salesloft", "6sense", "trustpilot",
  ],
  lever: [
    "zoox", "outreach", "veeva", "palantir", "coupa", "binance", "cred", "spotify", "anyscale", "meesho",
    "paytm", "zeta", "fampay", "ninjavan", "farfetch", "qonto", "swile", "blablacar", "pigment", "aircall",
    "malt", "tala", "shieldai", "hevodata", "jumpcloud", "mindtickle", "sysdig", "aledade", "arcadia", "rover",
    "gopuff", "ro", "gohighlevel", "levelai", "hive", "nium", "wealthfront", "metabase", "saviynt", "inkitt",
    "vrchat", "pointclickcare", "d2l", "fi", "porter", "deputy", "immutable", "brighte", "sonarsource", "fly",
  ],
  ashby: [
    "posthog", "linear", "supabase", "vanta", "replit", "cohere", "runway", "perplexity", "elevenlabs", "sierra",
    "notion", "modal", "clerk", "cursor", "harvey", "openai", "resend", "pinecone", "ramp", "zapier",
    "weaviate", "character", "langchain", "watershed", "hex", "lemonade", "snyk", "deliveroo", "multiverse", "docker",
    "synthesia", "poolside", "plaid", "writer", "quora", "airbyte", "prefect", "alan", "temporal", "neon",
    "railway", "render", "tldraw", "inngest", "sanity", "ghost", "buffer", "gitbook", "mintlify", "readme",
    "socket", "semgrep", "drata", "secureframe", "oneleet", "persona", "sardine", "moderntreasury", "column", "novo",
    "rho", "found", "1password", "atlan", "leap", "sarvam", "baseten", "fireworks", "runpod", "lambda", "crusoe",
    "cognition", "warp", "zed", "webflow", "hightouch", "motherduck", "clickhouse", "workos", "knock", "attio",
    "twenty", "pylon", "plain", "decagon", "rogo", "gamma", "ideogram", "midjourney", "pika", "suno",
    "black-forest-labs", "reka", "lancedb", "unstructured", "llamaindex", "e2b", "browserbase", "steel", "firecrawl", "exa",
    "tavily",
  ],
  workable: [
    "blueground", "skroutz", "huggingface", "epignosis", "upstream", "persado", "orfium", "learnworlds", "netguru", "zyte",
    "agileactors", "loopme",
  ],
  smartrecruiters: [
    "Ubisoft2", "Experian", "BoschGroup", "Equinox", "McDonaldsCorporation", "LinkedIn3", "ServiceNow", "WesternDigital", "Wise", "Freshworks",
    "Sodexo", "Accor", "Canva", "AveryDennison", "Endava", "Grab", "Uber", "Continental", "CERN", "NielsenIQ",
    "Colliers", "SGS", "Primark", "DeliveryHero", "Thales", "Allegro", "KPN",
  ],
  recruitee: ["bunq", "channable", "vandebron", "fastned", "inshared", "funda", "greenchoice", "effectory"],
  workday: [
    "nvidia/NVIDIAExternalCareerSite", "adobe/external_experienced", "salesforce/External_Career_Site",
    "target/targetcareers", "walmart/WalmartExternal", "dell/External",
  ],
  bamboohr: ["postman", "changeorg", "sourcegraph", "zapier", "hopin", "gumroad", "wrike"],
  breezy: ["turing", "contra", "superhuman", "doximity", "hopin"],
  rippling: ["anthropic", "perplexity", "dbt-labs", "brex", "checkr", "superhuman"],
};

// Lever and Ashby responses carry no company name, so slugs that don't title-case well are mapped.
const SLUG_NAMES: Record<string, string> = {
  doordashusa: "DoorDash", razorpaysoftwareprivatelimited: "Razorpay", tripactions: "Navan", lucidmotors: "Lucid Motors",
  scaleai: "Scale AI", cockroachlabs: "Cockroach Labs", epicgames: "Epic Games", riotgames: "Riot Games",
  newrelic: "New Relic", launchdarkly: "LaunchDarkly", pagerduty: "PagerDuty", khanacademy: "Khan Academy",
  flatironhealth: "Flatiron Health", sumologic: "Sumo Logic", grafanalabs: "Grafana Labs", planetscale: "PlanetScale",
  tripadvisor: "Tripadvisor", taskrabbit: "TaskRabbit", inmobi: "InMobi", gitlab: "GitLab", mongodb: "MongoDB",
  sofi: "SoFi", posthog: "PostHog", elevenlabs: "ElevenLabs", openai: "OpenAI", langchain: "LangChain",
  moderntreasury: "Modern Treasury", "1password": "1Password", gitbook: "GitBook", shieldai: "Shield AI",
  hevodata: "Hevo Data", jumpcloud: "JumpCloud", mindtickle: "Mindtickle", gohighlevel: "HighLevel", levelai: "Level AI",
  vrchat: "VRChat", pointclickcare: "PointClickCare", d2l: "D2L", ro: "Ro", cred: "CRED", fampay: "FamPay",
  ninjavan: "Ninja Van", blablacar: "BlaBlaCar", cursor: "Cursor", character: "Character.AI", hex: "Hex",
  observeai: "Observe.AI", sentinellabs: "SentinelOne", purestorage: "Pure Storage", singlestore: "SingleStore",
  customerio: "Customer.io", zoominfo: "ZoomInfo", fi: "Fi Money", sonarsource: "SonarSource", fly: "Fly.io",
  workos: "WorkOS", motherduck: "MotherDuck", clickhouse: "ClickHouse", llamaindex: "LlamaIndex", lancedb: "LanceDB",
  e2b: "E2B", sarvam: "Sarvam AI", runpod: "RunPod", neo4j: "Neo4j", yugabyte: "Yugabyte",
  "nvidia/NVIDIAExternalCareerSite": "NVIDIA", "adobe/external_experienced": "Adobe",
  "salesforce/External_Career_Site": "Salesforce", "target/targetcareers": "Target",
  "walmart/WalmartExternal": "Walmart", "dell/External": "Dell Technologies",
  postman: "Postman", changeorg: "Change.org", sourcegraph: "Sourcegraph", zapier: "Zapier",
  hopin: "Hopin", gumroad: "Gumroad", wrike: "Wrike", turing: "Turing", contra: "Contra",
  superhuman: "Superhuman", doximity: "Doximity", "dbt-labs": "dbt Labs", brex: "Brex",
};

function slugName(slug: string): string {
  return SLUG_NAMES[slug] ?? titleCaseSlug(slug);
}

// Greenhouse/Lever/Ashby use the same endpoints as ats-adapters.ts, but read the raw responses because
// ExtractedJob drops the location text, company name, remote flag and salary that a board listing needs.

async function sweepGreenhouse(slug: string): Promise<BoardJob[]> {
  const data = await getJson<{
    jobs?: Array<{
      id: number; title: string; content?: string; location?: { name?: string }; absolute_url: string;
      company_name?: string; first_published?: string; updated_at?: string;
    }>;
  }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return (data.jobs ?? []).map(j => {
    const location = j.location?.name?.trim() ?? "";
    return {
      board: "greenhouse",
      externalId: String(j.id),
      title: j.title,
      companyName: j.company_name || slugName(slug),
      companyUrl: `https://boards.greenhouse.io/${slug}`,
      location: location || "Unspecified",
      remote: isRemoteText(location, j.title),
      url: j.absolute_url,
      description: htmlToText(j.content),
      tags: [],
      postedAt: toDate(j.first_published ?? j.updated_at),
    };
  });
}

async function sweepLever(slug: string): Promise<BoardJob[]> {
  const data = await getJson<Array<{
    id: string; text: string; descriptionPlain?: string; additionalPlain?: string; hostedUrl: string; createdAt?: number;
    workplaceType?: string; country?: string;
    categories?: { location?: string; allLocations?: string[]; team?: string; department?: string; commitment?: string };
    salaryRange?: { min?: number; max?: number; currency?: string };
  }>>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return data.map(j => {
    const location = j.categories?.allLocations?.join("; ") || j.categories?.location || "";
    return {
      board: "lever",
      externalId: j.id,
      title: j.text,
      companyName: slugName(slug),
      companyUrl: `https://jobs.lever.co/${slug}`,
      location: location || (j.workplaceType === "remote" ? "Remote" : "Unspecified"),
      country: countryFromCode(j.country),
      remote: j.workplaceType === "remote" || isRemoteText(location),
      url: j.hostedUrl,
      description: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join("\n\n").trim(),
      employmentType: j.categories?.commitment,
      tags: [j.categories?.team, j.categories?.department].filter((t): t is string => !!t),
      salaryMin: positive(j.salaryRange?.min),
      salaryMax: positive(j.salaryRange?.max),
      salaryCurrency: j.salaryRange?.currency,
      postedAt: toDate(j.createdAt),
    };
  });
}

async function sweepAshby(slug: string): Promise<BoardJob[]> {
  const data = await getJson<{
    jobs?: Array<{
      id: string; title: string; department?: string; team?: string; employmentType?: string; location?: string;
      secondaryLocations?: Array<{ location?: string }>; publishedAt?: string; isListed?: boolean; isRemote?: boolean;
      jobUrl: string; descriptionPlain?: string;
    }>;
  }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return (data.jobs ?? []).filter(j => j.isListed !== false).map(j => {
    const location = [j.location, ...(j.secondaryLocations ?? []).map(l => l.location)].filter(Boolean).join("; ");
    return {
      board: "ashby",
      externalId: j.id,
      title: j.title,
      companyName: slugName(slug),
      companyUrl: `https://jobs.ashbyhq.com/${slug}`,
      location: location || (j.isRemote ? "Remote" : "Unspecified"),
      remote: !!j.isRemote || isRemoteText(location),
      url: j.jobUrl,
      description: j.descriptionPlain ?? "",
      employmentType: j.employmentType,
      tags: [j.department, j.team].filter((t): t is string => !!t),
      postedAt: toDate(j.publishedAt),
    };
  });
}

async function sweepWorkable(slug: string): Promise<BoardJob[]> {
  const data = await getJson<{
    name?: string;
    jobs?: Array<{
      title: string; shortcode: string; employment_type?: string; telecommuting?: boolean; department?: string;
      url: string; published_on?: string; country?: string; city?: string; state?: string; experience?: string;
      function?: string; industry?: string;
    }>;
  }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}`);
  const company = data.name || slugName(slug);
  return (data.jobs ?? []).map(j => {
    const location = [j.city, j.state, j.country].filter(Boolean).join(", ");
    return {
      board: "workable",
      externalId: j.shortcode,
      title: j.title,
      companyName: company,
      companyUrl: `https://apply.workable.com/${slug}/`,
      location: location || (j.telecommuting ? "Remote" : "Unspecified"),
      country: countryFromCode(j.country) ?? (j.country || undefined),
      city: j.city || undefined,
      remote: !!j.telecommuting || isRemoteText(j.title),
      url: j.url,
      // The widget API has no description; the department/function line is the best summary available.
      description: [j.department, j.function, j.industry].filter(Boolean).join(" · "),
      employmentType: j.employment_type || undefined,
      tags: [j.department, j.function].filter((t): t is string => !!t),
      postedAt: toDate(j.published_on),
      experienceLevel: j.experience || undefined,
    };
  });
}

async function sweepSmartRecruiters(slug: string): Promise<BoardJob[]> {
  // One page of 100 per company keeps giants like Bosch (5k+ postings) from swamping the sweep.
  const data = await getJson<{
    content?: Array<{
      id: string; name: string; releasedDate?: string; company?: { name?: string };
      location?: { city?: string; country?: string; fullLocation?: string; remote?: boolean; hybrid?: boolean };
      function?: { label?: string }; industry?: { label?: string }; typeOfEmployment?: { label?: string };
      experienceLevel?: { label?: string };
    }>;
  }>(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`);
  return (data.content ?? []).map(j => {
    const location = (j.location?.fullLocation ?? "").replace(/,\s*,/g, ",").trim();
    return {
      board: "smartrecruiters",
      externalId: j.id,
      title: j.name,
      companyName: j.company?.name || slugName(slug),
      companyUrl: `https://careers.smartrecruiters.com/${slug}`,
      location: location || "Unspecified",
      country: countryFromCode(j.location?.country),
      city: j.location?.city || undefined,
      remote: !!j.location?.remote,
      url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
      description: [j.function?.label, j.industry?.label, location].filter(Boolean).join(" · "),
      employmentType: j.typeOfEmployment?.label,
      tags: [j.function?.label, j.industry?.label].filter((t): t is string => !!t),
      postedAt: toDate(j.releasedDate),
      experienceLevel: j.experienceLevel?.label,
    };
  });
}

async function sweepRecruitee(slug: string): Promise<BoardJob[]> {
  const data = await getJson<{
    offers?: Array<{
      id: number; title: string; company_name?: string; careers_url: string; location?: string; remote?: boolean;
      description?: string; requirements?: string; department?: string; tags?: string[]; published_at?: string;
      employment_type_code?: string; experience_code?: string;
      salary?: { min?: string | number | null; max?: string | number | null; currency?: string | null };
    }>;
  }>(`https://${slug}.recruitee.com/api/offers/`);
  return (data.offers ?? []).map(j => ({
    board: "recruitee",
    externalId: String(j.id),
    title: j.title,
    companyName: j.company_name || slugName(slug),
    companyUrl: `https://${slug}.recruitee.com`,
    location: j.location || (j.remote ? "Remote" : "Unspecified"),
    remote: !!j.remote,
    url: j.careers_url,
    description: htmlToText(`${j.description ?? ""}\n${j.requirements ?? ""}`),
    employmentType: j.employment_type_code?.replace(/_/g, " "),
    tags: [...(j.department ? [j.department] : []), ...(j.tags ?? [])],
    salaryMin: positive(Number(j.salary?.min)),
    salaryMax: positive(Number(j.salary?.max)),
    salaryCurrency: j.salary?.currency ?? undefined,
    postedAt: toDate(j.published_at?.replace(" UTC", "Z").replace(" ", "T")),
    experienceLevel: j.experience_code?.replace(/_/g, " "),
  }));
}

async function sweepWorkday(slug: string): Promise<BoardJob[]> {
  const [tenant, site = "careers"] = slug.split("/");
  if (!tenant) return [];
  const endpoint = `https://${tenant}.wd1.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  try {
    const data = await postJson<{
      jobPostings?: Array<{
        title: string; externalPath: string; locationsText?: string; postedOn?: string; bulletFields?: string[];
      }>;
    }>(endpoint, { appliedFacets: {}, limit: 25, offset: 0 });

    return (data.jobPostings ?? []).map(j => {
      const location = j.locationsText || "Unspecified";
      const fullUrl = `https://${tenant}.wd1.myworkdayjobs.com/en-US/${site}${j.externalPath}`;
      return {
        board: "workday",
        externalId: j.externalPath.replace(/^\//, ""),
        title: j.title,
        companyName: slugName(slug),
        companyUrl: `https://${tenant}.wd1.myworkdayjobs.com/en-US/${site}`,
        location,
        remote: isRemoteText(location, j.title),
        url: fullUrl,
        description: j.bulletFields?.join(" · ") ?? "",
        tags: [],
        postedAt: toDate(j.postedOn),
      };
    });
  } catch {
    // Playwright browser fallback when HTTP endpoint is blocked
    try {
      const session = await getPlaywrightEngine().acquirePage(`${tenant}.wd1.myworkdayjobs.com`);
      try {
        const fullUrl = `https://${tenant}.wd1.myworkdayjobs.com/en-US/${site}`;
        await session.page.goto(fullUrl, { timeout: 20000, waitUntil: "domcontentloaded" });
        await session.page.waitForTimeout(2000);
        const links = await session.page.$$eval('a[href*="/job/"]', (anchors: any[]) =>
          anchors.map(a => ({ title: a.textContent?.trim(), href: a.href })).filter(x => x.title && x.href)
        );
        return links.slice(0, 25).map(l => ({
          board: "workday",
          externalId: l.href.split("/").pop() || l.href,
          title: l.title || "Job Opening",
          companyName: slugName(slug),
          companyUrl: fullUrl,
          location: "Unspecified",
          remote: isRemoteText(l.title),
          url: l.href,
          description: "",
          tags: [],
        }));
      } finally {
        await session.release();
      }
    } catch {
      return [];
    }
  }
}

async function sweepBambooHR(slug: string): Promise<BoardJob[]> {
  try {
    const data = await getJson<{
      result?: Array<{
        id: string | number; jobOpeningName: string; location?: { city?: string; state?: string };
        isRemote?: boolean; departmentLabel?: string;
      }>;
    }>(`https://${slug}.bamboohr.com/careers/list`);
    return (data.result ?? []).map(j => {
      const loc = [j.location?.city, j.location?.state].filter(Boolean).join(", ");
      return {
        board: "bamboohr",
        externalId: String(j.id),
        title: j.jobOpeningName,
        companyName: slugName(slug),
        companyUrl: `https://${slug}.bamboohr.com/careers`,
        location: loc || (j.isRemote ? "Remote" : "Unspecified"),
        remote: !!j.isRemote || isRemoteText(loc),
        url: `https://${slug}.bamboohr.com/careers/${j.id}`,
        description: j.departmentLabel || "",
        tags: j.departmentLabel ? [j.departmentLabel] : [],
      };
    });
  } catch {
    try {
      const session = await getPlaywrightEngine().acquirePage(`${slug}.bamboohr.com`);
      try {
        const fullUrl = `https://${slug}.bamboohr.com/careers`;
        await session.page.goto(fullUrl, { timeout: 20000, waitUntil: "domcontentloaded" });
        await session.page.waitForTimeout(2000);
        const links = await session.page.$$eval('a[href*="/careers/"]', (anchors: any[]) =>
          anchors.map(a => ({ title: a.textContent?.trim(), href: a.href })).filter(x => x.title && x.href)
        );
        return links.slice(0, 25).map(l => ({
          board: "bamboohr",
          externalId: l.href.split("/").pop() || l.href,
          title: l.title || "Job Opening",
          companyName: slugName(slug),
          companyUrl: fullUrl,
          location: "Unspecified",
          remote: isRemoteText(l.title),
          url: l.href,
          description: "",
          tags: [],
        }));
      } finally {
        await session.release();
      }
    } catch {
      return [];
    }
  }
}

async function sweepBreezy(slug: string): Promise<BoardJob[]> {
  try {
    const data = await getJson<Array<{
      id: string; name: string; url: string; department?: string;
      location?: { name?: string; is_remote?: boolean }; published_date?: string; type?: { name?: string };
    }>>(`https://${slug}.breezy.hr/json`);
    return data.map(j => ({
      board: "breezy",
      externalId: j.id,
      title: j.name,
      companyName: slugName(slug),
      companyUrl: `https://${slug}.breezy.hr`,
      location: j.location?.name || (j.location?.is_remote ? "Remote" : "Unspecified"),
      remote: !!j.location?.is_remote || isRemoteText(j.location?.name),
      url: j.url,
      description: [j.department, j.type?.name].filter(Boolean).join(" · "),
      employmentType: j.type?.name,
      tags: j.department ? [j.department] : [],
      postedAt: toDate(j.published_date),
    }));
  } catch {
    try {
      const session = await getPlaywrightEngine().acquirePage(`${slug}.breezy.hr`);
      try {
        const fullUrl = `https://${slug}.breezy.hr`;
        await session.page.goto(fullUrl, { timeout: 20000, waitUntil: "domcontentloaded" });
        await session.page.waitForTimeout(2000);
        const links = await session.page.$$eval('a[href*="/p/"]', (anchors: any[]) =>
          anchors.map(a => ({ title: a.textContent?.trim(), href: a.href })).filter(x => x.title && x.href)
        );
        return links.slice(0, 25).map(l => ({
          board: "breezy",
          externalId: l.href.split("/").pop() || l.href,
          title: l.title || "Job Opening",
          companyName: slugName(slug),
          companyUrl: fullUrl,
          location: "Unspecified",
          remote: isRemoteText(l.title),
          url: l.href,
          description: "",
          tags: [],
        }));
      } finally {
        await session.release();
      }
    } catch {
      return [];
    }
  }
}

async function sweepRippling(slug: string): Promise<BoardJob[]> {
  try {
    const data = await getJson<Array<{
      uuid: string; name: string; url?: string;
      locations?: Array<{ name?: string }>; department?: { name?: string };
      workLocationType?: string; publishedAt?: string;
    }>>(`https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`);
    return data.map(j => {
      const location = j.locations?.map(l => l.name).filter(Boolean).join(", ") || "";
      const remote = j.workLocationType === "REMOTE" || isRemoteText(location);
      const url = j.url || `https://ats.rippling.com/${slug}/jobs/${j.uuid}`;
      return {
        board: "rippling",
        externalId: j.uuid,
        title: j.name,
        companyName: slugName(slug),
        companyUrl: `https://ats.rippling.com/${slug}/jobs`,
        location: location || (remote ? "Remote" : "Unspecified"),
        remote,
        url,
        description: j.department?.name || "",
        tags: j.department?.name ? [j.department.name] : [],
        postedAt: toDate(j.publishedAt),
      };
    });
  } catch {
    try {
      const session = await getPlaywrightEngine().acquirePage("ats.rippling.com");
      try {
        const fullUrl = `https://ats.rippling.com/${slug}/jobs`;
        await session.page.goto(fullUrl, { timeout: 20000, waitUntil: "domcontentloaded" });
        await session.page.waitForTimeout(2000);
        const links = await session.page.$$eval('a[href*="/jobs/"]', (anchors: any[]) =>
          anchors.map(a => ({ title: a.textContent?.trim(), href: a.href })).filter(x => x.title && x.href)
        );
        return links.slice(0, 25).map(l => ({
          board: "rippling",
          externalId: l.href.split("/").pop() || l.href,
          title: l.title || "Job Opening",
          companyName: slugName(slug),
          companyUrl: fullUrl,
          location: "Unspecified",
          remote: isRemoteText(l.title),
          url: l.href,
          description: "",
          tags: [],
        }));
      } finally {
        await session.release();
      }
    } catch {
      return [];
    }
  }
}

const SWEEPERS: Record<SweepAts, { label: string; sweep: Sweeper }> = {
  greenhouse: { label: "Greenhouse companies", sweep: sweepGreenhouse },
  lever: { label: "Lever companies", sweep: sweepLever },
  ashby: { label: "Ashby companies", sweep: sweepAshby },
  workable: { label: "Workable companies", sweep: sweepWorkable },
  smartrecruiters: { label: "SmartRecruiters companies", sweep: sweepSmartRecruiters },
  recruitee: { label: "Recruitee companies", sweep: sweepRecruitee },
  workday: { label: "Workday companies", sweep: sweepWorkday },
  bamboohr: { label: "BambooHR companies", sweep: sweepBambooHR },
  breezy: { label: "BreezyHR companies", sweep: sweepBreezy },
  rippling: { label: "Rippling companies", sweep: sweepRippling },
};

// ─── Registry ───────────────────────────────────────────────────

const SOURCES: Record<string, BoardSource> = {
  remotive: { label: "Remotive", fetch: fetchRemotive },
  remoteok: { label: "Remote OK", fetch: fetchRemoteOK },
  arbeitnow: { label: "Arbeitnow", fetch: fetchArbeitnow },
  jobicy: { label: "Jobicy", fetch: fetchJobicy },
  himalayas: { label: "Himalayas", fetch: fetchHimalayas },
  themuse: { label: "The Muse", fetch: fetchTheMuse },
  weworkremotely: { label: "We Work Remotely", fetch: fetchWeWorkRemotely },
  workingnomads: { label: "Working Nomads", fetch: fetchWorkingNomads },
  ...Object.fromEntries(Object.entries(SWEEPERS).map(([ats, { label, sweep }]) =>
    [ats, { label, fetch: atsSweep(ats, ATS_COMPANY_SLUGS[ats as SweepAts], sweep) }])),
  // Hard boards first so EXTRA_SOURCES' own internshala/cutshort entries take precedence.
  ...HARD_BOARDS,
  ...EXTRA_SOURCES,
};

/** Fetch one board, keyword-filtered and capped; never throws. */
export async function fetchBoard(id: string, opts: FetchOpts): Promise<{ jobs: BoardJob[]; error?: string }> {
  const source = SOURCES[id];
  if (!source) return { jobs: [], error: `Unknown board "${id}"` };
  if (!boardEnabled(source)) return { jobs: [], error: `${source.label} needs ${source.needsKey!.join(" and ")} in the server environment` };
  try {
    const relevance = keywordMatcher(opts.keywords);
    const seen = new Set<string>();
    const ranked = (await source.fetch(opts))
      // WWR lists a job under several category feeds; sweeps can repeat a company's posting.
      .filter(j => j.title && j.url && !seen.has(j.url) && seen.add(j.url))
      .map(job => ({ job, score: relevance(job) }))
      .filter(r => r.score > 0);
    // Stable sort: title/tag matches first, each board's own order otherwise preserved.
    ranked.sort((a, b) => b.score - a.score);
    return { jobs: ranked.slice(0, opts.limit).map(r => r.job) };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.warn(`[JobBoards] ${id} failed:`, message);
    return { jobs: [], error: message };
  }
}

export interface BoardInfo extends BoardSource {
  needsKey?: readonly string[];
  enabled: boolean;
}

export const BOARDS: Record<string, BoardInfo> = Object.fromEntries(
  Object.entries(SOURCES).map(([id, s]) => [id, {
    label: s.label,
    needsKey: s.needsKey,
    get enabled() { return boardEnabled(s); },
    fetch: (opts: FetchOpts) => fetchBoard(id, opts).then(r => r.jobs),
  }]),
);

// ─── Ingest ─────────────────────────────────────────────────────

function cleanCompanyName(name: string): string {
  return name.replace(/[^\p{L}\p{N}\s&.\-]/gu, "").replace(/\s+/g, " ").trim() || "Unknown Employer";
}

function companyDomain(job: BoardJob, name: string): string {
  // Board-hosted company pages (himalayas.app/companies/x) aren't the employer's domain.
  const fromUrl = job.companyUrl ? extractDomain(job.companyUrl) : null;
  if (fromUrl && !/himalayas\.app|workable\.com|smartrecruiters\.com/.test(fromUrl)) return fromUrl;
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "") || "unknown"}.com`;
}

export interface DerivedJobFields {
  skills: string[];
  location: JobLocation;
  /** JSON for jobs.salaryJson, or null. */
  salary: string | null;
  experienceLevel: string | null;
  employmentType: string | null;
}

/** The columns the jobs AdvancedFilter reads, normalized the same way for every board. */
export function deriveJobFields(item: BoardJob): DerivedJobFields {
  const skills = [...new Set([
    ...extractSkillsFromText(`${item.title} ${item.tags.join(" ")} ${item.description}`),
    ...item.tags.filter(t => t.length > 1 && t.length <= 30),
  ])];
  const parsedLoc = normalizeLocation(item.location);
  const hybrid = parsedLoc.remoteType === "HYBRID" || /hybrid/i.test(item.location);
  const location: JobLocation = {
    ...parsedLoc,
    // normalizeLocation's country check is substring-based ("us" inside "Houston"), so detectCountry wins.
    country: item.country ?? detectCountry(item.location) ?? (parsedLoc.country === "India" ? "India" : undefined),
    city: item.city ?? parsedLoc.city ?? detectCity(item.location),
    remote: item.remote,
    remoteType: hybrid ? "HYBRID" : item.remote ? "FULLY_REMOTE" : "ON_SITE",
  };
  const textPay = item.salaryMin || item.salaryMax ? undefined : salaryFromText(`${item.title}
${item.description}`);
  const salary = item.salaryMin || item.salaryMax
    ? JSON.stringify({ min: item.salaryMin, max: item.salaryMax, currency: item.salaryCurrency })
    : textPay ? JSON.stringify(textPay) : null;
  const experienceLevel = inferExperienceLevel(item.experienceLevel) ?? inferExperienceLevel(item.title)
    ?? experienceFromYears(item.description) ?? null;
  const employmentType = normalizeEmploymentType(item.employmentType, item.title, item.description) ?? null;
  return { skills, location, salary, experienceLevel, employmentType };
}

export async function ingestBoardJobs(items: BoardJob[]): Promise<{ added: number; updated: number; skipped: number }> {
  if (items.length === 0) return { added: 0, updated: 0, skipped: 0 };

  const db = getDatabase();
  const [activeResume] = await db.select().from(resumes).where(eq(resumes.isActive, true)).limit(1);
  const matcher = new JobMatcher();
  const companyIds = new Map<string, string>();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const upsertCompany = async (job: BoardJob): Promise<string> => {
    const name = cleanCompanyName(job.companyName);
    const cached = companyIds.get(name.toLowerCase());
    if (cached) return cached;
    const domain = companyDomain(job, name);
    const find = () => db.select({ id: companies.id }).from(companies)
      .where(or(eq(companies.name, name), eq(companies.domain, domain))).limit(1);
    let [row] = await find();
    if (!row) {
      const id = uuidv4();
      try {
        await db.insert(companies).values({
          id, name, domain, ats: job.board, careerPage: job.companyUrl ?? job.url, industry: "Technology", companyType: "PRIVATE",
        });
        row = { id };
      } catch {
        // Unique-domain race with another board ingesting the same company concurrently.
        [row] = await find();
      }
    }
    if (!row) throw new Error(`Could not upsert company ${name}`);
    companyIds.set(name.toLowerCase(), row.id);
    return row.id;
  };

  for (const item of items) {
    try {
      const [existing] = await db.select({ id: jobs.id, contentHash: jobs.contentHash }).from(jobs)
        .where(or(eq(jobs.sourceUrl, item.url), and(eq(jobs.ats, item.board), eq(jobs.externalJobId, item.externalId))))
        .limit(1);

      const { skills, location, salary, experienceLevel, employmentType } = deriveJobFields(item);
      const contentHash = crypto.createHash("sha256")
        .update(`${item.title}:${item.companyName}:${item.location}:${item.description}:${salary ?? ""}`)
        .digest("hex").slice(0, 16);

      if (existing) {
        if (existing.contentHash === contentHash) {
          await db.update(jobs).set({ lastVerifiedAt: new Date() }).where(eq(jobs.id, existing.id));
          skipped++;
        } else {
          // Status is left alone so a job the user closed or applied to isn't revived.
          await db.update(jobs).set({
            title: item.title, normalizedTitle: normalizeJobTitle(item.title), description: item.description,
            skills: JSON.stringify(skills), locationJson: JSON.stringify(location), salaryJson: salary,
            employmentType, experienceLevel, contentHash, lastVerifiedAt: new Date(),
          }).where(eq(jobs.id, existing.id));
          updated++;
        }
        continue;
      }

      const companyId = await upsertCompany(item);
      const normalizedTitle = normalizeJobTitle(item.title);

      // Deduplicate identical role postings from same company across different cities or reposts
      const [existingByRole] = await db.select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), eq(jobs.normalizedTitle, normalizedTitle)))
        .limit(1);

      if (existingByRole) {
        await db.update(jobs).set({ lastVerifiedAt: new Date() }).where(eq(jobs.id, existingByRole.id));
        skipped++;
        continue;
      }

      const jobId = uuidv4();
      await db.insert(jobs).values({
        id: jobId,
        companyId,
        title: item.title,
        normalizedTitle,
        description: item.description,
        skills: JSON.stringify(skills),
        locationJson: JSON.stringify(location),
        employmentType,
        experienceLevel,
        salaryJson: salary,
        postedAt: item.postedAt ?? new Date(),
        sourceUrl: item.url,
        applyUrl: item.url,
        sourceType: "job_board",
        ats: item.board,
        externalJobId: item.externalId,
        contentHash,
        status: "active",
      });
      added++;
      emitLive({ type: "job_added", board: item.board, title: item.title, company: item.companyName, url: item.url, location: item.location });

      if (activeResume) await matcher.computeAndStore(jobId, activeResume.id);
    } catch (err: any) {
      skipped++;
      console.warn(`[JobBoards] Ingest error for ${item.board}:${item.title}:`, err?.message);
    }
  }

  return { added, updated, skipped };
}

// ─── Runner ─────────────────────────────────────────────────────

export interface BoardRunResult {
  board: string;
  fetched: number;
  added: number;
  updated: number;
  error?: string;
}

/** Fetch and ingest each board independently, so one failing board never sinks the rest. */
export async function runBoards(opts: { keywords?: string; boards?: string[]; limit: number }): Promise<BoardRunResult[]> {
  // Key-gated boards only run by default once their keys are configured.
  const ids = opts.boards?.length ? opts.boards : Object.keys(SOURCES).filter(id => boardEnabled(SOURCES[id]!));
  const settled = await Promise.allSettled(ids.map(async (board): Promise<BoardRunResult> => {
    emitLive({ type: "board_start", board });
    const { jobs: found, error } = await fetchBoard(board, { keywords: opts.keywords, limit: opts.limit });
    if (error) emitLive({ type: "error", board, message: error });
    const { added, updated } = await ingestBoardJobs(found);
    emitLive({ type: "board_done", board, fetched: found.length, added });
    return { board, fetched: found.length, added, updated, error };
  }));
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const board = ids[i] as string;
    const message = s.reason?.message ?? String(s.reason);
    emitLive({ type: "error", board, message });
    emitLive({ type: "board_done", board, fetched: 0, added: 0 });
    return { board, fetched: 0, added: 0, updated: 0, error: message };
  });
}
