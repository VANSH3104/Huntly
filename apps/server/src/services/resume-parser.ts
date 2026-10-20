import type { ParsedResume } from "@huntly/shared";

/**
 * Parses a LaTeX resume into a structured ParsedResume object.
 * Uses regex-based extraction — no external compilation required.
 */
export class ResumeParser {
  async parse(latex: string): Promise<ParsedResume> {
    const clean = stripLatexCommands(latex);

    return {
      name: extractName(latex),
      email: extractEmail(latex),
      phone: extractPhone(latex),
      linkedin: extractLinkedIn(latex),
      github: extractGitHub(latex),
      website: extractWebsite(latex),
      education: extractEducation(clean),
      experience: extractExperience(clean),
      projects: extractProjects(clean),
      skills: extractSkills(latex),
      certifications: extractCertifications(clean),
    };
  }
}

// ─── Helper Functions ────────────────────────────────────────────

function stripLatexCommands(latex: string): string {
  return latex
    .replace(/\\[a-zA-Z]+\*?\{([^}]*)\}/g, "$1")  // \cmd{content} → content
    .replace(/\\[a-zA-Z]+\*?\s*/g, " ")             // \cmd → space
    .replace(/[{}]/g, " ")                           // braces
    .replace(/%.*$/gm, "")                           // comments
    .replace(/\s+/g, " ")                            // normalize whitespace
    .trim();
}

function extractName(latex: string): string | undefined {
  // Common patterns: \name{First Last}, \author{Name}, title with name
  const patterns = [
    /\\name\{([^}]+)\}/i,
    /\\author\{([^}]+)\}/i,
    /\\textbf\{([A-Z][a-z]+ [A-Z][a-z]+)\}/,
    /\\Huge\s*\\textbf\{([^}]+)\}/,
    /\\LARGE\s*\{?([A-Z][a-z]+ [A-Z][a-z]+)\}?/,
  ];

  for (const pat of patterns) {
    const m = latex.match(pat);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function extractEmail(latex: string): string | undefined {
  const m = latex.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m?.[0];
}

function extractPhone(latex: string): string | undefined {
  const m = latex.match(/(?:\+?1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+91[\s-]?)?\d{10}/);
  return m?.[0];
}

function extractLinkedIn(latex: string): string | undefined {
  const m = latex.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  return m ? `https://linkedin.com/in/${m[1]}` : undefined;
}

function extractGitHub(latex: string): string | undefined {
  const m = latex.match(/github\.com\/([a-zA-Z0-9_-]+)/i);
  return m ? `https://github.com/${m[1]}` : undefined;
}

function extractWebsite(latex: string): string | undefined {
  const m = latex.match(/https?:\/\/(?!linkedin|github)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s}]*/i);
  return m?.[0];
}

function extractSkills(latex: string): string[] {
  const skills: string[] = [];

  // Look for skills section
  const skillsSection = latex.match(/(?:skills?|technologies?|tech stack)[^\n]*\n([\s\S]*?)(?:\\section|\\resumeSection|$)/i);
  if (skillsSection?.[1]) {
    const raw = skillsSection[1];
    // Extract comma-separated or slash-separated items
    const items = raw
      .replace(/\\[a-zA-Z]+\{?([^}]*)\}?/g, "$1")
      .replace(/[{}]/g, "")
      .split(/[,|\/\n•·]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 50);
    skills.push(...items);
  }

  // Also look for itemize lists with known tech terms
  const techPattern = /\b(React(?:\.js)?|Vue(?:\.js)?|Angular|Next\.js|TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Node(?:\.js)?|Express|PostgreSQL|MySQL|MongoDB|Redis|Docker|Kubernetes|AWS|GCP|Azure|Git|Linux|GraphQL|REST|Spring|Django|Flask|FastAPI|TensorFlow|PyTorch|Machine Learning|Deep Learning|Pandas|NumPy|Scikit-learn|HTML|CSS|Sass|Tailwind)\b/gi;
  const techMatches = [...latex.matchAll(techPattern)];
  for (const m of techMatches) {
    if (m[0] && !skills.includes(m[0])) skills.push(m[0]);
  }

  return [...new Set(skills.filter(Boolean))];
}

function extractEducation(cleanText: string): ParsedResume["education"] {
  const education: ParsedResume["education"] = [];

  // Look for common degree patterns
  const degreePatterns = [
    /(?:B\.?Tech|Bachelor|B\.?E\.?|B\.?S\.?|M\.?Tech|M\.?S\.?|Master|Ph\.?D|MBA)[^\n.]*(?:Computer Science|Engineering|Information Technology|Electronics|Electrical|Mechanical|Mathematics|Physics)[^\n.]*/gi,
  ];

  for (const pat of degreePatterns) {
    const matches = [...cleanText.matchAll(pat)];
    for (const m of matches) {
      const text = m[0];
      education.push({
        institution: "Extracted Institution",
        degree: text.trim(),
      });
    }
  }

  return education;
}

function extractExperience(cleanText: string): ParsedResume["experience"] {
  // Basic extraction — look for bullet points under experience section
  return [];
}

function extractProjects(cleanText: string): ParsedResume["projects"] {
  return [];
}

function extractCertifications(cleanText: string): string[] {
  const certs: string[] = [];
  const patterns = [
    /AWS Certified[^,\n]*/gi,
    /Google Cloud[^,\n]*/gi,
    /Azure[^,\n]*Certified[^,\n]*/gi,
    /Certified[^,\n]*Developer[^,\n]*/gi,
  ];
  for (const pat of patterns) {
    const matches = [...cleanText.matchAll(pat)];
    certs.push(...matches.map(m => m[0].trim()));
  }
  return certs;
}
