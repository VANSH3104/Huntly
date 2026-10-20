/**
 * Types and helpers shared by the board fetchers in job-boards.ts and job-boards-extra.ts.
 */

import type { ExperienceLevel } from "@huntly/shared";

export interface BoardJob {
  board: string;
  externalId: string;
  title: string;
  companyName: string;
  companyUrl?: string;
  location: string;
  /** Structured country/city when the source provides them; otherwise derived from `location`. */
  country?: string;
  city?: string;
  remote: boolean;
  url: string;
  description: string;
  employmentType?: string;
  tags: string[];
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  postedAt?: Date;
  experienceLevel?: string;
}

export interface FetchOpts {
  keywords?: string;
  limit: number;
}

export interface BoardSource {
  label: string;
  fetch(opts: FetchOpts): Promise<BoardJob[]>;
  /** Env vars that must all be set; the board is listed but disabled without them. */
  needsKey?: readonly string[];
}

export function boardEnabled(source: BoardSource): boolean {
  return !source.needsKey || source.needsKey.every(k => !!process.env[k]);
}

// ─── HTTP ───────────────────────────────────────────────────────

export const UA = "Mozilla/5.0 (compatible; Huntly/1.0; +https://github.com/huntly)";
const TIMEOUT_MS = 20_000;
export const SWEEP_CONCURRENCY = 8;

export async function getText(
  url: string,
  accept = "application/json",
  init: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<string> {
  const resp = await fetch(url, {
    method: init.method,
    body: init.body,
    headers: { "User-Agent": UA, Accept: accept, ...init.headers },
    signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url.replace(/([?&](app_key|api_key|key)=)[^&]+/gi, "$1***")}`);
  return resp.text();
}

export async function getJson<T>(url: string, init?: Parameters<typeof getText>[2]): Promise<T> {
  return JSON.parse(await getText(url, "application/json", init)) as T;
}

export function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  return getJson<T>(url, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });
}

// ─── Text ───────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return ENTITIES[lower] ?? m;
  });
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  // Some feeds (RemoteOK, WWR) entity-encode their HTML, so decode before stripping tags.
  const decoded = /&lt;\/?[a-z]/i.test(html) ? decodeEntities(html) : html;
  return decodeEntities(
    decoded
      .replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function rssTag(item: string, tag: string): string {
  const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return (m?.[1] ?? "").trim().replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
}

export function rssItems(xml: string): string[] {
  return xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
}

export function toDate(v: string | number | null | undefined): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const AGO_UNITS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000, month: 2_592_000_000 };

/** "Posted 3 Days Ago", "21 hours, 15 minutes ago", "about 2 months", "Today", "Yesterday" → Date. */
export function relativeDate(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/\b(today|just now|few hours|hours? ago)\b/.test(t) && !/\d+\s*days?/.test(t)) {
    const h = t.match(/(\d+)\s*hours?/);
    return new Date(Date.now() - (h ? Number(h[1]) * AGO_UNITS.hour! : 0));
  }
  if (/\byesterday\b/.test(t)) return new Date(Date.now() - AGO_UNITS.day!);
  const m = t.match(/(\d+|an?|about an?)\+?\s*(minute|hour|day|week|month)s?/);
  if (!m) return undefined;
  const n = /\d/.test(m[1]!) ? Number(m[1]) : 1;
  return new Date(Date.now() - n * AGO_UNITS[m[2]!]!);
}

export function positive(n: number | null | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

const REMOTE_RE = /\b(remote|anywhere|worldwide|work from home|wfh|distributed)\b/i;

export function isRemoteText(...parts: Array<string | undefined>): boolean {
  return parts.some(p => !!p && REMOTE_RE.test(p));
}

export function remoteWithin(countries: string[]): string {
  if (countries.length === 0) return "Remote";
  const shown = countries.slice(0, 3).join(", ");
  return `Remote (${countries.length > 3 ? `${shown} +${countries.length - 3} more` : shown})`;
}

/** Board slug → display name for sources that only give a slug. */
export function titleCaseSlug(slug: string): string {
  return slug.split(/[-_]/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── Keyword matching ───────────────────────────────────────────

/**
 * Comma-separated alternatives; every word of one alternative must appear as a whole word.
 * `relevance` is 2 for a title/tag hit, 1 for a description-only hit, 0 for no match.
 */
export function keywordMatcher(keywords: string | undefined): (job: BoardJob) => number {
  const alternatives = (keywords ?? "")
    .toLowerCase()
    .split(",")
    .map(a => a.split(/\s+/).filter(Boolean).map(w =>
      // Lookarounds instead of \b so terms like "c++" and ".net" still match as whole words.
      new RegExp(`(?<![a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i")))
    .filter(a => a.length > 0);
  if (alternatives.length === 0) return () => 2;
  const hits = (text: string) => alternatives.some(words => words.every(re => re.test(text)));
  return job => hits(`${job.title} ${job.tags.join(" ")}`) ? 2 : hits(job.description) ? 1 : 0;
}

export function keywordFilter(keywords: string | undefined): (job: BoardJob) => boolean {
  const relevance = keywordMatcher(keywords);
  return job => relevance(job) > 0;
}

// ─── Paging / concurrency ───────────────────────────────────────

/** A later page failing (e.g. HTTP 429 on deep paging) keeps what was already fetched; only a first-page failure is an error. */
export async function nextPage<T>(page: Promise<T>, fetchedSoFar: number, board: string): Promise<T | null> {
  try {
    return await page;
  } catch (err: any) {
    if (fetchedSoFar === 0) throw err;
    console.warn(`[JobBoards] ${board} stopped paging after ${fetchedSoFar} jobs:`, err?.message);
    return null;
  }
}

/** Results keep input order; items skipped because `stop()` turned true are absent. */
export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>, stop?: () => boolean): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length && !stop?.()) {
        const i = next++;
        results[i] = await fn(items[i] as T);
      }
    }),
  );
  return results.filter((_, i) => i in results);
}

/** Pages that fail individually are logged and skipped; the board errors only when every page failed. */
export async function fetchPages<T>(board: string, keys: readonly T[], concurrency: number, fn: (key: T) => Promise<BoardJob[]>): Promise<BoardJob[]> {
  let failures = 0;
  let lastError: unknown;
  const pages = await mapPool([...keys], concurrency, key => fn(key).catch(err => {
    failures++;
    lastError = err;
    console.warn(`[JobBoards] ${board} ${String(key)}:`, err?.message);
    return [] as BoardJob[];
  }));
  if (keys.length > 0 && failures === keys.length) throw lastError;
  return pages.flat();
}

/** Per-company cap so a few huge employers can't fill the whole limit when no keywords narrow it. */
export const PER_COMPANY_CAP = 25;

export type Sweeper = (slug: string, keywords?: string) => Promise<BoardJob[]>;

export function atsSweep(ats: string, slugs: readonly string[], sweeper: Sweeper) {
  return async ({ keywords, limit }: FetchOpts): Promise<BoardJob[]> => {
    const matches = keywordFilter(keywords);
    let collected = 0;
    const perCompany = await mapPool(
      [...slugs],
      SWEEP_CONCURRENCY,
      async slug => {
        try {
          const found = (await sweeper(slug, keywords)).filter(matches);
          const kept = keywords ? found : found.slice(0, PER_COMPANY_CAP);
          collected += kept.length;
          return kept;
        } catch (err: any) {
          console.warn(`[JobBoards] ${ats}/${slug}:`, err?.message);
          return [];
        }
      },
      () => collected >= limit,
    );
    // Slug-list order, not completion order, so repeated runs pick the same companies.
    return perCompany.flat();
  };
}

// ─── Field normalization (what the AdvancedFilter in routes/jobs.ts reads) ──

export type EmploymentType = "full-time" | "part-time" | "contract" | "internship" | "freelance";

const EMPLOYMENT_RULES: Array<[RegExp, EmploymentType]> = [
  [/\b(intern(ship)?s?|werkstudent\w*|trainee(ship)?|praktikum|co-?op|summer \d{4}|fall \d{4}|spring \d{4}|winter \d{4})\b/i, "internship"],
  [/\bfreelance(r)?\b/i, "freelance"],
  [/\b(contract(or)?|temporary|temp|fixed[- ]term|befristet|seasonal)\b/i, "contract"],
  [/\b(part[- _]?time|parttime|teilzeit|minijob)\b/i, "part-time"],
  [/\b(full[- _]?time|fulltime|permanent|vollzeit|tiempo completo|cdi|salaried)\b/i, "full-time"],
];

// A description mentioning "interns" or "contractors" says nothing about this job, so it gets narrower rules.
const DESCRIPTION_RULES: Array<[RegExp, EmploymentType]> = [
  [/\b(this is an? (paid )?internship|internship (position|role|program))\b/i, "internship"],
  [/\b(contract (role|position|basis|engagement)|fixed[- ]term contract|\d+[- ]months? contract)\b/i, "contract"],
  [/\bfreelance (role|position|basis)\b/i, "freelance"],
  [/\b(full[- ]time|permanent (role|position|contract))\b/i, "full-time"],
  [/\bpart[- ]time (role|position)\b/i, "part-time"],
];

export function normalizeEmploymentType(raw: string | undefined, title: string, description = ""): EmploymentType | undefined {
  for (const text of [raw, title]) {
    if (!text) continue;
    for (const [re, type] of EMPLOYMENT_RULES) if (re.test(text)) return type;
  }
  const head = description.slice(0, 4000);
  for (const [re, type] of DESCRIPTION_RULES) if (re.test(head)) return type;
  return undefined;
}

export function inferExperienceLevel(...signals: Array<string | undefined>): ExperienceLevel | undefined {
  const text = signals.filter(Boolean).join(" ").toLowerCase();
  if (!text) return undefined;
  if (/\bintern(ship)?s?\b|\bwerkstudent|\bduales studium|\btrainee\b|\bco-?op\b|\bworking student\b/.test(text)) return "INTERNSHIP";
  if (/\b(chief|cto|ceo|cfo|coo|vp|svp|evp|vice president|director|head of|executive|c-level)\b/.test(text)) return "EXECUTIVE";
  if (/\b(senior|sr\.?|staff|principal|lead|architect|expert|mid-senior|management)\b/.test(text)) return "SENIOR";
  if (/\b(junior|jr\.?|entry|graduate|new grad|fresher|associate|apprentice|early career|no experience|beginner)\b/.test(text)) return "ENTRY";
  if (/\b(mid|mid-level|mid level|midweight|intermediate|experienced)\b/.test(text)) return "MID";
  return undefined;
}

/** "5+ years of experience" in the description, mapped onto the level enum. */
export function experienceFromYears(description: string): ExperienceLevel | undefined {
  const m = description.slice(0, 6000).match(/\b(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^.\n]{0,40}\b(experience|exp\b|in |of |working|building|professional)/i);
  return m ? levelFromYears(Number(m[1])) : undefined;
}

export function levelFromYears(years: number | undefined): ExperienceLevel | undefined {
  if (years === undefined || !Number.isFinite(years) || years < 0 || years > 25) return undefined;
  if (years <= 1) return "ENTRY";
  if (years <= 4) return "MID";
  if (years <= 11) return "SENIOR";
  return "EXECUTIVE";
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "₹": "INR" };

/** "$120k - $180k", "€50.000–€70.000", "£40,000 to £55,000", "USD 90,000 - 120,000", "15-25 LPA". Annual ranges only. */
export function salaryFromText(text: string): { min: number; max: number; currency: string } | undefined {
  const num = String.raw`(\d{1,3}(?:[,.]\d{3})+|\d+(?:\.\d+)?)\s?([kK])?`;
  const sep = String.raw`\s*(?:-|–|—|to)\s*`;
  const sym = text.match(new RegExp(String.raw`([$€£₹])\s?${num}${sep}(?:[$€£₹]|USD|EUR|GBP)?\s?${num}`));
  const code = sym ? null : text.match(new RegExp(String.raw`\b(USD|EUR|GBP|INR|CAD|AUD)\s?${num}${sep}${num}`));
  const m = sym ?? code;
  if (m) {
    const parse = (v: string, k?: string) => Number(/[,.]\d{3}\b/.test(v) ? v.replace(/[,.]/g, "") : v) * (k ? 1000 : 1);
    const min = parse(m[2]!, m[3]);
    const max = parse(m[4]!, m[5]);
    const currency = sym ? CURRENCY_SYMBOLS[m[1]!]! : m[1]!;
    // Hourly/monthly figures and stray numbers ("$1.7 trillion") fall outside a plausible annual band.
    const floor = currency === "INR" ? 100_000 : 10_000;
    if (min >= floor && max >= min && max <= (currency === "INR" ? 50_000_000 : 2_000_000)) return { min, max, currency };
  }
  const lpa = text.match(/(\d{1,2}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,2}(?:\.\d+)?)\s*(?:LPA|lakhs?\s*(?:per annum|p\.?a\.?))/i);
  if (lpa) return { min: Math.round(Number(lpa[1]) * 100_000), max: Math.round(Number(lpa[2]) * 100_000), currency: "INR" };
  return undefined;
}

// ─── Country detection ──────────────────────────────────────────

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

/** ISO-3166 alpha-2 → English name; undefined for codes Intl doesn't know. */
export function countryFromCode(code: string | undefined | null): string | undefined {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return undefined;
  const up = code.toUpperCase();
  if (up === "UK") return "United Kingdom";
  try {
    const name = regionNames.of(up);
    return name && name !== up ? name : undefined;
  } catch {
    return undefined;
  }
}

const US_STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma",
  OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota", TN: "tennessee",
  TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin",
  WY: "wyoming", DC: "district of columbia",
};
const CA_PROVINCES = ["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE"];

const CITY_COUNTRY: Record<string, string> = {
  "san francisco": "United States", "new york": "United States", nyc: "United States", seattle: "United States",
  austin: "United States", boston: "United States", chicago: "United States", "los angeles": "United States",
  denver: "United States", atlanta: "United States", "bay area": "United States", "palo alto": "United States",
  "mountain view": "United States", "san jose": "United States", "menlo park": "United States", "santa clara": "United States",
  sunnyvale: "United States", "washington dc": "United States", miami: "United States", dallas: "United States",
  london: "United Kingdom", manchester: "United Kingdom", edinburgh: "United Kingdom", england: "United Kingdom",
  scotland: "United Kingdom", wales: "United Kingdom", berlin: "Germany", munich: "Germany", münchen: "Germany",
  hamburg: "Germany", frankfurt: "Germany", cologne: "Germany", köln: "Germany", paris: "France", lyon: "France",
  amsterdam: "Netherlands", rotterdam: "Netherlands", utrecht: "Netherlands", dublin: "Ireland", toronto: "Canada",
  vancouver: "Canada", montreal: "Canada", ottawa: "Canada", sydney: "Australia", melbourne: "Australia",
  brisbane: "Australia", tokyo: "Japan", seoul: "South Korea", "tel aviv": "Israel", madrid: "Spain",
  barcelona: "Spain", lisbon: "Portugal", lisboa: "Portugal", porto: "Portugal", stockholm: "Sweden",
  copenhagen: "Denmark", oslo: "Norway", helsinki: "Finland", zurich: "Switzerland", zürich: "Switzerland",
  geneva: "Switzerland", vienna: "Austria", wien: "Austria", warsaw: "Poland", krakow: "Poland", kraków: "Poland",
  prague: "Czechia", budapest: "Hungary", bucharest: "Romania", athens: "Greece", milan: "Italy", rome: "Italy",
  "são paulo": "Brazil", "sao paulo": "Brazil", "mexico city": "Mexico", "buenos aires": "Argentina",
  bogota: "Colombia", bogotá: "Colombia", "hong kong": "Hong Kong", shanghai: "China", beijing: "China",
  dubai: "United Arab Emirates", "abu dhabi": "United Arab Emirates", manila: "Philippines", jakarta: "Indonesia",
  "kuala lumpur": "Malaysia", bangkok: "Thailand", "ho chi minh": "Vietnam", hanoi: "Vietnam", nairobi: "Kenya",
  lagos: "Nigeria", "cape town": "South Africa", johannesburg: "South Africa", cairo: "Egypt",
  bangalore: "India", bengaluru: "India", hyderabad: "India", mumbai: "India", pune: "India", delhi: "India",
  "new delhi": "India", gurugram: "India", gurgaon: "India", noida: "India", chennai: "India", kolkata: "India",
  ahmedabad: "India", jaipur: "India", kochi: "India", indore: "India", chandigarh: "India", coimbatore: "India",
  "navi mumbai": "India", thane: "India", lucknow: "India", bhubaneswar: "India", ncr: "India", trivandrum: "India",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States", "u.s.": "United States", "u.s.a.": "United States", "united states of america": "United States",
  america: "United States", "north america": "United States", uk: "United Kingdom", "great britain": "United Kingdom",
  britain: "United Kingdom", uae: "United Arab Emirates", deutschland: "Germany", "the netherlands": "Netherlands",
  holland: "Netherlands", "czech republic": "Czechia", "south korea": "South Korea", korea: "South Korea",
  türkiye: "Turkey", turkiye: "Turkey", españa: "Spain", india: "India", bharat: "India",
};

// Built once from Intl so every recognised country name is matched, not a hand-picked handful.
const COUNTRY_NAMES: Array<[string, string]> = (() => {
  const out: Array<[string, string]> = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const name = countryFromCode(String.fromCharCode(a, b));
      if (name && !/unknown|outlying|pseudo/i.test(name)) out.push([name.toLowerCase(), name]);
    }
  }
  for (const [alias, name] of Object.entries(COUNTRY_ALIASES)) out.push([alias, name]);
  for (const [city, name] of Object.entries(CITY_COUNTRY)) out.push([city, name]);
  for (const state of Object.values(US_STATES)) out.push([state, "United States"]);
  // Longest first so "new jersey" beats "jersey" and "south africa" beats "africa".
  return out.sort((x, y) => y[0].length - x[0].length);
})();

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COUNTRY_RES = COUNTRY_NAMES.map(([needle, name]) => [new RegExp(`(?<![\\p{L}])${escapeRe(needle)}(?![\\p{L}])`, "iu"), name] as const);

const CITY_RES = Object.keys(CITY_COUNTRY)
  .filter(c => !["england", "scotland", "wales", "bay area", "ncr"].includes(c))
  .map(c => [new RegExp(`(?<![\\p{L}])${escapeRe(c)}(?![\\p{L}])`, "iu"), c.replace(/(^|\s)\p{L}/gu, ch => ch.toUpperCase())] as const);

/** Earliest well-known city in a free-text location ("Remote; San Francisco, CA" → "San Francisco"). */
export function detectCity(location: string | undefined): string | undefined {
  if (!location) return undefined;
  let best: { index: number; name: string } | undefined;
  for (const [re, name] of CITY_RES) {
    const m = re.exec(location);
    if (m && (best === undefined || m.index < best.index)) best = { index: m.index, name };
  }
  return best?.name;
}

/** Country of the earliest place mentioned in a free-text location, e.g. "Remote - US" or "Austin, TX; London". */
export function detectCountry(location: string | undefined): string | undefined {
  if (!location) return undefined;
  let best: { index: number; name: string } | undefined;
  const consider = (index: number, name: string | undefined) => {
    if (name && (best === undefined || index < best.index)) best = { index, name };
  };
  for (const [re, name] of COUNTRY_RES) {
    const m = re.exec(location);
    if (m) consider(m.index, name);
  }
  // Upper-case codes after a comma/dash/paren: "Austin, TX", "Remote (US)", "Berlin, DE", "Remote - IN".
  for (const m of location.matchAll(/(?:,|\(|-|–|\|)\s*([A-Z]{2})\b(?![a-z])/g)) {
    const code = m[1]!;
    consider(m.index!, US_STATES[code] ? "United States" : CA_PROVINCES.includes(code) ? "Canada" : countryFromCode(code));
  }
  const bare = location.match(/^\s*(US|UK|IN|DE|CA)\s*$/);
  if (bare) consider(0, bare[1] === "CA" ? "Canada" : countryFromCode(bare[1]));
  return best?.name;
}
