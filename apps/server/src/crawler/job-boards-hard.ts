/**
 * Big job sites with no free API, read only from public logged-out pages: embedded JSON / JSON-LD,
 * sitemaps, the sites' own anonymous JSON endpoints, a plain Playwright render, or Google's index
 * (Serper) for sites whose robots.txt or bot wall rules out direct access.
 *
 * Every site request goes through politeFetch/politeRender: robots.txt, one request at a time and
 * >= 2s apart per host, a page cap per run, a response cache, and stop-on-block (403/429/challenge/login).
 */

import * as cheerio from "cheerio";
import zlib from "node:zlib";
import type { ExperienceLevel } from "@huntly/shared";
import type { BoardJob, FetchOpts } from "./job-boards-shared.js";
// Cyclic (job-boards.ts spreads HARD_BOARDS into its registry); emitLive is only called at run time.
import { emitLive } from "./job-boards.js";
import { getPlaywrightEngine } from "./playwright-engine.js";
import { createSearchProvider, SEARCH_KEYS } from "./search-provider.js";

export interface HardFetchOpts extends FetchOpts {
  /** "India" when omitted: these sources are queried for the user's market. */
  location?: string;
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
/** Product token looked up in robots.txt; sites that don't name it fall back to the `*` group. */
const ROBOTS_AGENT = "huntly";
const MIN_GAP_MS = Math.max(2000, Number(process.env["CRAWLER_REQUEST_DELAY_MS"]) || 0);
const PAGES_PER_RUN = 30;
const DETAIL_PAGES_PER_RUN = 12;
const CACHE_TTL_MS = 15 * 60_000;
const ROBOTS_TTL_MS = 6 * 60 * 60_000;
const TIMEOUT_MS = 25_000;

// ─── Run state, throttling, cache ───────────────────────────────

class BlockedError extends Error {}

interface Run {
  board: string;
  pagesLeft: number;
  /** host → reason; a blocked host is not contacted again in this run. */
  blocked: Map<string, string>;
  techniques: string[];
}

export interface HardRunReport {
  board: string;
  techniques: string[];
  blocked: string[];
  fetched: number;
}

/** Last run per board, for the status notes in the registry and for debugging. */
export const HARD_LAST_RUN = new Map<string, HardRunReport>();

const hostChain = new Map<string, Promise<unknown>>();
const hostLastAt = new Map<string, number>();
const cache = new Map<string, { at: number; value: Fetched }>();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Concurrency 1 and MIN_GAP_MS spacing per host, across all runs in this process. */
function throttled<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const next = (hostChain.get(host) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const wait = (hostLastAt.get(host) ?? 0) + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      hostLastAt.set(host, Date.now());
    }
  });
  hostChain.set(host, next);
  return next;
}

// ─── robots.txt ─────────────────────────────────────────────────

interface RobotsRule { allow: boolean; re: RegExp; length: number }
const robotsCache = new Map<string, { at: number; rules: RobotsRule[] | "disallow-all" }>();

function robotsPattern(path: string): RegExp {
  const anchored = path.endsWith("$");
  const body = (anchored ? path.slice(0, -1) : path)
    .split("*").map(s => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function parseRobots(txt: string, agent = ROBOTS_AGENT): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const m = raw.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push(current = { agents: [], rules: [] });
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    // An empty Disallow means "allow everything", which is the default anyway.
    if ((key === "allow" || key === "disallow") && current && value) {
      current.rules.push({ allow: key === "allow", re: robotsPattern(value), length: value.length });
    }
  }
  const named = groups.filter(g => g.agents.includes(agent));
  return (named.length ? named : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules);
}

export function robotsAllows(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | undefined;
  for (const r of rules) {
    if (!r.re.test(pathAndQuery)) continue;
    // Longest match wins; on a tie Allow wins (RFC 9309).
    if (!best || r.length > best.length || (r.length === best.length && r.allow)) best = r;
  }
  return best?.allow ?? true;
}

/** Chromium completes certificate chains that Node rejects (timesjobs.com serves an incomplete one). */
async function robotsViaBrowser(origin: string): Promise<{ status: number; text: string }> {
  const session = await getPlaywrightEngine().acquirePage(new URL(origin).host);
  try {
    const resp = await session.page.goto(`${origin}/robots.txt`, { timeout: TIMEOUT_MS });
    return { status: resp?.status() ?? 0, text: (await resp?.text()) ?? "" };
  } finally {
    await session.release();
  }
}

async function robotsRules(origin: string, browserFallback = false): Promise<RobotsRule[] | "disallow-all"> {
  const hit = robotsCache.get(origin);
  if (hit && Date.now() - hit.at < ROBOTS_TTL_MS) return hit.rules;
  const host = new URL(origin).host;
  let rules: RobotsRule[] | "disallow-all";
  try {
    const resp = await throttled(host, async () => {
      try {
        const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        return { status: r.status, text: await r.text() };
      } catch (err) {
        if (browserFallback) return robotsViaBrowser(origin);
        throw err;
      }
    });
    // RFC 9309: a 4xx means no restrictions; a 5xx or network failure means assume full disallow.
    rules = resp.status >= 200 && resp.status < 300 ? parseRobots(resp.text) : resp.status >= 400 && resp.status < 500 ? [] : "disallow-all";
  } catch {
    rules = "disallow-all";
  }
  robotsCache.set(origin, { at: Date.now(), rules });
  return rules;
}

// ─── Polite fetch / render ──────────────────────────────────────

interface Fetched { status: number; text: string; finalUrl: string; captured: string[] }

const BLOCK_STATUS = new Set([401, 403, 407, 429, 451, 503]);
const CHALLENGE_TITLE = /<title[^>]*>\s*(access denied|just a moment|attention required|security check|are you a robot|verify you are human|pardon our interruption|request rejected)/i;
const LOGIN_PATH = /\/(authwall|login|signin|sign-in|uas\/login|checkpoint)\b/i;

function blockReason(f: Fetched): string | undefined {
  if (BLOCK_STATUS.has(f.status)) return `HTTP ${f.status}`;
  if (CHALLENGE_TITLE.test(f.text.slice(0, 5000))) return `bot challenge page ("${f.text.match(CHALLENGE_TITLE)?.[1]}")`;
  if (LOGIN_PATH.test(new URL(f.finalUrl).pathname)) return "redirected to a login wall";
  return undefined;
}

function markBlocked(run: Run, host: string, reason: string): never {
  run.blocked.set(host, reason);
  emitLive({ type: "error", board: run.board, message: `blocked: ${host} ${reason}` });
  throw new BlockedError(`${host} ${reason}`);
}

/** Robots, block list and page cap; returns false when the page cap is spent. */
async function admit(run: Run, url: URL, browser = false): Promise<boolean> {
  const prior = run.blocked.get(url.host);
  if (prior) throw new BlockedError(`${url.host} ${prior}`);
  const rules = await robotsRules(url.origin, browser);
  if (rules === "disallow-all") markBlocked(run, url.host, "robots.txt unreachable (treated as disallow)");
  if (!robotsAllows(rules, url.pathname + url.search)) {
    throw new BlockedError(`robots.txt disallows ${url.host}${url.pathname}`);
  }
  if (run.pagesLeft <= 0) return false;
  run.pagesLeft--;
  return true;
}

async function politeFetch(run: Run, rawUrl: string, accept = "text/html,application/xhtml+xml,*/*;q=0.8"): Promise<Fetched | null> {
  const key = `GET ${rawUrl}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const url = new URL(rawUrl);
  if (!(await admit(run, url))) return null;
  const fetched = await throttled(url.host, async (): Promise<Fetched> => {
    const resp = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: accept, "Accept-Language": "en-IN,en;q=0.9" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let buf = Buffer.from(await resp.arrayBuffer());
    // Sitemaps are often served as raw .gz files without a Content-Encoding header.
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    return { status: resp.status, text: buf.toString("utf8"), finalUrl: resp.url || rawUrl, captured: [] };
  });
  const reason = blockReason(fetched);
  if (reason) markBlocked(run, url.host, reason);
  if (fetched.status >= 400) throw new Error(`HTTP ${fetched.status} for ${rawUrl}`);
  cache.set(key, { at: Date.now(), value: fetched });
  return fetched;
}

/** Plain Chromium page load (no stealth): for listings that only exist after client-side rendering. */
async function politeRender(run: Run, rawUrl: string, opts: { settleMs?: number; capture?: RegExp } = {}): Promise<Fetched | null> {
  const key = `RENDER ${rawUrl}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const url = new URL(rawUrl);
  if (!(await admit(run, url, true))) return null;
  const fetched = await throttled(url.host, async (): Promise<Fetched> => {
    const session = await getPlaywrightEngine().acquirePage(url.host);
    try {
      const captured: Array<Promise<string>> = [];
      if (opts.capture) {
        const re = opts.capture;
        session.page.on("response", r => { if (re.test(r.url())) captured.push(r.text().catch(() => "")); });
      }
      const resp = await session.page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await session.page.waitForTimeout(opts.settleMs ?? 5000);
      await session.page.mouse.wheel(0, 3000);
      await session.page.waitForTimeout(1500);
      return {
        status: resp?.status() ?? 0,
        text: await session.page.content(),
        finalUrl: session.page.url(),
        captured: await Promise.all(captured),
      };
    } finally {
      await session.release();
    }
  });
  const reason = blockReason(fetched);
  if (reason) markBlocked(run, url.host, reason);
  cache.set(key, { at: Date.now(), value: fetched });
  return fetched;
}

// ─── Normalizers ────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "'", ndash: "–" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const l = e.toLowerCase();
    if (l.startsWith("#x")) return String.fromCodePoint(parseInt(l.slice(2), 16));
    if (l.startsWith("#")) return String.fromCodePoint(parseInt(l.slice(1), 10));
    return ENTITIES[l] ?? m;
  });
}

function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<(br|\/p|\/div|\/li|\/h\d)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const clean = (s: string | undefined | null) => decodeEntities((s ?? "").replace(/\s+/g, " ")).trim();

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const isCountryWide = (loc: string) => !loc || /^(india|anywhere|all india)$/i.test(loc.trim());
const isRemoteText = (...parts: Array<string | undefined>) => parts.some(p => !!p && /\b(remote|work from home|wfh|anywhere)\b/i.test(p));

/** India-only boards often give a bare city ("Gurgaon") that normalizeLocation can't place in a country. */
function inIndia(loc: string): string {
  const l = clean(loc);
  if (!l) return "India";
  return /\bindia\b/i.test(l) ? l : `${l}, India`;
}

const EMPLOYMENT: Array<[RegExp, string]> = [
  [/intern/i, "internship"],
  [/freelanc/i, "freelance"],
  [/part[\s_-]?time/i, "part-time"],
  [/contract|temporary|temp\b|consultant/i, "contract"],
  [/full[\s_-]?time|permanent|regular/i, "full-time"],
];

function employmentType(...raw: Array<string | string[] | undefined | null>): string | undefined {
  const text = raw.flat().filter(Boolean).join(" ");
  return EMPLOYMENT.find(([re]) => re.test(text))?.[1];
}

function yearsFrom(text: string | undefined): number | undefined {
  if (!text) return undefined;
  if (/no experience|fresher/i.test(text)) return 0;
  const m = text.match(/(\d+(?:\.\d+)?)\s*(?:\+|-|to|–)?\s*(?:\d+(?:\.\d+)?)?\s*(?:yrs?|years?)/i);
  return m ? Number(m[1]) : undefined;
}

/** Titles win over years; EXECUTIVE is left to ingest's own title inference. */
function experienceLevel(title: string, minYears?: number): ExperienceLevel | undefined {
  const t = title.toLowerCase();
  if (/\bintern(ship)?\b|\btrainee\b|\bapprentice/.test(t)) return "INTERNSHIP";
  if (/\b(chief|cto|ceo|vp|vice president|director|head of)\b/.test(t)) return undefined;
  if (/\b(senior|sr\.?|staff|principal|lead|architect)\b/.test(t)) return "SENIOR";
  if (/\b(junior|jr\.?|fresher|entry|graduate|new grad|trainee)\b/.test(t)) return "ENTRY";
  if (minYears === undefined || Number.isNaN(minYears)) return undefined;
  return minYears < 2 ? "ENTRY" : minYears < 5 ? "MID" : "SENIOR";
}

const PERIOD_MULT: Array<[RegExp, number]> = [[/hour/i, 2080], [/day/i, 260], [/week/i, 52], [/month/i, 12]];
const annualize = (n: number, period: string | undefined) =>
  n * (PERIOD_MULT.find(([re]) => period && re.test(period))?.[1] ?? 1);

/** "₹ 4,00,000 - 6,00,000 /year", "3-5 Lacs P.A.", "From ₹50,000 a month" → annual INR. */
function parseSalaryText(text: string | undefined): Pick<BoardJob, "salaryMin" | "salaryMax" | "salaryCurrency"> {
  if (!text || /not disclosed|unpaid|competitive/i.test(text)) return {};
  const t = text.replace(/,/g, "");
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)/g)].map(m => Number(m[1])).filter(n => n > 0);
  if (!nums.length) return {};
  let mult = /lakh|lac|lpa|\d\s*l\b/i.test(t) ? 100_000 : /\bcr(ore)?\b/i.test(t) ? 10_000_000 : /\d\s*k\b/i.test(t) ? 1000 : 1;
  mult = annualize(mult, t);
  const currency = /\$|usd/i.test(t) ? "USD" : /€|eur/i.test(t) ? "EUR" : "INR";
  const [a, b] = [nums[0]! * mult, (nums[1] ?? nums[0]!) * mult];
  return a < 1000 ? {} : { salaryMin: a, salaryMax: b, salaryCurrency: currency };
}

/** "4 days ago", "28d", "24h", "30d+", "Just now", "2 weeks ago" → Date. */
function relativeDate(text: string | undefined): Date | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/just now|today|few hours|hour/.test(t) && !/\d+\s*d/.test(t)) return new Date();
  if (/yesterday/.test(t)) return new Date(Date.now() - 86_400_000);
  const m = t.match(/(\d+)\s*\+?\s*(minute|min|h|hour|d|day|w|week|mo|month)/);
  if (!m) return undefined;
  const unit = m[2]!;
  const ms = unit.startsWith("mi") ? 60_000 : unit.startsWith("h") ? 3_600_000 : unit.startsWith("w") ? 7 * 86_400_000
    : unit.startsWith("mo") ? 30 * 86_400_000 : 86_400_000;
  return new Date(Date.now() - Number(m[1]) * ms);
}

function toDate(v: string | number | null | undefined): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  const d = typeof n === "number" ? new Date(n < 1e12 ? n * 1000 : n) : new Date(n);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function nextData(html: string): any {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]!) : undefined;
}

// ─── JSON-LD JobPosting ─────────────────────────────────────────

function findJobPostings(data: unknown, out: Record<string, any>[] = []): Record<string, any>[] {
  if (Array.isArray(data)) data.forEach(d => findJobPostings(d, out));
  else if (data && typeof data === "object") {
    const o = data as Record<string, any>;
    const type = o["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) out.push(o);
    if (o["@graph"]) findJobPostings(o["@graph"], out);
  }
  return out;
}

export function jobPostingsFromHtml(html: string): Record<string, any>[] {
  const $ = cheerio.load(html);
  const out: Record<string, any>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() ?? "";
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      // Several Indian boards emit raw newlines inside JSON strings.
      try { data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")); } catch { return; }
    }
    findJobPostings(data, out);
  });
  return out;
}

const ldText = (v: unknown): string | undefined =>
  typeof v === "string" ? v : v && typeof v === "object" ? ldText((v as any).name ?? (v as any)["@value"]) : undefined;

const COUNTRY_CODES: Record<string, string> = { IN: "India", US: "United States", GB: "United Kingdom", SG: "Singapore", AE: "United Arab Emirates", DE: "Germany", CA: "Canada" };

export function jobPostingToBoardJob(p: Record<string, any>, pageUrl: string, board: string): BoardJob | null {
  const title = clean(ldText(p["title"]) ?? ldText(p["name"]));
  if (!title) return null;
  const places = [p["jobLocation"]].flat().filter(Boolean) as Array<Record<string, any>>;
  const location = places.map(pl => {
    const a = pl["address"] ?? {};
    const country = ldText(a["addressCountry"]);
    return [ldText(a["addressLocality"]), ldText(a["addressRegion"]), country && (COUNTRY_CODES[country] ?? country)]
      .filter(s => s && s !== "-").join(", ");
  }).filter(Boolean).join("; ") || ldText(p["applicantLocationRequirements"]) || "";
  const remote = /TELECOMMUTE/i.test(String(p["jobLocationType"] ?? "")) || isRemoteText(location, title);
  const salaryNode = p["baseSalary"];
  const value = salaryNode?.["value"];
  const unit = value?.["unitText"] ?? salaryNode?.["unitText"];
  const num = (x: unknown) => (typeof x === "number" ? x : typeof x === "string" ? Number(x.replace(/,/g, "")) : NaN);
  const lo = num(value?.["minValue"] ?? value?.["value"] ?? (typeof value !== "object" ? value : undefined));
  const hi = num(value?.["maxValue"] ?? value?.["value"]);
  const months = num(p["experienceRequirements"]?.["monthsOfExperience"]);
  const skills = p["skills"];
  return {
    board,
    externalId: String(ldText(p["identifier"]?.["value"]) ?? p["identifier"]?.["value"] ?? pageUrl),
    title,
    companyName: clean(ldText(p["hiringOrganization"])) || "Unknown",
    companyUrl: typeof p["hiringOrganization"]?.["sameAs"] === "string" ? p["hiringOrganization"]["sameAs"] : undefined,
    location: location || (remote ? "Remote" : "Unspecified"),
    remote,
    url: pageUrl,
    description: htmlToText(ldText(p["description"])),
    employmentType: employmentType(p["employmentType"], title),
    tags: [
      ...(typeof skills === "string" ? skills.split(/,\s*/) : Array.isArray(skills) ? skills.map(ldText) : []),
      ldText(p["occupationalCategory"]), ldText(p["industry"]),
    ].filter((t): t is string => !!t && t.length <= 40).map(t => t.trim()),
    salaryMin: lo > 0 ? annualize(lo, unit) : undefined,
    salaryMax: hi > 0 ? annualize(hi, unit) : undefined,
    salaryCurrency: lo > 0 || hi > 0 ? ldText(salaryNode?.["currency"]) : undefined,
    postedAt: toDate(p["datePosted"]),
    experienceLevel: experienceLevel(title, months > 0 ? months / 12 : undefined),
  };
}

/** Fetch one public job page and read its schema.org JobPosting (what Google Jobs indexes). */
export async function jsonLdJobPostingFromUrl(url: string, board: string, run?: Run): Promise<BoardJob | null> {
  const r = run ?? newRun(board);
  const page = await politeFetch(r, url);
  const posting = page && jobPostingsFromHtml(page.text)[0];
  return posting ? jobPostingToBoardJob(posting, url, board) : null;
}

/** Fill in fields a listing card lacks from each job page's JSON-LD; stops quietly on cap or block. */
async function enrichFromJsonLd(run: Run, jobs: BoardJob[], max = DETAIL_PAGES_PER_RUN): Promise<BoardJob[]> {
  for (const job of jobs.slice(0, max)) {
    try {
      const ld = await jsonLdJobPostingFromUrl(job.url, job.board, run);
      if (!ld) continue;
      job.description = ld.description || job.description;
      job.postedAt = ld.postedAt ?? job.postedAt;
      job.employmentType = ld.employmentType ?? job.employmentType;
      job.tags = [...new Set([...job.tags, ...ld.tags])];
      if (!job.salaryMin && ld.salaryMin) Object.assign(job, { salaryMin: ld.salaryMin, salaryMax: ld.salaryMax, salaryCurrency: ld.salaryCurrency });
    } catch (err) {
      if (err instanceof BlockedError) break;
    }
  }
  return jobs;
}

// ─── Sitemap → job URLs ─────────────────────────────────────────

/** Job URLs from a sitemap whose slug contains every keyword word, newest first. */
async function sitemapJobUrls(run: Run, sitemapUrl: string, keywords: string, location: string): Promise<string[]> {
  const xml = (await politeFetch(run, sitemapUrl, "application/xml,text/xml,*/*"))?.text ?? "";
  const words = slugify(keywords).split("-").filter(Boolean);
  const city = isCountryWide(location) ? "" : slugify(location.split(",")[0]!);
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map(m => ({ loc: m[1]!.match(/<loc>\s*([^<\s]+)/)?.[1] ?? "", mod: Date.parse(m[1]!.match(/<lastmod>([^<]+)/)?.[1] ?? "") || 0 }))
    .filter(u => {
      const slug = slugify(u.loc.split("/").pop() ?? "");
      return u.loc && words.every(w => slug.includes(w)) && (!city || slug.includes(city));
    })
    .sort((a, b) => b.mod - a.mod)
    .map(u => u.loc);
}

// ─── Direct sources ─────────────────────────────────────────────

type Direct = (run: Run, o: Required<Pick<HardFetchOpts, "keywords" | "location" | "limit">>) => Promise<BoardJob[]>;

/** Listing pages until `limit` or an empty page; a later page failing keeps earlier results. */
async function paged(urls: string[], limit: number, page: (url: string) => Promise<BoardJob[] | null>): Promise<BoardJob[]> {
  const out: BoardJob[] = [];
  for (const [i, url] of urls.entries()) {
    try {
      const found = await page(url);
      if (!found?.length) break;
      out.push(...found);
      if (out.length >= limit) break;
    } catch (err) {
      if (i === 0) throw err;
      break;
    }
  }
  return out;
}

const fetchInternshala: Direct = async (run, { keywords, location, limit }) => {
  const base = `https://internshala.com/jobs/${slugify(keywords)}-jobs${isCountryWide(location) ? "" : `-in-${slugify(location.split(",")[0]!)}`}/`;
  const jobs = await paged([base, `${base}page-2/`, `${base}page-3/`], limit, async url => {
    const page = await politeFetch(run, url);
    if (!page) return null;
    const $ = cheerio.load(page.text);
    return $(".individual_internship[internshipid]").toArray().map((el): BoardJob | null => {
      const card = $(el);
      const href = card.attr("data-href") ?? card.find("a.job-title-href").attr("href");
      const title = clean(card.find(".job-internship-name").text());
      if (!href || !title) return null;
      const rowText = (icon: string) => clean(card.find(`.${icon}`).parent().find("span").first().text());
      const loc = clean(card.find(".locations").text()).replace(/\s*,\s*/g, ", ");
      const exp = rowText("ic-16-briefcase");
      return {
        board: "internshala",
        externalId: card.attr("internshipid")!,
        title,
        companyName: clean(card.find(".company-name").text()) || "Unknown",
        location: /work from home/i.test(loc) ? "Remote, India" : inIndia(loc),
        remote: isRemoteText(loc),
        url: new URL(href, "https://internshala.com").toString(),
        description: clean(card.find(".about_job .text").text()),
        employmentType: employmentType(title, card.attr("employment_type") === "job" ? "full-time" : "internship"),
        tags: card.find(".job_skill").toArray().map(s => clean($(s).text())).filter(Boolean),
        ...parseSalaryText(card.find(".ic-16-money").parent().find("span.mobile").text() || rowText("ic-16-money")),
        postedAt: relativeDate(clean(card.find(".status-inactive, .status-success, .status-info").first().text())),
        experienceLevel: experienceLevel(title, yearsFrom(exp)),
      };
    }).filter((j): j is BoardJob => !!j);
  });
  run.techniques.push("listing HTML", "job-page JSON-LD");
  return enrichFromJsonLd(run, jobs);
};

const fetchShine: Direct = async (run, { keywords, location, limit }) => {
  const base = `https://www.shine.com/job-search/${slugify(keywords)}-jobs${isCountryWide(location) ? "" : `-in-${slugify(location.split(",")[0]!)}`}`;
  const jobs = await paged([base, `${base}-2`, `${base}-3`], limit, async url => {
    const page = await politeFetch(run, url);
    if (!page) return null;
    const $ = cheerio.load(page.text);
    return $('article[itemprop="itemListElement"]').toArray().map((el): BoardJob | null => {
      const card = $(el);
      const href = card.find('meta[itemprop="url"]').attr("content");
      const title = clean(card.find('[itemprop="name"]').text());
      if (!href || !title) return null;
      const meta = card.find('[class*="meta-text"]').toArray().map(m => clean($(m).text()));
      const exp = meta.find(m => /yrs?|years?|fresher/i.test(m));
      const loc = meta.find(m => m !== exp && !/₹|lakh|lac|not disclosed|lpa/i.test(m)) ?? "";
      return {
        board: "shine",
        externalId: href.match(/\/(\d+)\/?$/)?.[1] ?? href,
        title,
        companyName: clean(card.find('[class*="company"]').first().text()) || "Unknown",
        location: inIndia(loc.replace(/^all india$/i, "India")),
        remote: isRemoteText(loc, title),
        url: href,
        description: "",
        employmentType: employmentType(title),
        tags: card.find('[class*="skills-item"]').toArray().map(s => clean($(s).text()).replace(/^·\s*/, "")).filter(Boolean),
        ...parseSalaryText(meta.find(m => /₹|lakh|lac|lpa/i.test(m))),
        postedAt: relativeDate(clean(card.find('[class*="posted"]').text())),
        experienceLevel: experienceLevel(title, yearsFrom(exp)),
      };
    }).filter((j): j is BoardJob => !!j);
  });
  run.techniques.push("listing HTML", "job-page JSON-LD");
  return enrichFromJsonLd(run, jobs);
};

const fetchWellfound: Direct = async (run, { keywords, location, limit }) => {
  const role = slugify(keywords);
  const base = /^remote$/i.test(location) ? `https://wellfound.com/role/r/${role}`
    : isCountryWide(location) && !/india/i.test(location) ? `https://wellfound.com/role/${role}`
    : `https://wellfound.com/role/l/${role}/${slugify(location.split(",")[0]!)}`;
  run.techniques.push("__NEXT_DATA__ Apollo state");
  return paged([base, `${base}?page=2`, `${base}?page=3`], limit, async url => {
    const page = await politeFetch(run, url);
    if (!page) return null;
    const data: Record<string, any> = nextData(page.text)?.props?.pageProps?.apolloState?.data ?? {};
    const startupOf = new Map<string, Record<string, any>>();
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("StartupResult:")) for (const ref of v["highlightedJobListings"] ?? []) startupOf.set(ref.__ref, v);
    }
    return Object.entries(data).filter(([k]) => k.startsWith("JobListingSearchResult:")).map(([k, j]): BoardJob => {
      const startup = startupOf.get(k);
      const loc = [...(j["locationNames"] ?? []), ...(j["acceptedRemoteLocationNames"] ?? [])].join("; ");
      return {
        board: "wellfound",
        externalId: String(j["id"]),
        title: clean(j["title"]),
        companyName: clean(startup?.["name"]) || "Unknown",
        companyUrl: startup?.["slug"] ? `https://wellfound.com/company/${startup["slug"]}` : undefined,
        location: loc ? (j["remote"] ? `${loc} (Remote)` : loc) : j["remote"] ? "Remote" : "Unspecified",
        remote: !!j["remote"],
        url: `https://wellfound.com/jobs/${j["id"]}-${j["slug"] ?? slugify(j["title"] ?? "")}`,
        description: decodeEntities(String(j["description"] ?? "")).replace(/^#+\s*/gm, "").trim(),
        employmentType: employmentType(j["jobType"]),
        tags: [j["primaryRoleTitle"], startup?.["companySize"]?.replace(/^SIZE_/, "").replace("_", "-") + " employees"].filter((t): t is string => !!t && !/undefined/.test(t)),
        ...parseSalaryText(j["compensation"]?.split("•")[0]),
        postedAt: toDate(j["liveStartAt"]),
        experienceLevel: experienceLevel(j["title"] ?? "", j["yearsExperienceMin"] ?? undefined),
      };
    });
  });
};

const fetchInstahyre: Direct = async (run, { keywords, limit }) => {
  run.techniques.push("site's anonymous job_search JSON API");
  const pages = Array.from({ length: Math.min(5, Math.ceil(limit / 20)) }, (_, i) =>
    `https://www.instahyre.com/api/v1/job_search?${new URLSearchParams({ company_size: "0", isLandingPage: "true", job_type: "0", offset: String(i * 20), skills: keywords })}`);
  return paged(pages, limit, async url => {
    const page = await politeFetch(run, url, "application/json");
    if (!page) return null;
    const data = JSON.parse(page.text) as { objects?: Array<Record<string, any>> };
    return (data.objects ?? []).map((j): BoardJob => {
      const locs = String(j["locations"] ?? "");
      const title = clean(j["title"]);
      return {
        board: "instahyre",
        externalId: String(j["id"]),
        title,
        companyName: clean(j["employer"]?.["company_name"]) || "Unknown",
        location: locs.split(",").map(l => /work from home/i.test(l) ? "Remote" : l.trim()).join(", ") + ", India",
        remote: isRemoteText(locs),
        url: j["public_url"],
        description: [j["employer"]?.["company_tagline"], j["employer"]?.["instahyre_note"]].filter(Boolean).join("\n\n"),
        employmentType: employmentType(title) ?? "full-time",
        tags: (j["keywords"] ?? []).map((k: string) => k.replace(/"/g, "").trim()).filter(Boolean),
        experienceLevel: experienceLevel(title),
      };
    });
  });
};

const fetchCutshort: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("sitemap_jobs.xml", "job-page JSON-LD");
  const urls = await sitemapJobUrls(run, "https://cutshort.io/sitemap_jobs.xml", keywords, location);
  const out: BoardJob[] = [];
  for (const url of urls.slice(0, Math.min(limit, DETAIL_PAGES_PER_RUN))) {
    try {
      const job = await jsonLdJobPostingFromUrl(url, "cutshort", run);
      // Sitemap lastmod tracks page edits, so years-old postings still surface near the top.
      if (job && job.postedAt && Date.now() - job.postedAt.getTime() < 120 * 86_400_000) out.push({ ...job, location: inIndia(job.location.replace(/\s*\([^)]*\)/g, "")) });
    } catch (err) {
      if (err instanceof BlockedError) { if (!out.length) throw err; break; }
    }
  }
  return out;
};

const fetchHirist: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("sitemap (j-1.xml.gz)", "site's public job/detail JSON API");
  const urls = await sitemapJobUrls(run, "https://www.hirist.tech/new_sitemap-j-1.xml.gz", keywords, location);
  const out: BoardJob[] = [];
  for (const url of urls.slice(0, Math.min(limit, DETAIL_PAGES_PER_RUN))) {
    const id = url.match(/-(\d+)\/?$/)?.[1];
    if (!id) continue;
    try {
      const page = await politeFetch(run, `https://gladiator.hirist.tech/job/detail?jobcode=${id}`, "application/json");
      if (!page) break;
      const j = (JSON.parse(page.text) as { data?: Record<string, any> }).data;
      if (!j?.["title"] || j["hasExpired"] === true) continue;
      const company = clean(j["companyData"]?.["companyName"]);
      const locs = (j["locations"] ?? j["location"] ?? []).map((l: { name: string }) => l.name).join(", ");
      const title = clean(j["jobdesignation"]) || clean(j["title"]);
      out.push({
        board: "hirist",
        externalId: id,
        title,
        companyName: company || clean(String(j["title"]).split(" - ")[0]) || "Unknown",
        location: inIndia(locs),
        remote: j["workFromHome"] === "1" || j["workFromHome"] === 1 || isRemoteText(locs),
        url: j["jobDetailUrl"] ?? url,
        description: htmlToText(j["introText"]),
        employmentType: employmentType(title) ?? "full-time",
        tags: (j["tags"] ?? []).map((t: { name: string }) => t.name),
        // Hirist stores salary in lakhs per annum and hides it unless hideSal is 0.
        ...(Number(j["hideSal"]) === 0 && Number(j["maxSal"]) > 0
          ? { salaryMin: Number(j["minSal"]) * 100_000, salaryMax: Number(j["maxSal"]) * 100_000, salaryCurrency: "INR" } : {}),
        postedAt: toDate(j["createdTimeMs"]),
        experienceLevel: experienceLevel(title, Number(j["min"])),
      });
    } catch (err) {
      if (err instanceof BlockedError) { if (!out.length) throw err; break; }
    }
  }
  return out;
};

const fetchTimesJobs: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("Playwright render + page's own search XHR");
  const url = `https://www.timesjobs.com/job-search?${new URLSearchParams({ searchType: "personalizedSearch", from: "submit", txtKeywords: keywords, txtLocation: location })}`;
  const page = await politeRender(run, url, { capture: /tjapi\.timesjobs\.com\/search\/api\/v1\/search\/jobs\/list/ });
  if (!page) return [];
  const list = page.captured.flatMap(body => {
    try {
      const d = JSON.parse(body);
      return (JSON.parse(body)?.jobs ?? []) as Array<Record<string, any>>;
    } catch { return []; }
  });
  return list.slice(0, limit).map((j): BoardJob => {
    const title = clean(j["title"]);
    const loc = clean(j["location"]);
    // lowSalary/highSalary are -1 when the employer hides pay.
    // Small values are lakhs per annum, the unit TimesJobs shows in its filters.
    const lakhs = (n: number) => (n > 0 && n < 1000 ? n * 100_000 : n);
    const [lo, hi] = [lakhs(Number(j["lowSalary"])), lakhs(Number(j["highSalary"]))];
    return {
      board: "timesjobs",
      externalId: String(j["jobId"] ?? j["jobDetailUrl"]),
      title,
      companyName: clean(j["company"] ?? j["hfCompany"]) || "Unknown",
      location: inIndia(loc),
      remote: /remote|work from home/i.test(String(j["jobType"] ?? "")) || isRemoteText(loc, title),
      url: j["jobDetailUrl"],
      description: htmlToText(j["description"]),
      employmentType: employmentType(title) ?? "full-time",
      tags: [...String(j["skills"] ?? "").split(/,\s*/), j["jobFunction"]].filter((t): t is string => !!t && t.length <= 40),
      ...(hi > 0 ? { salaryMin: lo > 0 ? lo : hi, salaryMax: hi, salaryCurrency: j["currency"] ?? "INR" } : {}),
      postedAt: toDate(j["postDate"]),
      experienceLevel: experienceLevel(title, j["experienceFrom"] ?? undefined),
    };
  }).filter(j => j.title && j.url);
};

const fetchIndeed: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("Playwright render + embedded mosaic JSON");
  const q = (start: number) => `https://in.indeed.com/jobs?${new URLSearchParams({ q: keywords, l: location, ...(start ? { start: String(start) } : {}) })}`;
  return paged([q(0), q(10), q(20)], limit, async url => {
    const page = await politeRender(run, url);
    if (!page) return null;
    const m = page.text.match(/window\.mosaic\.providerData\["mosaic-provider-jobcards"\]\s*=\s*(\{[\s\S]*?\});\s*\n/);
    const results: Array<Record<string, any>> = m ? JSON.parse(m[1]!)?.metaData?.mosaicProviderJobCardsModel?.results ?? [] : [];
    return results.map((j): BoardJob => {
      const types = (j["taxonomyAttributes"] ?? []).find((a: any) => a.label === "job-types")?.attributes?.map((a: any) => a.label) ?? [];
      const sal = j["extractedSalary"];
      const period = String(sal?.["type"] ?? "");
      const loc = clean(j["formattedLocation"]);
      return {
        board: "indeed",
        externalId: j["jobkey"],
        title: clean(j["displayTitle"] ?? j["title"]),
        companyName: clean(j["company"]) || "Unknown",
        location: j["remoteLocation"] && !/remote/i.test(loc) ? `${loc} (Remote)` : loc.toLowerCase() === "remote" ? "Remote, India" : loc,
        remote: !!j["remoteLocation"] || isRemoteText(loc),
        url: `https://in.indeed.com/viewjob?jk=${j["jobkey"]}`,
        description: htmlToText(j["snippet"]),
        employmentType: employmentType(types),
        tags: types,
        salaryMin: sal?.["min"] > 0 ? annualize(sal["min"], period) : undefined,
        salaryMax: sal?.["max"] > 0 ? annualize(sal["max"], period) : sal?.["min"] > 0 ? annualize(sal["min"], period) : undefined,
        salaryCurrency: sal?.["min"] > 0 ? j["salarySnippet"]?.["currency"] ?? "INR" : undefined,
        postedAt: toDate(j["pubDate"]),
        experienceLevel: experienceLevel(j["title"] ?? ""),
      };
    });
  });
};

const fetchGlassdoor: Direct = async (run, { keywords, location, limit }) => {
  if (!/india/i.test(location) && !isCountryWide(location)) throw new BlockedError("only the India search URL is supported directly");
  run.techniques.push("Playwright render + DOM cards");
  // Glassdoor encodes the slug offsets and its India location id (IN115) in the path.
  const loc = "india";
  const kw = slugify(keywords);
  const url = `https://www.glassdoor.co.in/Job/${loc}-${kw}-jobs-SRCH_IL.0,${loc.length}_IN115_KO${loc.length + 1},${loc.length + 1 + kw.length}.htm`;
  const page = await politeRender(run, url);
  if (!page) return [];
  const $ = cheerio.load(page.text);
  return $('[data-test="jobListing"]').toArray().slice(0, limit).map((el): BoardJob | null => {
    const card = $(el);
    const link = card.find('[data-test="job-title"]');
    const href = link.attr("href");
    const id = card.attr("data-jobid");
    if (!href || !id) return null;
    const loc = clean(card.find('[data-test="emp-location"]').text());
    const title = clean(link.text());
    return {
      board: "glassdoor",
      externalId: id,
      title,
      companyName: clean(card.find(`[id="job-employer-${id}"] span`).first().text()) || "Unknown",
      location: loc.toLowerCase() === "remote" ? "Remote, India" : inIndia(loc),
      remote: isRemoteText(loc),
      url: new URL(href, "https://www.glassdoor.co.in").toString().split("&")[0]!,
      description: clean(card.find('[data-test="descSnippet"]').text()),
      employmentType: employmentType(title),
      tags: (clean(card.find('[data-test="descSnippet"] b').parent().text()).replace(/^skills:\s*/i, "") || "")
        .split(/,\s*/).filter(t => t && t.length <= 40),
      ...parseSalaryText(clean(card.find('[data-test="detailSalary"]').text()).replace(/\(.*?\)/g, "")),
      postedAt: relativeDate(clean(card.find('[data-test="job-age"]').text())),
      experienceLevel: experienceLevel(title),
    };
  }).filter((j): j is BoardJob => !!j);
};

const fetchSimplyHired: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("Playwright render + __NEXT_DATA__");
  const url = `https://www.simplyhired.co.in/search?${new URLSearchParams({ q: keywords, l: location })}`;
  const page = await politeRender(run, url);
  if (!page) return [];
  const list: Array<Record<string, any>> = nextData(page.text)?.props?.pageProps?.jobs ?? [];
  return list.slice(0, limit).map((j): BoardJob => {
    const loc = clean(j["location"]);
    const remote = (j["remoteAttributes"] ?? []).length > 0 || isRemoteText(loc);
    const title = clean(j["title"]);
    return {
      board: "simplyhired",
      externalId: String(j["jobKey"]).slice(0, 120),
      title,
      companyName: clean(j["company"]) || "Unknown",
      location: loc.toLowerCase() === "remote" ? "Remote, India" : inIndia(loc),
      remote,
      url: new URL(j["botUrl"] ?? decodeURIComponent(j["encodedUrl"] ?? ""), "https://www.simplyhired.co.in").toString(),
      description: clean(j["snippet"]),
      employmentType: employmentType(j["jobTypes"]),
      tags: [...(j["jobTypes"] ?? []), ...(j["requirements"] ?? [])].slice(0, 15),
      ...parseSalaryText(j["salaryInfo"]),
      postedAt: toDate(j["dateOnIndeed"]),
      experienceLevel: experienceLevel(title),
    };
  });
};

/** Akamai returns 403 to both plain HTTP and a plain browser from this machine; kept so a lifted block is noticed. */
const fetchFoundit: Direct = async (run, { keywords, location }) => {
  run.techniques.push("Playwright render");
  const page = await politeRender(run, `https://www.foundit.in/srp/results?${new URLSearchParams({ query: keywords, locations: location })}`);
  return page ? jobPostingsFromHtml(page.text).map(p => jobPostingToBoardJob(p, page.finalUrl, "foundit")).filter((j): j is BoardJob => !!j) : [];
};

const fetchMonster: Direct = async (run, { keywords, location }) => {
  run.techniques.push("Playwright render");
  const page = await politeRender(run, `https://www.monster.com/jobs/search?${new URLSearchParams({ q: keywords, where: location })}`);
  return page ? jobPostingsFromHtml(page.text).map(p => jobPostingToBoardJob(p, page.finalUrl, "monster")).filter((j): j is BoardJob => !!j) : [];
};

/**
 * LinkedIn's logged-out guest search (what linkedin-scraper.ts calls). Its robots.txt disallows
 * /jobs-guest/ for every non-whitelisted agent, so admit() refuses it and the Google index is used.
 */
const fetchLinkedInGuest: Direct = async (run, { keywords, location, limit }) => {
  run.techniques.push("jobs-guest search");
  const page = (start: number) => `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${new URLSearchParams({
    keywords, location: /^remote$/i.test(location) ? "India" : location, f_TPR: "r604800", start: String(start),
    ...(/^remote$/i.test(location) ? { f_WT: "2" } : {}),
  })}`;
  return paged([0, 25, 50, 75].map(page), limit, async url => {
    const res = await politeFetch(run, url);
    if (!res) return null;
    const $ = cheerio.load(res.text);
    return $("li").toArray().map((el): BoardJob | null => {
      const card = $(el);
      const title = clean(card.find("h3.base-search-card__title").text());
      const link = card.find("a.base-card__full-link").attr("href")?.split("?")[0];
      if (!title || !link) return null;
      const loc = clean(card.find(".job-search-card__location").text());
      return {
        board: "linkedin", externalId: link.match(/-(\d+)$/)?.[1] ?? link, title,
        companyName: clean(card.find("h4.base-search-card__subtitle").text()) || "Unknown",
        location: loc, remote: isRemoteText(loc), url: link, description: "", tags: [],
        ...parseSalaryText(clean(card.find(".job-search-card__salary-info").text())),
        postedAt: toDate(card.find("time").attr("datetime")), experienceLevel: experienceLevel(title),
      };
    }).filter((j): j is BoardJob => !!j);
  });
};

// ─── Google index (Serper) ──────────────────────────────────────

interface IndexSpec {
  /** `site:` restriction that matches only job-detail URLs. */
  site: string;
  /** Extra query words that steer Google to the right country. */
  near?: (location: string) => string;
  idFrom?: (url: string) => string | undefined;
}

const SITE_SUFFIX = /\s*[|\-–—]\s*(linkedin|indeed(\.com)?|glassdoor|naukri(\.com)?|foundit|monster(\.com)?|ziprecruiter|dice(\.com)?|simplyhired|shine\.com|timesjobs)\s*$/i;

/** Google titles: "X hiring Y in Z | LinkedIn", "Title - City - Company - 3 to 8 years ...", "Title - Company - City". */
function parseSerpTitle(raw: string, snippet: string): { title: string; company?: string; location?: string; years?: number } {
  const t = clean(raw).replace(SITE_SUFFIX, "").replace(/\s*\.\.\.$/, "");
  const hiring = t.match(/^(.+?) hiring (.+?)(?: in (.+))?$/i);
  if (hiring) return { company: hiring[1], title: hiring[2]!.replace(/\s+job$/i, ""), location: hiring[3] };
  const at = t.match(/^(.+?) at (.+?)(?: [—-] (.+))?$/);
  const parts = (at ? [at[1]!, at[2]!, at[3] ?? ""] : t.split(/\s+[-–|]\s+/)).map(s => s.trim()).filter(Boolean);
  const out: { title: string; company?: string; location?: string; years?: number } = { title: parts.shift() ?? t };
  for (const p of parts) {
    if (/\byears?\b|\byrs?\b/i.test(p)) out.years ??= yearsFrom(p);
    else if (!out.location && (/remote|india|,|\b(bangalore|bengaluru|hyderabad|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|kolkata|ahmedabad)\b/i.test(p))) out.location = p;
    else if (!out.company && !/indeed|linkedin|glassdoor|naukri|^(full|part)[- ]time$|^contract|^remote$|^hybrid$/i.test(p)) out.company = p;
  }
  out.years ??= yearsFrom(snippet);
  if (at && !out.company) out.company = parts[0];
  return out;
}

async function fromGoogleIndex(run: Run, board: string, spec: IndexSpec, { keywords, location, limit }: { keywords: string; location: string; limit: number }): Promise<BoardJob[]> {
  const provider = createSearchProvider();
  run.techniques.push(`Web search index via ${provider.name} (${spec.site})`);
  const q = `${spec.site} "${keywords}" ${spec.near ? spec.near(location) : isCountryWide(location) ? "India" : location}`;
  const out: BoardJob[] = [];
  // Each search page costs 1 credit; up to 3 pages is enough for a refresh.
  for (let page = 1; page <= Math.min(3, Math.ceil(limit / 10)); page++) {
    const results = await provider.search(q, { page, num: 10, country: isCountryWide(location) ? "IN" : undefined });
    for (const r of results) {
      const parsed = parseSerpTitle(r.title, r.snippet ?? "");
      const snippet = clean(r.snippet);
      // Job-search result pages ("Software Engineer Jobs In Bengaluru") sneak into site: results.
      if (/\bjobs\b.*\b(in|near)\b|\bjob vacancies\b|^\d[\d,]* .*jobs/i.test(parsed.title)) continue;
      const loc = parsed.location ?? (isRemoteText(parsed.title, snippet) ? "Remote" : "");
      out.push({
        board,
        externalId: spec.idFrom?.(r.url) ?? r.url,
        title: parsed.title,
        companyName: parsed.company ?? "Unknown",
        location: loc || (isCountryWide(location) ? "India" : location),
        remote: isRemoteText(loc, parsed.title),
        url: r.url,
        description: snippet,
        employmentType: employmentType(parsed.title, snippet.match(/\b(full[- ]time|part[- ]time|contract|internship|freelance)\b/i)?.[0]),
        tags: [],
        ...parseSalaryText(snippet.match(/(₹|\$|inr|usd)\s?[\d,.]+\s*(?:[-–]\s*(₹|\$)?\s?[\d,.]+)?\s*(lpa|lakh|lacs|k|\/\s?(?:hr|hour|month|year))?/i)?.[0]),
        postedAt: relativeDate(r.date) ?? toDate(r.date),
        experienceLevel: experienceLevel(parsed.title, parsed.years),
      });
    }
    if (results.length < 10) break;
  }
  return out;
}

/** Google Jobs proper needs a SerpAPI key; Serper has no jobs vertical. */
const fetchGoogleJobs: Direct = async (run, { keywords, location, limit }) => {
  const key = process.env["SERPAPI_KEY"];
  if (!key) throw new BlockedError("needs SERPAPI_KEY (google_jobs engine); Serper has no Google Jobs endpoint");
  run.techniques.push("SerpAPI google_jobs");
  const out: BoardJob[] = [];
  let token: string | undefined;
  for (let i = 0; i < 3 && out.length < limit; i++) {
    const params = new URLSearchParams({ engine: "google_jobs", q: `${keywords} ${location}`, gl: "in", hl: "en", api_key: key, ...(token ? { next_page_token: token } : {}) });
    const resp = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`SerpAPI HTTP ${resp.status}`);
    const data = await resp.json() as { jobs_results?: Array<Record<string, any>>; serpapi_pagination?: { next_page_token?: string } };
    for (const j of data.jobs_results ?? []) {
      const ext = j["detected_extensions"] ?? {};
      const loc = clean(j["location"]);
      out.push({
        board: "googlejobs",
        externalId: String(j["job_id"]).slice(0, 200),
        title: clean(j["title"]),
        companyName: clean(j["company_name"]) || "Unknown",
        location: loc || location,
        remote: !!ext["work_from_home"] || isRemoteText(loc),
        url: j["apply_options"]?.[0]?.["link"] ?? j["share_link"],
        description: clean(j["description"]),
        employmentType: employmentType(ext["schedule_type"]),
        tags: (j["extensions"] ?? []).filter((e: string) => e.length <= 30),
        ...parseSalaryText(ext["salary"]),
        postedAt: relativeDate(ext["posted_at"]),
        experienceLevel: experienceLevel(j["title"] ?? ""),
      });
    }
    token = data.serpapi_pagination?.next_page_token;
    if (!token) break;
  }
  return out;
};

// ─── Registry ───────────────────────────────────────────────────

interface HardSource {
  label: string;
  /** What works from here and why, as verified on the date in the note. */
  status: string;
  direct?: Direct;
  index?: IndexSpec;
  needsKey?: readonly string[];
  needsAnyKey?: readonly string[];
}

const lastDigits = (url: string) => url.match(/(\d{6,})(?:[/?]|$)/)?.[1];

const SOURCES: Record<string, HardSource> = {
  linkedin: {
    label: "LinkedIn",
    status: "Google index only: robots.txt disallows /jobs-guest/ (and everything else) for non-whitelisted agents.",
    direct: fetchLinkedInGuest,
    index: { site: "site:linkedin.com/jobs/view", idFrom: lastDigits },
  },
  indeed: {
    label: "Indeed",
    status: "Plain HTTP gets 403 (Cloudflare); a plain Chromium render loads in.indeed.com search with embedded job JSON.",
    direct: fetchIndeed,
    index: { site: "site:in.indeed.com/viewjob", idFrom: u => u.match(/jk=([0-9a-f]+)/)?.[1] },
  },
  naukri: {
    label: "Naukri",
    status: "Google index only: search is client-rendered behind a guarded API and robots.txt opts out AI user agents.",
    index: { site: "site:naukri.com/job-listings", near: loc => (isCountryWide(loc) ? "" : loc), idFrom: lastDigits },
    needsAnyKey: SEARCH_KEYS,
  },
  glassdoor: {
    label: "Glassdoor",
    status: "Plain HTTP gets 403; a plain Chromium render of the India search page returns ~30 job cards.",
    direct: fetchGlassdoor,
    index: { site: "site:glassdoor.co.in/job-listing", idFrom: u => u.match(/jl=(\d+)/)?.[1] },
  },
  wellfound: { label: "Wellfound", status: "Server-rendered role pages embed the Apollo state with full listings.", direct: fetchWellfound },
  foundit: {
    label: "Foundit",
    status: "Akamai 403 to both HTTP and Chromium for search and job pages; falls back to the Google index.",
    direct: fetchFoundit,
    index: { site: "site:foundit.in/job", near: loc => (isCountryWide(loc) ? "" : loc), idFrom: lastDigits },
  },
  instahyre: { label: "Instahyre", status: "The landing page's anonymous job_search JSON API (no login).", direct: fetchInstahyre },
  internshala: { label: "Internshala", status: "Listing HTML pages plus job-page JSON-LD.", direct: fetchInternshala },
  googlejobs: { label: "Google Jobs", status: "Needs SERPAPI_KEY (google_jobs engine); Serper has no Google Jobs vertical.", direct: fetchGoogleJobs, needsKey: ["SERPAPI_KEY"] },
  monster: {
    label: "Monster",
    status: "Akamai 403 to both HTTP and Chromium; falls back to the Google index.",
    direct: fetchMonster,
    index: { site: "site:monster.com/job-openings", near: () => "" },
  },
  ziprecruiter: {
    label: "ZipRecruiter",
    status: "Google index only: robots.txt disallows everything for generic agents (and HTTP 403).",
    index: { site: "site:ziprecruiter.com/c", near: () => "remote" },
    needsAnyKey: SEARCH_KEYS,
  },
  dice: {
    label: "Dice",
    status: "Google index only: robots.txt disallows /jobs?q and /job-detail pages.",
    index: { site: "site:dice.com/job-detail", near: () => "" },
    needsAnyKey: SEARCH_KEYS,
  },
  simplyhired: {
    label: "SimplyHired",
    status: "Plain HTTP gets 403; a plain Chromium render returns __NEXT_DATA__ with 20 jobs.",
    direct: fetchSimplyHired,
    index: { site: "site:simplyhired.co.in/job" },
  },
  cutshort: { label: "Cutshort", status: "sitemap_jobs.xml filtered by slug, then each job page's JSON-LD.", direct: fetchCutshort },
  hirist: { label: "Hirist", status: "Job sitemap filtered by slug, then the site's public job/detail JSON.", direct: fetchHirist },
  shine: { label: "Shine", status: "Server-rendered search HTML plus job-page JSON-LD.", direct: fetchShine },
  timesjobs: { label: "TimesJobs", status: "Client-rendered; Chromium render and read the page's own search API response.", direct: fetchTimesJobs },
};

function newRun(board: string): Run {
  return { board, pagesLeft: PAGES_PER_RUN, blocked: new Map(), techniques: [] };
}

async function runSource(id: string, src: HardSource, opts: HardFetchOpts): Promise<BoardJob[]> {
  const run = newRun(id);
  const o = { keywords: opts.keywords?.trim() || "software engineer", location: opts.location?.trim() || "India", limit: opts.limit };
  const problems: string[] = [];
  let jobs: BoardJob[] = [];
  if (src.direct) {
    try {
      jobs = await src.direct(run, o);
    } catch (err: any) {
      problems.push(`${err instanceof BlockedError ? "blocked" : "failed"}: ${err?.message ?? err}`);
    }
  }
  if (jobs.length === 0 && src.index) {
    try {
      jobs = await fromGoogleIndex(run, id, src.index, o);
    } catch (err: any) {
      problems.push(`index ${err instanceof BlockedError ? "blocked" : "failed"}: ${err?.message ?? err}`);
    }
  }
  HARD_LAST_RUN.set(id, { board: id, techniques: run.techniques, blocked: problems, fetched: jobs.length });
  if (jobs.length === 0 && problems.length) throw new Error(problems.join("; "));
  return jobs;
}

/** Registry entries in the job-boards.ts BoardSource shape; `status` documents the technique. */
export const HARD_BOARDS: Record<string, { label: string; status: string; needsKey?: readonly string[]; needsAnyKey?: readonly string[]; fetch(opts: HardFetchOpts): Promise<BoardJob[]> }> =
  Object.fromEntries(Object.entries(SOURCES).map(([id, src]) => [id, {
    label: src.label,
    status: src.status,
    needsKey: src.needsKey,
    needsAnyKey: src.needsAnyKey,
    fetch: (opts: HardFetchOpts) => runSource(id, src, opts),
  }]));
