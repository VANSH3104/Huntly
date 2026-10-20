import { CITY_ALIASES, SKILL_CANONICAL, INDIA_STATES } from "@huntly/shared";
import type { JobLocation } from "@huntly/shared";

// ─── Location Normalization ─────────────────────────────────────

export function normalizeLocation(raw: string): JobLocation {
  if (!raw) return {};

  const lower = raw.toLowerCase().trim();

  // Check for remote
  const isRemote =
    lower.includes("remote") ||
    lower.includes("work from home") ||
    lower.includes("wfh");

  // Detect country
  const isIndia =
    lower.includes("india") ||
    lower.includes("bangalore") ||
    lower.includes("bengaluru") ||
    lower.includes("hyderabad") ||
    lower.includes("mumbai") ||
    lower.includes("pune") ||
    lower.includes("delhi") ||
    lower.includes("gurugram") ||
    lower.includes("noida") ||
    lower.includes("chennai") ||
    lower.includes("kolkata");

  // Extract city
  let city: string | undefined;
  for (const [alias, canonical] of Object.entries(CITY_ALIASES)) {
    if (lower.includes(alias)) {
      city = canonical;
      break;
    }
  }

  // Extract state
  let state: string | undefined;
  for (const [stateKey, stateName] of Object.entries(INDIA_STATES)) {
    if (lower.includes(stateKey)) {
      state = stateName;
      break;
    }
  }

  return {
    city,
    state,
    country: isIndia ? "India" : extractCountry(raw),
    remote: isRemote,
    remoteType: isRemote
      ? lower.includes("hybrid") ? "HYBRID" : "FULLY_REMOTE"
      : "ON_SITE",
  };
}

function extractCountry(raw: string): string | undefined {
  const countries = [
    "United States", "USA", "US",
    "United Kingdom", "UK",
    "Canada", "Australia", "Germany", "Singapore",
  ];
  for (const c of countries) {
    if (raw.toLowerCase().includes(c.toLowerCase())) return c;
  }
  return undefined;
}

// ─── Skill Normalization ────────────────────────────────────────

export class SkillNormalizer {
  normalizeAll(skills: string[]): Array<{ raw: string; canonical: string }> {
    return skills.map(raw => ({
      raw,
      canonical: this.normalize(raw),
    }));
  }

  normalize(raw: string): string {
    const lower = raw.toLowerCase().trim();
    return SKILL_CANONICAL[lower] ?? this.titleCase(raw.trim());
  }

  private titleCase(str: string): string {
    return str.replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase()
    );
  }
}

// ─── Title Normalization ────────────────────────────────────────

export function normalizeJobTitle(raw: string): string {
  const lower = raw.toLowerCase().trim();

  // Normalize common variations
  const replacements: Array<[RegExp, string]> = [
    [/\b(swe|sde)\b/gi, "Software Engineer"],
    [/\bsoftware dev(eloper)?\b/gi, "Software Developer"],
    [/\bfull[- ]stack\b/gi, "Full Stack"],
    [/\bback[- ]end\b/gi, "Backend"],
    [/\bfront[- ]end\b/gi, "Frontend"],
    [/\bintern(ship)?\b/gi, "Intern"],
    [/\b(new grad|ng|entry.?level)\b/gi, "Entry Level"],
    [/\bi+\b(?=\s|$)/gi, "I"],
  ];

  let normalized = raw;
  for (const [pat, rep] of replacements) {
    normalized = normalized.replace(pat, rep);
  }

  return normalized
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── URL Normalization ──────────────────────────────────────────

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove tracking params
    const trackingParams = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "ref", "source", "referrer", "tracking", "click_id",
    ];
    for (const param of trackingParams) {
      u.searchParams.delete(param);
    }
    // Lowercase host
    u.hostname = u.hostname.toLowerCase();
    // Remove trailing slash from path
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return url;
  }
}

// ─── Domain Extraction ──────────────────────────────────────────

export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Skills Extraction ──────────────────────────────────────────

export function extractSkillsFromText(text: string): string[] {
  if (!text) return [];
  const techPattern = /\b(React(?:\.js)?|Vue(?:\.js)?|Angular|Next\.js|TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Node(?:\.js)?|Express|PostgreSQL|MySQL|MongoDB|Redis|Docker|Kubernetes|AWS|GCP|Azure|Git|Linux|GraphQL|REST|Spring(?:\s*Boot)?|Django|Flask|FastAPI|TensorFlow|PyTorch|Pandas|NumPy|HTML|CSS|Tailwind|Sass|Kotlin|Swift|Dart|Flutter|React\s*Native|Elasticsearch)\b/gi;
  const matches = [...text.matchAll(techPattern)];
  return [...new Set(matches.map(m => m[0]))];
}

