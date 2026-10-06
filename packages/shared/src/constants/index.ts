// ═══════════════════════════════════════════════════════════════
// Job Matching Weights (configurable)
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_MATCH_WEIGHTS = {
  skill: 0.30,
  role: 0.20,
  experience: 0.15,
  location: 0.10,
  education: 0.05,
  technology: 0.05,
  company: 0.05,
  freshness: 0.05,
  source: 0.05,
} as const;

// ═══════════════════════════════════════════════════════════════
// ATS Names
// ═══════════════════════════════════════════════════════════════

export const ATS_NAMES = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "smartrecruiters",
  "workable",
  "bamboohr",
  "icims",
  "jobvite",
  "recruitee",
  "teamtailor",
  "rippling",
  "pinpoint",
  "personio",
  "jazzhr",
  "comeet",
  "breezy",
  "successfactors",
] as const;

export type ATSName = (typeof ATS_NAMES)[number];

// ═══════════════════════════════════════════════════════════════
// Indian Tech City Normalization Map
// ═══════════════════════════════════════════════════════════════

export const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  blr: "Bengaluru",
  hyderabad: "Hyderabad",
  hyd: "Hyderabad",
  pune: "Pune",
  gurugram: "Gurugram",
  gurgaon: "Gurugram",
  noida: "Noida",
  mumbai: "Mumbai",
  bombay: "Mumbai",
  delhi: "Delhi",
  "new delhi": "Delhi",
  newdelhi: "Delhi",
  ncr: "Delhi",
  chennai: "Chennai",
  madras: "Chennai",
  kolkata: "Kolkata",
  calcutta: "Kolkata",
  ahmedabad: "Ahmedabad",
  jaipur: "Jaipur",
  indore: "Indore",
};

export const INDIA_STATES: Record<string, string> = {
  karnataka: "Karnataka",
  "andhra pradesh": "Andhra Pradesh",
  telangana: "Telangana",
  maharashtra: "Maharashtra",
  "uttar pradesh": "Uttar Pradesh",
  delhi: "Delhi",
  "national capital territory": "Delhi",
  "tamil nadu": "Tamil Nadu",
  "west bengal": "West Bengal",
  gujarat: "Gujarat",
  rajasthan: "Rajasthan",
  "madhya pradesh": "Madhya Pradesh",
  haryana: "Haryana",
};

// ═══════════════════════════════════════════════════════════════
// Freshness Scoring (days → score 0–100)
// ═══════════════════════════════════════════════════════════════

export const FRESHNESS_THRESHOLDS = [
  { maxDays: 1, score: 100 },
  { maxDays: 3, score: 90 },
  { maxDays: 7, score: 75 },
  { maxDays: 14, score: 55 },
  { maxDays: 30, score: 35 },
  { maxDays: Infinity, score: 10 },
] as const;

// ═══════════════════════════════════════════════════════════════
// Source Authority Scores
// ═══════════════════════════════════════════════════════════════

export const SOURCE_AUTHORITY: Record<string, number> = {
  company: 100,
  ats: 95,
  job_board: 75,
  search: 20,
};

// ═══════════════════════════════════════════════════════════════
// Career Page Common Paths
// ═══════════════════════════════════════════════════════════════

export const CAREER_PATH_CANDIDATES = [
  "/careers",
  "/career",
  "/jobs",
  "/job",
  "/work-with-us",
  "/join-us",
  "/opportunities",
  "/careers/jobs",
  "/company/careers",
  "/about/careers",
  "/en/careers",
  "/en-us/careers",
  "/open-roles",
  "/positions",
  "/vacancies",
  "/engineering/careers",
  "/tech/careers",
] as const;

// ═══════════════════════════════════════════════════════════════
// Default User Settings
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_SETTINGS = {
  profile: {},
  jobPreferences: {
    roles: [
      "Software Engineer Intern",
      "SWE Intern",
      "Software Engineering Intern",
      "Software Developer Intern",
      "Backend Engineer Intern",
      "Frontend Engineer Intern",
      "Full Stack Engineer Intern",
      "Software Engineer",
      "SDE I",
      "Software Engineer I",
    ],
    locations: [
      "India",
      "Bengaluru",
      "Bangalore",
      "Hyderabad",
      "Pune",
      "Gurugram",
      "Gurgaon",
      "Noida",
      "Mumbai",
      "Chennai",
      "Delhi",
      "Remote India",
    ],
    experience: ["Internship", "0 years", "0-1 years", "0-2 years"],
    remote: true,
    skills: [],
    excludeKeywords: [],
  },
  crawler: {
    concurrency: 3,
    delayMs: 1200,
    defaultIntervalMinutes: 360,
  },
  notifications: {
    enabled: true,
    minMatchScore: 80,
    onlyDirectCompany: false,
    onlyNew: true,
    digestMode: "daily" as const,
  },
  appearance: {
    theme: "dark" as const,
  },
  gemini: {
    model: "gemini-1.5-flash",
    maxJobsPerBatch: 20,
    minScoreForAI: 60,
  },
} as const;

// ═══════════════════════════════════════════════════════════════
// Skill Canonical Map
// ═══════════════════════════════════════════════════════════════

export const SKILL_CANONICAL: Record<string, string> = {
  "react.js": "React",
  reactjs: "React",
  react: "React",
  "vue.js": "Vue.js",
  vuejs: "Vue.js",
  vue: "Vue.js",
  "angular.js": "Angular",
  angularjs: "Angular",
  angular: "Angular",
  "next.js": "Next.js",
  nextjs: "Next.js",
  "node.js": "Node.js",
  nodejs: "Node.js",
  node: "Node.js",
  typescript: "TypeScript",
  ts: "TypeScript",
  javascript: "JavaScript",
  js: "JavaScript",
  python3: "Python",
  python: "Python",
  java: "Java",
  golang: "Go",
  go: "Go",
  rust: "Rust",
  "c++": "C++",
  cpp: "C++",
  "c#": "C#",
  csharp: "C#",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  mongodb: "MongoDB",
  mongo: "MongoDB",
  redis: "Redis",
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  graphql: "GraphQL",
  "rest api": "REST",
  restful: "REST",
  git: "Git",
  linux: "Linux",
  "machine learning": "Machine Learning",
  ml: "Machine Learning",
  "deep learning": "Deep Learning",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  springboot: "Spring Boot",
  "spring boot": "Spring Boot",
  spring: "Spring Boot",
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
};
