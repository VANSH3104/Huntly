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

// ─── Role Title & Deduplication Normalization ───────────────────

import crypto from "node:crypto";

const TRAILING_CLAUSE_PATTERN = /(\s*,\s*|\s+[|@]\s*|\s+[-–—]\s*)[^,|@\-–—]*$/;

/**
 * Strips trailing location/qualifier clauses (e.g. "Senior Frontend Engineer - Bengaluru" -> "Senior Frontend Engineer")
 * so multi-city reposts of the same vacancy collapse to one canonical role.
 */
export function stripTrailingClause(title: string): string {
  if (!title) return "";
  const stripped = title.replace(TRAILING_CLAUSE_PATTERN, "").trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  return words.length >= 2 ? stripped : title.trim();
}

/**
 * Computes a deterministic SHA-256 fingerprint representing a job's true role identity
 * (company + normalized title + core description), ignoring volatile fields like external IDs,
 * timestamps, and location variations.
 */
export function calculateRoleFingerprint(company: string, title: string, description = ""): string {
  const cleanCompany = (company || "unknown").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  const cleanTitle = stripTrailingClause(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanDesc = (description || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

  return crypto
    .createHash("sha256")
    .update(`${cleanCompany}\x1e${cleanTitle}\x1e${cleanDesc}`)
    .digest("hex");
}

// ─── Skills Extraction (Curated Dictionary) ─────────────────────

const CANONICAL_SKILLS: Record<string, string> = {
  // Languages
  typescript: "TypeScript", ts: "TypeScript",
  javascript: "JavaScript", js: "JavaScript",
  python: "Python", py: "Python",
  golang: "Go", go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  csharp: "C#", "c#": "C#",
  cpp: "C++", "c++": "C++",
  c: "C",
  ruby: "Ruby",
  php: "PHP",
  scala: "Scala",
  elixir: "Elixir",

  // Frontend & Mobile
  react: "React", reactjs: "React",
  vue: "Vue.js", vuejs: "Vue.js",
  angular: "Angular",
  svelte: "Svelte", sveltekit: "Svelte",
  nextjs: "Next.js", "next.js": "Next.js",
  nuxt: "Nuxt", nuxtjs: "Nuxt",
  remix: "Remix",
  flutter: "Flutter",
  reactnative: "React Native", "react native": "React Native",
  tailwind: "Tailwind CSS", tailwindcss: "Tailwind CSS",
  html5: "HTML5", html: "HTML5",
  css3: "CSS3", css: "CSS3",
  sass: "Sass", scss: "Sass",

  // Backend & APIs
  nodejs: "Node.js", "node.js": "Node.js", node: "Node.js",
  express: "Express.js", expressjs: "Express.js",
  fastapi: "FastAPI",
  django: "Django",
  flask: "Flask",
  spring: "Spring Boot", springboot: "Spring Boot", "spring boot": "Spring Boot",
  nestjs: "NestJS",
  graphql: "GraphQL",
  rest: "REST APIs", "rest api": "REST APIs", "restful": "REST APIs",
  grpc: "gRPC",

  // Databases & Storage
  postgresql: "PostgreSQL", postgres: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB", mongo: "MongoDB",
  redis: "Redis",
  sqlite: "SQLite",
  cassandra: "Cassandra",
  dynamodb: "DynamoDB",
  elasticsearch: "Elasticsearch",
  clickhouse: "ClickHouse",
  supabase: "Supabase",

  // Cloud & DevOps & Infra
  docker: "Docker",
  kubernetes: "Kubernetes", k8s: "Kubernetes",
  aws: "AWS", amazonwebservices: "AWS",
  gcp: "GCP", googlecloud: "GCP",
  azure: "Azure",
  terraform: "Terraform",
  ansible: "Ansible",
  ci_cd: "CI/CD", cicd: "CI/CD",
  github_actions: "GitHub Actions",
  linux: "Linux",
  nginx: "Nginx",
  kafka: "Kafka",
  rabbitmq: "RabbitMQ",

  // AI & Data
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  langchain: "LangChain",
  llamaindex: "LlamaIndex",
  huggingface: "Hugging Face",
  pandas: "Pandas",
  numpy: "NumPy",
  scikit_learn: "Scikit-Learn",
  spark: "Apache Spark",
  airflow: "Apache Airflow",
  snowflake: "Snowflake",
  databricks: "Databricks",
};

export function extractSkillsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9#+.]/g, " ")} `;

  for (const [key, canonical] of Object.entries(CANONICAL_SKILLS)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<=[\\s,./;:])${escaped}(?=[\\s,./;:])`, "i");
    if (re.test(lower)) {
      found.add(canonical);
    }
  }

  return [...found];
}

