const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, 'agentforge.db');
const db = new Database(dbPath);

const resume = db.prepare('SELECT id, parsed_json FROM resumes WHERE is_active = 1 LIMIT 1').get();
let resumeSkills = new Set();
if (resume && resume.parsed_json) {
  try {
    const parsed = JSON.parse(resume.parsed_json);
    (parsed.skills || []).forEach(s => resumeSkills.add(s.toLowerCase().trim()));
  } catch (e) {}
}

const resumeSkillRows = db.prepare('SELECT canonical FROM resume_skills WHERE resume_id = ?').all(resume ? resume.id : '');
resumeSkillRows.forEach(r => resumeSkills.add(r.canonical.toLowerCase().trim()));
// Common aliases from Vansh's resume
['typescript', 'javascript', 'react', 'next.js', 'node.js', 'express', 'fastapi', 'rest', 'mongodb', 'redis', 'docker', 'linux', 'git', 'rust', 'go', 'golang', 'python', 'java', 'c++', 'sql', 'grpc', 'websockets', 'kafka', 'apache kafka', 'ci/cd', 'solana', 'anchor', 'claude', 'mcp', 'zstandard', 'protobuf', 'kubernetes', 'html', 'css', 'ai', 'cloud', 'algorithms', 'debugging'].forEach(s => resumeSkills.add(s));

const freehireJobs = [
  {
    company: "Motorola Solutions",
    title: "Software Developer Intern",
    location: "Malaysia",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Full-time",
    experienceLevel: "intern",
    sourceUrl: "https://my.jobstreet.com/job/95356978?utm_source=freehire.me",
    applyUrl: "https://my.jobstreet.com/job/95356978?utm_source=freehire.me",
    skills: ["Agile", "Android", "C++", "C#", "Java"],
    description: "Company Overview: At Motorola Solutions, we believe that everything starts with our people. We are a global close-knit community, united by the relentless pursuit to help keep people safer everywhere. We build mission-critical systems and software."
  },
  {
    company: "SecurityBoat",
    title: "Software Developer Intern",
    location: "Pune, India",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://securityboat.zohorecruit.in/jobs/Careers/158752000004481190?utm_source=freehire.me",
    applyUrl: "https://securityboat.zohorecruit.in/jobs/Careers/158752000004481190?utm_source=freehire.me",
    skills: ["API", "Azure", "Azure Functions", "Cloud", "CSS", "HTML", "JavaScript", "React.js", "Next.js", "Node.js", "Express.js", "MongoDB", "REST", "Git", "TypeScript", "Linux"],
    description: "SecurityBoat is hiring a fresher Software Developer Intern in Pune (on-site, Mon-Sat, Baner office) to work on real-world web applications and cybersecurity solutions across the full stack: frontend, backend, databases, and Azure cloud deployment, using HTML, CSS, JavaScript, React.js, Next.js, Node.js, Express.js, and MongoDB, with mentorship and training."
  },
  {
    company: "Plata",
    title: "Software Engineer - Golang Junior / Junior+",
    location: "Worldwide",
    region: "Worldwide",
    workFormat: "Remote",
    grade: "Junior",
    employmentType: "Full-time",
    experienceLevel: "junior",
    sourceUrl: "https://freehire.me/jobs/junior-software-engineer-plata",
    applyUrl: "https://plata.card/careers",
    skills: ["AI", "AWS", "EKS", "Go", "Kafka", "MongoDB", "PostgreSQL", "Redis"],
    description: "Build and maintain backend services in Go for fintech products like CRM and customer care, collaborating with teams to improve reliability and performance. We are looking for Software Engineers - Golang to join one of our teams: Transfers, AML and others."
  },
  {
    company: "Cloudflare",
    title: "Software Engineer, Network Performance & Reliability (Argo)",
    location: "United States",
    region: "Worldwide",
    workFormat: "Hybrid",
    grade: "Mid-Senior",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://cloudflare.com/careers",
    applyUrl: "https://cloudflare.com/careers",
    skills: ["AI", "API", "ClickHouse", "C++", "Distributed Systems", "Rust", "Go", "Linux", "Kubernetes", "gRPC", "Docker", "Git", "CI/CD", "Protobuf", "Zstandard"],
    description: "Build and maintain Cloudflare's Argo platform to deliver ultra-reliable, high-performance network connectivity for products like CDN, Workers, and Magic Transit using Rust, Go, and Linux networking."
  },
  {
    company: "Network for Electronic Transfers (S)",
    title: "Software Developer Intern",
    location: "Singapore",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://careers.nets.com.sg/job/Braddell-Software-Developer-Intern/1367712466/?utm_source=freehire.me",
    applyUrl: "https://careers.nets.com.sg/job/Braddell-Software-Developer-Intern/1367712466/?utm_source=freehire.me",
    skills: ["Angular", "API", "Cloud", "CSS", "HTML", "Java", "Spring", "React", "SQL", "Kafka", "REST", "Git", "Docker", "Linux", "CI/CD"],
    description: "An internship at NETS, Singapore's electronic payments network, in its Project Delivery Group: the intern develops, tests, and documents code changes for a dedicated project under a project manager, using Java/Spring backends, Angular/React frontends, SQL, and messaging middleware such as Kafka."
  },
  {
    company: "Innowave Tech Pte. Ltd.",
    title: "Software Developer Intern",
    location: "Singapore",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://www.mycareersfuture.gov.sg",
    applyUrl: "https://www.mycareersfuture.gov.sg",
    skills: ["AI", "Automation", "Docker", "Git", "Java", "Python", "Linux", "REST", "CI/CD", "C++", "SQL", "TypeScript"],
    description: "Your Mission: You will learn by doing. You will support the development of web-based automation systems, write clean and maintainable code, and gain exposure to AI-enabled industrial applications."
  },
  {
    company: "Deale",
    title: "Software Developer Intern",
    location: "Barcelona, Spain",
    region: "Europe",
    workFormat: "Hybrid",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://deale.factorial.es",
    applyUrl: "https://deale.factorial.es",
    skills: ["Agile", "AWS", "Claude Code", "Confluence", "CSS", "HTML", "JavaScript", "React", "Next.js", "Python", "REST", "Git", "TypeScript", "Node.js", "SQL", "Docker", "FastAPI", "API", "PostgreSQL", "Linux"],
    description: "Deale, a Barcelona/New York startup running the leading M&A marketplace for SMEs, is hiring a Software Developer Intern (via internship agreement) to build and maintain the app's frontend and backend using React/Next.js and Python."
  },
  {
    company: "Skillzenloop",
    title: "Software Developer Intern",
    location: "India",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://t.me/cs_algo/21889?utm_source=freehire.me",
    applyUrl: "https://t.me/cs_algo/21889?utm_source=freehire.me",
    skills: ["Git", "Algorithms", "Debugging"],
    description: "Skillzenloop is hiring a Software Developer Intern in India for freshers/entry-level candidates. Day-to-day work centers on algorithms, Git, and debugging."
  },
  {
    company: "Capgemini",
    title: "Software Developer Intern",
    location: "Casablanca, Morocco",
    region: "Africa, MENA",
    workFormat: "On-site",
    grade: "Intern",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://careers.capgemini.com",
    applyUrl: "https://careers.capgemini.com",
    skills: ["API", "Azure", "Cloud", "Dart", "Firebase", "Flutter", "Java", "Spring Boot", "Node.js", "Git", "REST", "SQL"],
    description: "Capgemini Engineering in Casablanca is hiring two 2-3 month Bac+5 interns to build an internal carpooling mobile app from scratch with geolocated matching and cloud deployment."
  },
  {
    company: "Displate",
    title: "Junior Software Engineer",
    location: "Warsaw, Poland",
    region: "Europe",
    workFormat: "Hybrid",
    grade: "Junior",
    employmentType: "Full-time",
    experienceLevel: "junior",
    sourceUrl: "https://displate.peopleforce.io",
    applyUrl: "https://displate.peopleforce.io",
    skills: ["AI", "API", "AWS", "Claude Code", "E-commerce", "TypeScript", "Node.js", "React", "Docker", "Git", "PostgreSQL", "Redis", "Kafka", "Linux"],
    description: "We are looking for a Junior Software Engineer to join our Engineering Team, grow with us, and help shape what we build next. You will ship features for high-traffic platforms."
  },
  {
    company: "Adamantine Recruitment",
    title: "Software Engineer",
    location: "Dublin, Ireland",
    region: "Europe",
    workFormat: "Remote",
    grade: "Junior-Mid",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://ie.whatjobs.com",
    applyUrl: "https://ie.whatjobs.com",
    skills: ["Agentic AI", "AI", "API", "React", "TypeScript", "Node.js", "Python"],
    description: "Full Stack Engineer | React/Node | Dublin. You will be among some of the first engineers here. A small AI startup building autonomous agents that do real, measurable work inside enterprise businesses."
  }
];

const insertCompany = db.prepare(`
  INSERT OR IGNORE INTO companies (id, name, domain, created_at, updated_at)
  VALUES (?, ?, ?, unixepoch('now') * 1000, unixepoch('now') * 1000)
`);

const insertJob = db.prepare(`
  INSERT INTO jobs (
    id, company_id, title, normalized_title, location_json, skills,
    description_raw, description_html, experience_level, employment_type,
    source_url, apply_url, status, posted_at, first_seen_at, last_verified_at,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, unixepoch('now') * 1000, unixepoch('now') * 1000
  )
`);

const insertMatch = db.prepare(`
  INSERT OR REPLACE INTO job_matches (
    id, job_id, resume_id, overall_score, skill_score, role_score,
    experience_score, location_score, freshness_score, source_score,
    company_score, breakdown_json, computed_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch('now') * 1000
  )
`);

console.log('Seeding Freehire jobs...');

for (const item of freehireJobs) {
  const companyId = crypto.randomUUID();
  insertCompany.run(companyId, item.company, item.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com');

  const jobId = crypto.randomUUID();
  const locationObj = {
    city: item.location,
    country: item.region,
    isRemote: item.workFormat === "Remote",
    workplaceType: item.workFormat.toLowerCase()
  };

  const now = Date.now();
  const postedAt = new Date(now - Math.floor(Math.random() * 86400000 * 3));

  insertJob.run(
    jobId,
    companyId,
    item.title,
    item.title.toLowerCase(),
    JSON.stringify(locationObj),
    JSON.stringify(item.skills),
    item.description,
    `<p>${item.description}</p>`,
    item.experienceLevel,
    item.employmentType,
    item.sourceUrl,
    item.applyUrl,
    postedAt.getTime(),
    postedAt.getTime(),
    now
  );

  // Compute match score against Vansh's skills
  let matchedCount = 0;
  for (const s of item.skills) {
    if (resumeSkills.has(s.toLowerCase().trim())) {
      matchedCount++;
    }
  }
  const matchPct = item.skills.length > 0 ? Math.round((matchedCount / item.skills.length) * 100) : 75;

  if (resume) {
    insertMatch.run(
      crypto.randomUUID(),
      jobId,
      resume.id,
      matchPct,
      matchPct,
      85,
      90,
      90,
      95,
      90,
      0.8,
      JSON.stringify({ matchedCount, totalSkills: item.skills.length })
    );
  }
  console.log(`Added: ${item.company} - ${item.title} (Match: ${matchPct}%)`);
}

console.log('Seeding finished successfully.');
