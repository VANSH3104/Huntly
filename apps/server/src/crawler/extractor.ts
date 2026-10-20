import * as cheerio from "cheerio";
import { normalizeLocation, normalizeJobTitle, normalizeUrl, extractDomain } from "../utils/normalize.js";
import { detectATS } from "./career-discovery.js";
import type { Job, JobLocation } from "@huntly/shared";
import { v4 as uuidv4 } from "uuid";
import crypto from "node:crypto";

export interface ExtractedJob {
  title: string;
  description: string;
  location: JobLocation;
  sourceUrl: string;
  applyUrl: string;
  externalJobId?: string;
  postedAt?: Date;
  expiresAt?: Date;
  employmentType?: string;
  salary?: { min?: number; max?: number; currency?: string };
  skills?: string[];
  requirements?: string[];
  responsibilities?: string[];
}

// ─── JSON-LD Extractor ──────────────────────────────────────────

export function extractFromJsonLD(html: string, pageUrl: string): ExtractedJob[] {
  const $ = cheerio.load(html);
  const results: ExtractedJob[] = [];

  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).html();
    if (!raw) return;

    let data: unknown;
    try { data = JSON.parse(raw); } catch { return; }

    const jobPostings = extractJobPostings(data);
    for (const posting of jobPostings) {
      const job = normalizeJobPosting(posting, pageUrl);
      if (job) results.push(job);
    }
  });

  return results;
}

function extractJobPostings(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];

  const candidates: Record<string, unknown>[] = [];

  if (Array.isArray(data)) {
    for (const item of data) candidates.push(...extractJobPostings(item));
    return candidates;
  }

  const obj = data as Record<string, unknown>;

  // Direct JobPosting
  if (obj["@type"] === "JobPosting" || (Array.isArray(obj["@type"]) && (obj["@type"] as string[]).includes("JobPosting"))) {
    candidates.push(obj);
  }

  // @graph
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"] as unknown[]) {
      candidates.push(...extractJobPostings(item));
    }
  }

  return candidates;
}

function normalizeJobPosting(posting: Record<string, unknown>, pageUrl: string): ExtractedJob | null {
  const title = getString(posting["title"]) ?? getString(posting["name"]);
  if (!title) return null;

  const description = stripHtml(
    getString(posting["description"]) ??
    getString(posting["responsibilities"]) ?? ""
  );

  // Location
  const locationRaw = posting["jobLocation"];
  let locationStr = "";
  if (typeof locationRaw === "object" && locationRaw !== null) {
    const loc = locationRaw as Record<string, unknown>;
    const address = loc["address"] as Record<string, unknown> | undefined;
    locationStr = [
      getString(address?.["addressLocality"]),
      getString(address?.["addressRegion"]),
      getString(address?.["addressCountry"]),
    ].filter(Boolean).join(", ");
  }
  const location = normalizeLocation(locationStr || getString(posting["applicantLocationRequirements"]) || "");

  // Remote
  const jobLocationType = getString(posting["jobLocationType"]);
  if (jobLocationType === "TELECOMMUTE") location.remote = true;

  // Apply URL
  const applyUrl = getString(posting["url"]) ?? pageUrl;

  // Posted / expires
  const postedAt = parseDate(getString(posting["datePosted"]));
  const expiresAt = parseDate(getString(posting["validThrough"]));

  // Salary
  const salaryData = posting["baseSalary"] as Record<string, unknown> | undefined;
  let salary: ExtractedJob["salary"];
  if (salaryData) {
    const value = salaryData["value"] as Record<string, unknown> | undefined;
    salary = {
      min: value?.["minValue"] as number | undefined,
      max: value?.["maxValue"] as number | undefined,
      currency: getString(salaryData["currency"]),
    };
  }

  return {
    title,
    description,
    location,
    sourceUrl: normalizeUrl(pageUrl),
    applyUrl: normalizeUrl(applyUrl),
    postedAt,
    expiresAt,
    salary,
  };
}

// ─── HTML Extractor ─────────────────────────────────────────────

export function extractFromHTML(html: string, pageUrl: string): ExtractedJob[] {
  const $ = cheerio.load(html);
  const results: ExtractedJob[] = [];

  // Common job listing selectors
  const jobSelectors = [
    "[data-job-id]",
    "[data-qa-posting-id]",
    "[data-automation-id*='job']",
    ".posting",
    ".job-listing",
    ".job-card",
    ".job-item",
    ".position",
    ".opening",
    "[class*='ashby-job']",
    "[class*='vacancy']",
    "[class*='role-card']",
    "article[class*='job']",
    "li[class*='job']",
    "div[class*='job-']",
    ".careers-list li",
    ".open-positions li",
  ];

  let jobElements = $();
  for (const sel of jobSelectors) {
    const found = $(sel);
    if (found.length > 0) {
      jobElements = found;
      break;
    }
  }

  jobElements.each((_i, el) => {
    const $el = $(el);

    const title =
      $el.find("h1, h2, h3, h4, h5, .title, .job-title, [class*='title'], [data-qa*='posting-name']").first().text().trim() ||
      $el.find("a").first().text().trim();

    if (!title || title.length < 3) return;

    const locationText = $el.find(".location, [class*='location'], [class*='city']").first().text().trim();
    const applyHref = $el.find("a[href*='apply'], a[href*='job'], a").first().attr("href");
    const applyUrl = applyHref
      ? (applyHref.startsWith("http") ? applyHref : new URL(applyHref, pageUrl).toString())
      : pageUrl;

    results.push({
      title,
      description: $el.text().trim().slice(0, 500),
      location: normalizeLocation(locationText),
      sourceUrl: normalizeUrl(pageUrl),
      applyUrl: normalizeUrl(applyUrl),
    });
  });

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────

function getString(val: unknown): string | undefined {
  if (typeof val === "string") return val || undefined;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    return getString(obj["@value"]) ?? getString(obj["name"]);
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseDate(str?: string): Date | undefined {
  if (!str) return undefined;
  const d = new Date(str);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Content Hash ───────────────────────────────────────────────

export function computeContentHash(job: ExtractedJob): string {
  const key = `${job.title}|${job.description.slice(0, 500)}|${job.applyUrl}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}
