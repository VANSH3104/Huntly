const Database = require("./packages/database/node_modules/better-sqlite3");
const path = require("path");
const crypto = require("crypto");

const dbPath = path.resolve(__dirname, "agentforge.db");
const db = new Database(dbPath);

// Fetch user resume skills
const resume = db.prepare("SELECT id, parsed_json FROM resumes WHERE is_active = 1 LIMIT 1").get();
let resumeSkills = new Set();
if (resume && resume.parsed_json) {
  try {
    const parsed = JSON.parse(resume.parsed_json);
    (parsed.skills || []).forEach(s => {
      if (s && !s.startsWith("%")) resumeSkills.add(s.toLowerCase().trim());
    });
  } catch (e) {}
}

const resumeSkillRows = db.prepare("SELECT canonical, skill FROM resume_skills WHERE resume_id = ?").all(resume ? resume.id : "");
resumeSkillRows.forEach(r => {
  if (r.canonical && !r.canonical.startsWith("%")) resumeSkills.add(r.canonical.toLowerCase().trim());
  if (r.skill && !r.skill.startsWith("%")) resumeSkills.add(r.skill.toLowerCase().trim());
});

// Add standard tech synonyms from Vansh Kabra's profile
[
  "typescript", "javascript", "react", "react.js", "next.js", "node.js", "express", "express.js",
  "fastapi", "rest", "api", "mongodb", "redis", "docker", "linux", "git", "rust", "go", "golang",
  "python", "java", "c++", "sql", "postgresql", "grpc", "websockets", "kafka", "apache kafka",
  "ci/cd", "solana", "anchor", "claude", "mcp", "zstandard", "protobuf", "kubernetes", "k8s",
  "html", "css", "ai", "cloud", "algorithms", "debugging", "agentic ai", "distributed systems",
  "microservices"
].forEach(s => resumeSkills.add(s));

const freehireJobs = [
  {
    company: "Plata",
    title: "Software Engineer - Golang Junior / Junior+",
    location: "Worldwide",
    region: "Worldwide",
    workFormat: "Remote",
    grade: "Junior",
    experience: "1+ yrs",
    english: "B1",
    employmentType: "Full-time",
    experienceLevel: "junior",
    sourceUrl: "https://freehire.me/jobs/junior-software-engineer-plata",
    applyUrl: "https://plata.peopleforce.io/careers/v/golang-junior?utm_source=freehire.me",
    source: "Greenhouse",
    ats: "greenhouse",
    domain: "FinTech",
    collection: "Startups",
    companyType: "Startup",
    openDays: 124,
    views: 47,
    applied: 1,
    skills: ["AI", "AWS", "EKS", "Go", "Kafka", "MongoDB", "PostgreSQL", "Redis"],
    summary: "Build and maintain backend services in Go for fintech products like CRM and customer care, collaborating with teams to improve reliability and performance.",
    challenges: [
      "Interactions with cross-functional product and infrastructure teams for successful implementation of payment tasks",
      "Participation in the architecture of backend services and high-resiliency development of a complex transactional system",
      "Profiling memory and latency overheads in high-load microservices written in Go"
    ],
    whatMakesFit: [
      "1+ year of experience in Software Engineering (Golang or modern backend systems)",
      "Excellent proven knowledge of Golang, PostgreSQL, Kafka or messaging middleware",
      "You love automating routine processes, writing unit tests, and designing clean APIs",
      "You have a solid understanding of how the technologies in our tech stack work"
    ],
    whatWeOffer: [
      "100% Remote flexibility with home office stipend",
      "Competitive compensation with stock option participation",
      "Health insurance, wellness allowances, and 28 paid vacation days"
    ]
  },
  {
    company: "Cloudflare",
    title: "Software Engineer, Network Performance & Reliability (Argo)",
    location: "United States",
    region: "Worldwide",
    workFormat: "Hybrid",
    grade: "Mid-Senior",
    experience: "2-5 yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://freehire.me/jobs/software-engineer-network-performance-reliability-cloudflare",
    applyUrl: "https://boards.greenhouse.io/cloudflare/jobs/5910248?utm_source=freehire.me",
    source: "Greenhouse",
    ats: "greenhouse",
    domain: "DevTools",
    collection: "Big Tech",
    companyType: "Public",
    openDays: 123,
    views: 24,
    applied: 3,
    skills: ["AI", "API", "ClickHouse", "C++", "Distributed Systems", "Rust", "Go", "Linux", "Kubernetes", "gRPC", "Docker", "Git", "CI/CD", "Protobuf", "Zstandard"],
    summary: "Build and maintain Cloudflare's Argo platform to deliver ultra-reliable, high-performance network connectivity for products like CDN, Workers, and Magic Transit using Rust, Go, and Linux networking.",
    challenges: [
      "Architect smart routing algorithms that shave off milliseconds across global Internet transit routes",
      "Scale high-throughput telemetry pipelines that process terabytes of metric data per minute in ClickHouse and Rust",
      "Diagnose complex TCP/UDP performance degradation under packet loss and route jitter"
    ],
    whatMakesFit: [
      "Deep understanding of Linux networking stack, sockets, and systems programming in Rust or C++ or Go",
      "Experience with high-throughput distributed systems, serialization with Protobuf, and compression with Zstandard",
      "Curiosity about internet topology, BGP, anycast, and network reliability"
    ],
    whatWeOffer: [
      "Competitive salary, generous RSU equity grant, comprehensive healthcare, 401(k) match",
      "H-1B visa sponsorship support history",
      "Freedom to innovate and ship code that powers 20% of the world's web traffic"
    ]
  },
  {
    company: "Displate",
    title: "Junior Software Engineer",
    location: "Warsaw, Poland",
    region: "Europe",
    workFormat: "Hybrid",
    grade: "Junior",
    experience: "1-2 yrs",
    english: "B2",
    employmentType: "Full-time",
    experienceLevel: "junior",
    sourceUrl: "https://freehire.me/jobs/junior-software-engineer-displate-ox2i7nz7",
    applyUrl: "https://displate.peopleforce.io/careers/v/246434-junior-software-engineer?utm_source=freehire.me",
    source: "Peopleforce",
    ats: "peopleforce",
    domain: "E-commerce",
    collection: "European Startups",
    companyType: "Product",
    openDays: 3,
    views: 68,
    applied: 5,
    skills: ["AI", "API", "AWS", "Claude Code", "E-commerce", "TypeScript", "Node.js", "React", "Docker", "Git", "PostgreSQL", "Redis", "Kafka", "Linux"],
    summary: "We are looking for a Junior Software Engineer to join our Engineering Team, grow with us, and help shape what we build next. At Displate, you won't spend months on internal tools nobody uses. You'll ship features for a platform serving millions of customers.",
    challenges: [
      "Building high-conversion features for a global marketplace visited by millions of art collectors",
      "Modernizing legacy services into resilient TypeScript/Node.js microservices with Redis caching",
      "Integrating cutting-edge AI assisted developer workflows and Claude Code automation"
    ],
    whatMakesFit: [
      "Strong foundation in TypeScript, Node.js, and modern frontend frameworks like React",
      "Hands-on experience with RESTful APIs, relational databases (PostgreSQL), and Docker",
      "Proactive communicator who loves shipping to production frequently"
    ],
    whatWeOffer: [
      "Modern office in central Warsaw with hybrid flexibility",
      "Hardware of your choice (MacBook Pro M-series)",
      "Learning budget, conference passes, and team hackathons"
    ]
  },
  {
    company: "Adamantine Recruitment",
    title: "Software Engineer",
    location: "Dublin, Ireland",
    region: "Europe",
    workFormat: "Remote",
    grade: "Mid",
    experience: "2-4 yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://freehire.me/jobs/software-engineer-adamantine-recruitment-ryv5lnit",
    applyUrl: "https://ie.whatjobs.com/pub_api__cpl__5895754__7127?utm_source=freehire.me",
    source: "Whatjobs",
    ats: "whatjobs",
    domain: "AI",
    collection: "AI-Native",
    companyType: "Startup",
    openDays: 1,
    views: 52,
    applied: 2,
    skills: ["Agentic AI", "AI", "API", "React", "TypeScript", "Node.js", "Python", "FastAPI", "Docker", "Git", "PostgreSQL"],
    summary: "Full Stack Engineer | React/Node | Dublin | 2-4 yrs. You'll be among some of the first engineers here. A small AI startup building autonomous agents that do real, measurable work inside enterprise businesses - not just wrappers.",
    challenges: [
      "Designing multi-agent execution graphs with resilient tool-calling interfaces and MCP servers",
      "Building slick, low-latency UI interfaces in React/TypeScript with real-time streaming state",
      "Hardening backend workers with retry mechanisms, sandbox isolation, and database durability"
    ],
    whatMakesFit: [
      "2-4 years of experience shipping production web applications in React and Node.js or Python",
      "Experience or deep passion for Agentic AI, LLM tool integration, and prompt engineering",
      "Autonomous problem solver comfortable working in a fast-paced zero-to-one team"
    ],
    whatWeOffer: [
      "Competitive salary €75,000 - €95,000 with significant early equity",
      "Remote-first work culture across Europe and UK",
      "Direct mentorship from founding engineers from DeepMind and Stripe alumni"
    ]
  },
  {
    company: "SecurityBoat",
    title: "Software Developer Intern",
    location: "Pune, India",
    region: "APAC",
    workFormat: "On-site",
    grade: "Intern",
    experience: "Fresher",
    english: "Conversational",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://securityboat.zohorecruit.in/jobs/Careers/158752000004481190?utm_source=freehire.me",
    applyUrl: "https://securityboat.zohorecruit.in/jobs/Careers/158752000004481190?utm_source=freehire.me",
    source: "Zoho Recruit",
    ats: "zoho recruit",
    domain: "Cybersecurity",
    collection: "Indian Roots",
    companyType: "Startup",
    openDays: 2,
    views: 89,
    applied: 12,
    skills: ["API", "Azure", "Cloud", "CSS", "HTML", "JavaScript", "React.js", "Next.js", "Node.js", "Express.js", "MongoDB", "REST", "Git", "TypeScript", "Linux"],
    summary: "SecurityBoat is hiring a fresher Software Developer Intern in Pune to work on real-world web applications and cybersecurity solutions across the full stack: frontend, backend, databases, and cloud deployment.",
    challenges: [
      "Developing secure web dashboards for automated penetration testing and threat intelligence feeds",
      "Writing RESTful endpoints in Node.js/Express with MongoDB and TypeScript",
      "Implementing responsive React components and state management with high accessibility"
    ],
    whatMakesFit: [
      "Solid knowledge of JavaScript/TypeScript, React, Node.js, Express, and HTML/CSS",
      "Familiarity with Git, REST principles, and Linux command line",
      "Eager to learn cybersecurity concepts, vulnerability scanning, and cloud architectures"
    ],
    whatWeOffer: [
      "Hands-on mentorship from senior security consultants and engineers",
      "Pre-Placement Offer (PPO) opportunities based on performance",
      "Certificate of Internship and stipend"
    ]
  },
  {
    company: "Turtle Trax S.A.",
    title: "Lead Software Engineer",
    location: "Mexico City, Mexico",
    region: "LATAM",
    workFormat: "Remote",
    grade: "Lead",
    experience: "5+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "lead",
    sourceUrl: "https://freehire.me/jobs/lead-software-engineer-turtle-trax-s-a-agnab7ef",
    applyUrl: "https://es-mx.whatjobs.com/pub_api__cpl__256057017__7108?utm_source=freehire.me",
    source: "Whatjobs",
    ats: "whatjobs",
    domain: "FinTech",
    collection: "Startups",
    companyType: "Startup",
    openDays: 4,
    views: 38,
    applied: 1,
    skills: ["Agentic AI", "AI", "API", "Automation", "AWS", "Java", "Python", "React", "TypeScript", "Docker", "Kubernetes", "CI/CD", "SQL", "Redis", "Kafka", "Linux"],
    summary: "Must-Have: Strong hands-on programming expertise in Java and Python, with ability to design, build, test, and optimise production-grade backend services. Strong experience with React for building modern, responsive interfaces.",
    challenges: [
      "Leading technical decisions across backend architectures and frontend user journeys",
      "Deploying scalable AI agents for automated operations in financial workflow processing",
      "Mentoring engineers and enforcing automated CI/CD and unit testing standards"
    ],
    whatMakesFit: [
      "5+ years building and scaling cloud applications on AWS or GCP",
      "Polyglot fluency in Python, Java or TypeScript",
      "Strong track record designing relational databases and event queues (Kafka / Redis)"
    ],
    whatWeOffer: [
      "USD-pegged compensation with performance bonuses",
      "100% remote anywhere in the Americas with flexible working hours",
      "Comprehensive healthcare and equipment stipend"
    ]
  },
  {
    company: "Commonwealth Bank",
    title: "Senior Engineering Manager, Payments Tech & Data Platforms",
    location: "Sydney, Australia",
    region: "APAC",
    workFormat: "Hybrid",
    grade: "Senior",
    experience: "8+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://freehire.me/jobs/senior-engineering-manager-payments-tech-data-platforms-commonwealth-bank-norlfp54",
    applyUrl: "https://www.adzuna.com.au/details/5934082493?utm_source=freehire.me",
    source: "Adzuna",
    ats: "adzuna",
    domain: "FinTech",
    collection: "Fortune 500",
    companyType: "Enterprise",
    openDays: 6,
    views: 95,
    applied: 4,
    skills: ["AI", "Cloud", "Cloud Native", "Event Driven Architecture", "Kafka", "Distributed Systems", "Java", "Microservices", "Kubernetes", "SQL"],
    summary: "Commonwealth Bank's Payments Data Feeds & Reporting team is seeking a Senior Engineering Manager to lead engineering across multiple squads in Sydney or Melbourne. You'll shape technical strategy and uplift platforms.",
    challenges: [
      "Managing high-criticality payment data streams handling tens of millions of transactions daily",
      "Transitioning monolithic reporting infrastructure to Event-Driven Cloud Native pipelines",
      "Fostering engineering excellence, high uptime (99.999%), and rigorous audit standards"
    ],
    whatMakesFit: [
      "Demonstrated engineering leadership across multi-squad software organizations",
      "Deep knowledge of distributed event-driven systems, Apache Kafka, and Cloud Native stacks",
      "Strong communication skills and passion for developing engineering talent"
    ],
    whatWeOffer: [
      "Industry-leading remuneration package + superannuation + executive bonus",
      "Flexible hybrid working arrangements in modern Sydney/Melbourne tech hubs",
      "Career mobility across the largest financial institution in Australia"
    ]
  },
  {
    company: "PlayStation",
    title: "Engineering Manager, Enterprise Data Platforms",
    location: "Dublin, Ireland",
    region: "Europe",
    workFormat: "Hybrid",
    grade: "Senior",
    experience: "7+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://freehire.me/jobs/engineering-manager-enterprise-data-platforms-playstation-blm6teuw",
    applyUrl: "https://ie.whatjobs.com/pub_api__cpl__6192329__7127?utm_source=freehire.me",
    source: "Workday",
    ats: "workday",
    domain: "GameDev",
    collection: "Big Tech",
    companyType: "Public",
    openDays: 8,
    views: 110,
    applied: 6,
    skills: ["Data Quality", "Databricks", "dbt", "PySpark", "Snowflake", "Python", "SQL", "Cloud", "AWS"],
    summary: "Sony Interactive Entertainment in Dublin seeks an Engineering Manager to lead a team of Enterprise Data Engineers delivering scalable data capabilities across SIE. You will drive delivery and technical direction.",
    challenges: [
      "Leading data engineering squads delivering enterprise analytical warehouses and real-time feeds",
      "Orchestrating petabyte-scale data lakes with Snowflake, Databricks, and dbt",
      "Ensuring compliance with global privacy regulations (GDPR, CCPA) across player data"
    ],
    whatMakesFit: [
      "Extensive experience leading data engineering teams in modern cloud environments",
      "Expertise in Snowflake, Databricks, PySpark, dbt, and modern data quality frameworks",
      "Passion for gaming and creating delightful experiences for global gamers"
    ],
    whatWeOffer: [
      "PlayStation games and console perks + generous employee discounts",
      "Competitive base salary, annual bonus, and pension scheme",
      "State-of-the-art office in Dublin docklands with gym and recreation areas"
    ]
  },
  {
    company: "Anson Mccade",
    title: "Software Engineer C++",
    location: "London, United Kingdom",
    region: "UK",
    workFormat: "Hybrid",
    grade: "Mid",
    experience: "2-5 yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://freehire.me/jobs/software-engineer-c-anson-mccade-wrk5yfol",
    applyUrl: "https://www.adzuna.co.uk/jobs/details/5934126537?utm_source=freehire.me",
    source: "Adzuna",
    ats: "adzuna",
    domain: "FinTech",
    collection: "Startups",
    companyType: "Product",
    openDays: 1,
    views: 41,
    applied: 2,
    skills: ["Cloud", "C++", "Linux", "Network Security", "Python", "Git", "Algorithms", "Docker"],
    summary: "Requirements: Around 2-5 years experience in software engineering. Experience with modern C++ and the Standard Library, Linux networking, low latency systems, and Python scripting.",
    challenges: [
      "Optimizing memory layouts, lock-free queues, and cache locality for microsecond latency",
      "Building robust networking daemons communicating over kernel-bypass sockets",
      "Integrating continuous automated testing pipelines on Linux container hosts"
    ],
    whatMakesFit: [
      "Hands-on modern C++ (C++17/20), Standard Library, and algorithms",
      "Good command of Linux environments, debugging with GDB/Valgrind, and Python",
      "Interest in low-latency systems and financial data protocols"
    ],
    whatWeOffer: [
      "Salary £75,000 - £90,000 per year + performance bonus",
      "Hybrid work in central London with free catered lunches",
      "Generous pension contribution and private healthcare"
    ]
  },
  {
    company: "The Giant Bullseye",
    title: "Senior Node.js Developer",
    location: "New York, United States",
    region: "North America",
    workFormat: "Remote",
    grade: "Senior",
    experience: "4+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://freehire.me/jobs/senior-node-js-developer-the-giant-bullseye-5ecgahrn",
    applyUrl: "https://www.whatjobs.com/pub_api__cpl__3179664432__7065?utm_source=freehire.me",
    source: "Whatjobs",
    ats: "whatjobs",
    domain: "Cybersecurity",
    collection: "Startups",
    companyType: "Product",
    openDays: 3,
    views: 63,
    applied: 3,
    skills: ["API", "Api Security", "Automation", "AWS", "CI/CD", "Node.js", "TypeScript", "Express", "MongoDB", "PostgreSQL", "Redis", "Docker", "Linux"],
    summary: "Overview: We are seeking a Senior Node.js Developer to lead backend development for security and vulnerability remediation programs. The ideal candidate has strong Node.js expertise and API security knowledge.",
    challenges: [
      "Architecting secure backend services with OAuth2, JWT, and fine-grained role-based access control",
      "Scanning and remediating API vulnerabilities across distributed endpoints",
      "Implementing resilient event streaming and caching with Redis and PostgreSQL"
    ],
    whatMakesFit: [
      "Deep expertise with Node.js, TypeScript, Express/Fastify, and microservices design",
      "Practical experience with OWASP Top 10 API Security, cryptographic primitives, and AWS",
      "Experience writing robust unit, integration, and fuzz testing suites"
    ],
    whatWeOffer: [
      "Salary $140,000 - $175,000 USD with comprehensive benefits",
      "100% remote flexibility with quarterly team retreats",
      "Unlimited PTO and home office tech setup allowance"
    ]
  },
  {
    company: "Ashby",
    title: "Senior Backend Engineer (Distributed Systems)",
    location: "Worldwide",
    region: "Worldwide",
    workFormat: "Remote",
    grade: "Senior",
    experience: "4+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://jobs.ashbyhq.com/ashby/backend",
    applyUrl: "https://jobs.ashbyhq.com/ashby/backend?utm_source=freehire.me",
    source: "Ashby",
    ats: "ashby",
    domain: "HRTech",
    collection: "Unicorns",
    companyType: "Product",
    openDays: 5,
    views: 142,
    applied: 8,
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Redis", "Kafka", "AWS", "Kubernetes", "Distributed Systems", "GraphQL", "Docker", "Linux", "Git"],
    summary: "Ashby is building the all-in-one recruiting platform for high-growth tech companies. We are hiring a Senior Backend Engineer to design high-throughput data sync engines and transactional Postgres backends.",
    challenges: [
      "Handling thousands of concurrent recruiter workflows and high-volume applicant syncs without downtime",
      "Designing resilient background job pipelines with rate limits across hundreds of third-party HR integrations",
      "Optimizing complex SQL queries over multi-tenant PostgreSQL databases with millions of rows"
    ],
    whatMakesFit: [
      "Excellence in TypeScript and Node.js with strong computer science foundations",
      "Proven track record with relational databases, transaction isolation, and database migrations",
      "Obsession with performance, correctness, and clean developer APIs"
    ],
    whatWeOffer: [
      "Top-of-market compensation: $160,000 - $210,000 USD + generous equity",
      "Fully remote work from anywhere in the world",
      "Annual team offsites in Europe, Americas, and Asia"
    ]
  },
  {
    company: "Anthropic",
    title: "Full Stack Engineer, Agent Tooling & MCP",
    location: "San Francisco, CA",
    region: "North America",
    workFormat: "Hybrid",
    grade: "Mid-Senior",
    experience: "3+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://boards.greenhouse.io/anthropic/jobs/mcp-tooling",
    applyUrl: "https://boards.greenhouse.io/anthropic/jobs/mcp-tooling?utm_source=freehire.me",
    source: "Greenhouse",
    ats: "greenhouse",
    domain: "AI",
    collection: "AI Companies",
    companyType: "Startup",
    openDays: 2,
    views: 320,
    applied: 19,
    skills: ["TypeScript", "Python", "React", "Claude", "MCP", "Node.js", "FastAPI", "PostgreSQL", "Docker", "Linux", "Git", "API", "AI", "Agentic AI"],
    summary: "Join the team expanding the capabilities of Claude and autonomous AI agents. Build state-of-the-art Model Context Protocol (MCP) servers, agent evaluation harnesses, and interactive developer interfaces.",
    challenges: [
      "Extending open-source MCP specs and high-performance stdio / SSE transport protocols",
      "Constructing human-in-the-loop developer interfaces for real-time agent verification and telemetry",
      "Benchmarking agent execution speed, error rates, and security boundaries across developer tool integrations"
    ],
    whatMakesFit: [
      "Strong skills in TypeScript, React, and Python (FastAPI/asyncio)",
      "Deep interest in agent tool protocols, Claude Code, and agentic workflows",
      "Passion for building reliable, beautiful developer tools"
    ],
    whatWeOffer: [
      "Top-tier compensation $190,000 - $260,000 USD + equity in frontier AI research company",
      "Daily gourmet meals, wellness stipends, and commuter benefits",
      "Opportunity to shape the next era of human-AI collaboration"
    ]
  },
  {
    company: "Deale",
    title: "Software Developer Intern",
    location: "Barcelona, Spain",
    region: "Europe",
    workFormat: "Hybrid",
    grade: "Intern",
    experience: "Fresher",
    english: "B2",
    employmentType: "Internship",
    experienceLevel: "intern",
    sourceUrl: "https://deale.factorial.es",
    applyUrl: "https://deale.factorial.es?utm_source=freehire.me",
    source: "Factorial",
    ats: "factorial",
    domain: "FinTech",
    collection: "European Startups",
    companyType: "Startup",
    openDays: 14,
    views: 74,
    applied: 9,
    skills: ["Agile", "AWS", "Claude Code", "Confluence", "CSS", "HTML", "JavaScript", "React", "Next.js", "Python", "REST", "Git", "TypeScript", "Node.js", "SQL", "Docker", "FastAPI", "API", "PostgreSQL", "Linux"],
    summary: "Deale, a Barcelona/New York startup running the leading M&A marketplace for SMEs, is hiring a Software Developer Intern to build and maintain the app's frontend and backend using React/Next.js and Python.",
    challenges: [
      "Developing key user onboarding workflows for investors and business sellers",
      "Building high-performance Next.js server components with responsive UI",
      "Integrating automated valuation calculations with Python and PostgreSQL"
    ],
    whatMakesFit: [
      "Solid understanding of React, Next.js, and TypeScript",
      "Familiarity with Python backends (FastAPI or Django) and relational databases",
      "Enthusiasm for building startups and learning modern full-stack best practices"
    ],
    whatWeOffer: [
      "Direct mentorship from tech founders and lead architects",
      "Opportunity to transition into a permanent full-time Junior Software Engineer role",
      "Vibrant Barcelona tech office with terrace and hybrid schedule"
    ]
  },
  {
    company: "FBI & TMT",
    title: "ServiceNow Developer",
    location: "London, United Kingdom",
    region: "UK",
    workFormat: "Hybrid",
    grade: "Senior",
    experience: "4+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://freehire.me/jobs/servicenow-developer-fbi-tmt-sfo44acl",
    applyUrl: "https://www.adzuna.co.uk/jobs/details/5934126534?utm_source=freehire.me",
    source: "Adzuna",
    ats: "adzuna",
    domain: "GovTech",
    collection: "Enterprise",
    companyType: "Government",
    openDays: 1,
    views: 29,
    applied: 1,
    skills: ["Angular", "CSS", "HTML", "JavaScript", "ServiceNow", "REST", "Git"],
    summary: "Salary: £100,000 per year. Requirements: Proven track record delivering ServiceNow portal solutions in complex enterprise environments. Strong experience focused on portal development, custom widgets, and REST integrations.",
    challenges: [
      "Delivering high-security citizen and employee service portals with high accessibility standards",
      "Designing custom ServiceNow widgets using AngularJS, HTML5, and CSS",
      "Integrating external enterprise APIs with secure authentication handshakes"
    ],
    whatMakesFit: [
      "Demonstrated experience in ServiceNow development and certified implementation",
      "Strong JavaScript, HTML, and CSS fundamentals",
      "SC or DV clearance readiness for UK public sector environments"
    ],
    whatWeOffer: [
      "High compensation £100,000 per annum",
      "Prestigious public sector digital transformation initiative",
      "Generous holiday allowance and pension"
    ]
  },
  {
    company: "Dkatalis Labs",
    title: "Software Engineer",
    location: "Jakarta, Indonesia",
    region: "APAC",
    workFormat: "On-site",
    grade: "Mid",
    experience: "2-4 yrs",
    english: "Conversational",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://freehire.me/jobs/software-engineer-dkatalis-labs-oi3bntxc",
    applyUrl: "https://id.jobstreet.com/job/95358084?utm_source=freehire.me",
    source: "Jobstreet",
    ats: "jobstreet",
    domain: "FinTech",
    collection: "Unicorns",
    companyType: "Product",
    openDays: 7,
    views: 65,
    applied: 4,
    skills: ["Agile", "API", "Automation", "CI/CD", "Flutter", "Go", "Java", "Microservices", "Docker", "Kubernetes", "PostgreSQL", "Git"],
    summary: "About DKatalis: We are a financial technology company with multiple offices in the APAC region. In our quest to build a better financial world, our key goal is to create an ecosystem-linked financial lifestyle experience.",
    challenges: [
      "Engineering resilient microservices handling high concurrency digital banking transactions",
      "Building mobile and web frontend integrations using Flutter and modern web APIs",
      "Maintaining 99.99% availability with automated CI/CD pipelines on Kubernetes"
    ],
    whatMakesFit: [
      "Good command of backend languages like Go or Java, and relational databases like PostgreSQL",
      "Hands-on experience with Docker, Kubernetes, and automated testing",
      "Collaborative mindset in an Agile sprint-based engineering culture"
    ],
    whatWeOffer: [
      "Competitive APAC compensation with annual performance bonus",
      "Comprehensive medical, optical, and dental coverage",
      "Tech allowances and continuous learning sponsorships"
    ]
  },
  {
    company: "Noir",
    title: ".NET Developer - Cowes",
    location: "Cowes, United Kingdom",
    region: "UK",
    workFormat: "Hybrid",
    grade: "Mid",
    experience: "2-5 yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "mid",
    sourceUrl: "https://freehire.me/jobs/net-developer-cowes-noir-dsrekaxz",
    applyUrl: "https://www.adzuna.co.uk/jobs/details/5934122331?utm_source=freehire.me",
    source: "Adzuna",
    ats: "adzuna",
    domain: "Media",
    collection: "Startups",
    companyType: "Product",
    openDays: 2,
    views: 34,
    applied: 2,
    skills: ["Agile", "Azure", "Azure DevOps", "CI/CD", "C#", ".NET", "ASP.NET Core", "HTML", "CSS", "SQL"],
    summary: ".NET Developer - Global Sports Company - Cowes, Isle of Wight. Tech stack: .NET Developer, .NET 10.0, ASP.NET Core, C# 14, .NET Aspire, CI/CD, Azure DevOps, EF Core 10.0, Agile, HTML Living Standard, CSS.",
    challenges: [
      "Developing high-speed streaming dashboards for live global sporting event analytics",
      "Leveraging modern .NET 10.0 and C# 14 features to optimize computational throughput",
      "Automating Azure cloud deployments with Azure DevOps and CI/CD pipelines"
    ],
    whatMakesFit: [
      "Solid experience in C#, ASP.NET Core, and Microsoft Azure ecosystem",
      "Familiarity with Entity Framework, SQL databases, and web technologies",
      "Passion for sports technology and high-impact digital experiences"
    ],
    whatWeOffer: [
      "Competitive salary £55,000 - £70,000 per annum",
      "Beautiful coastal office location with hybrid remote options",
      "VIP tickets to international sporting championships and events"
    ]
  },
  {
    company: "Rippling",
    title: "Staff Full Stack Engineer - Workflow Automations",
    location: "Bengaluru, India",
    region: "APAC",
    workFormat: "Hybrid",
    grade: "Staff",
    experience: "6+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "staff",
    sourceUrl: "https://www.rippling.com/careers",
    applyUrl: "https://www.rippling.com/careers?utm_source=freehire.me",
    source: "Rippling",
    ats: "rippling",
    domain: "HRTech",
    collection: "Unicorns",
    companyType: "Product",
    openDays: 10,
    views: 240,
    applied: 11,
    skills: ["Python", "React", "TypeScript", "Django", "PostgreSQL", "Redis", "AWS", "Docker", "Kubernetes", "Microservices", "CI/CD", "Git", "API"],
    summary: "Rippling manages payroll, HR, benefits, devices, and software in one integrated system. As a Staff Engineer on Workflow Automations, you will lead the core engine that executes millions of business actions across companies.",
    challenges: [
      "Architecting distributed execution engines with exactly-once delivery guarantees",
      "Scaling complex interactive rule builders in React and TypeScript with deep drag-and-drop ergonomics",
      "Mentoring senior engineers and defining architectural standards across multiple squads"
    ],
    whatMakesFit: [
      "6+ years building large-scale web applications in Python (Django) and React/TypeScript",
      "Proven ability to lead technical strategy, drive consensus, and execute on zero-downtime initiatives",
      "Strong background in distributed transactions, Postgres tuning, and asynchronous job processing"
    ],
    whatWeOffer: [
      "Top-tier compensation 60 - 85 LPA + significant pre-IPO equity grant",
      "Premium private health insurance for family",
      "Top-of-the-line Apple workstation and equipment budget"
    ]
  },
  {
    company: "Coinbase",
    title: "Protocol Engineer - Solana / High Performance L1",
    location: "Remote, United States",
    region: "North America",
    workFormat: "Remote",
    grade: "Senior",
    experience: "4+ yrs",
    english: "Fluent",
    employmentType: "Full-time",
    experienceLevel: "senior",
    sourceUrl: "https://www.coinbase.com/careers",
    applyUrl: "https://boards.greenhouse.io/coinbase/jobs/solana-protocol?utm_source=freehire.me",
    source: "Greenhouse",
    ats: "greenhouse",
    domain: "Crypto",
    collection: "Big Tech",
    companyType: "Public",
    openDays: 6,
    views: 180,
    applied: 8,
    skills: ["Rust", "Solana", "Anchor", "Blockchain", "Cryptography", "C++", "Go", "Distributed Systems", "Linux", "Git", "Docker"],
    summary: "Help build the future of decentralized finance and web3 protocols at Coinbase. We are hiring a Protocol Engineer to build on-chain smart contracts in Rust and optimize node synchronization for Solana.",
    challenges: [
      "Writing ultra-efficient Anchor smart contracts in Rust with rigorous formal verification and zero security compromises",
      "Optimizing validator transaction gossip, RPC node parsing, and fee market routing",
      "Interfacing decentralized protocols with high-throughput custodial exchange pipelines"
    ],
    whatMakesFit: [
      "Production experience writing Rust and on-chain programs on Solana (Anchor)",
      "Strong grasp of cryptography, consensus algorithms, and distributed ledger fundamentals",
      "Passion for open-source protocol development and security auditing"
    ],
    whatWeOffer: [
      "Salary $175,000 - $225,000 USD + equity package + crypto performance bonuses",
      "100% remote work policy with flexible schedules",
      "Comprehensive global healthcare and wellness coverage"
    ]
  }
];

const insertCompany = db.prepare(`
  INSERT INTO companies (id, name, domain, industry, company_type, ats, first_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, unixepoch('now') * 1000)
  ON CONFLICT(domain) DO UPDATE SET
    name = excluded.name,
    industry = excluded.industry,
    company_type = excluded.company_type,
    ats = excluded.ats
`);

const insertJob = db.prepare(`
  INSERT INTO jobs (
    id, company_id, title, normalized_title, location_json, skills,
    description, responsibilities, requirements, experience_level,
    employment_type, source_url, apply_url, source_type, ats,
    status, posted_at, first_seen_at, last_verified_at, content_hash
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    skills = excluded.skills,
    description = excluded.description,
    responsibilities = excluded.responsibilities,
    requirements = excluded.requirements,
    location_json = excluded.location_json,
    apply_url = excluded.apply_url,
    ats = excluded.ats,
    source_type = excluded.source_type
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

console.log("Seeding rich Freehire & Multi-Source jobs...");

let addedCount = 0;
for (const item of freehireJobs) {
  const companyDomain = item.company.toLowerCase().replace(/[^a-z0-9]/g, "") + ".com";
  let existingCompany = db.prepare("SELECT id FROM companies WHERE domain = ?").get(companyDomain);
  let companyId = existingCompany ? existingCompany.id : crypto.randomUUID();

  insertCompany.run(
    companyId,
    item.company,
    companyDomain,
    item.domain,
    item.companyType,
    item.ats
  );

  const jobId = "freehire-" + item.company.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + item.title.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);

  const locationObj = {
    city: item.location,
    country: item.region,
    region: item.region,
    workplaceType: item.workFormat.toLowerCase(),
    remote: item.workFormat === "Remote",
    isRemote: item.workFormat === "Remote",
    grade: item.grade,
    experience: item.experience,
    english: item.english,
    domain: item.domain,
    collection: item.collection,
    views: item.views,
    applied: item.applied,
    openDays: item.openDays,
    sourceName: item.source
  };

  const now = Date.now();
  const postedAt = now - (item.openDays * 86400000);

  const fullDescription = `${item.summary}\n\n### Challenges that await you:\n${item.challenges.map(c => "- " + c).join("\n")}\n\n### What makes you a great fit:\n${item.whatMakesFit.map(f => "- " + f).join("\n")}\n\n### What we offer:\n${item.whatWeOffer.map(o => "- " + o).join("\n")}`;

  const contentHash = crypto.createHash("sha256").update(jobId + fullDescription).digest("hex");

  insertJob.run(
    jobId,
    companyId,
    item.title,
    item.title.toLowerCase(),
    JSON.stringify(locationObj),
    JSON.stringify(item.skills),
    fullDescription,
    JSON.stringify(item.challenges),
    JSON.stringify(item.whatMakesFit),
    item.experienceLevel,
    item.employmentType,
    item.sourceUrl,
    item.applyUrl,
    item.source.toLowerCase().replace(/\s+/g, "_"),
    item.ats,
    postedAt,
    postedAt,
    now,
    contentHash
  );

  // Compute skill matches against Vansh Kabra's resume
  let matchedSkills = [];
  let missingSkills = [];
  for (const s of item.skills) {
    const sNorm = s.toLowerCase().trim();
    if (resumeSkills.has(sNorm)) {
      matchedSkills.push(s);
    } else {
      missingSkills.push(s);
    }
  }

  const matchPct = item.skills.length > 0
    ? Math.round((matchedSkills.length / item.skills.length) * 100)
    : 75;

  if (resume) {
    insertMatch.run(
      crypto.randomUUID(),
      jobId,
      resume.id,
      matchPct,
      matchPct,
      88,
      90,
      90,
      95,
      90,
      0.9,
      JSON.stringify({
        matchedCount: matchedSkills.length,
        totalSkills: item.skills.length,
        youHave: matchedSkills,
        missing: missingSkills
      })
    );
  }

  addedCount++;
  console.log(`[+] Seeded: ${item.company} - ${item.title} (${matchedSkills.length}/${item.skills.length} skills matched = ${matchPct}%)`);
}

console.log(`Successfully seeded ${addedCount} jobs from Freehire across multiple sources!`);
