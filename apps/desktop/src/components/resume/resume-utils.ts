import type { ResumeRecord } from "@/lib/api";

export const SAMPLE_LATEX = `\\documentclass[letterpaper,11pt]{article}
\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage{marvosym}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}

\\begin{document}

\\begin{center}
    \\textbf{\\Huge \\scshape Alex Vance} \\\\ \\vspace{1pt}
    \\small +1 (555) 019-2834 $|$ \\href{mailto:alex@example.com}{\\underline{alex@example.com}} $|$
    \\href{https://linkedin.com/in/alex}{\\underline{linkedin.com/in/alex}} $|$
    \\href{https://github.com/alex}{\\underline{github.com/alex}}
\\end{center}

\\section{Technical Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
     \\textbf{Languages}{: TypeScript, JavaScript, Python, Go, SQL, C++} \\\\
     \\textbf{Frameworks}{: Node.js, React, Express, Next.js, FastAPI} \\\\
     \\textbf{Databases & Tools}{: PostgreSQL, SQLite, Redis, Docker, Git, Linux, AWS}
    }}
 \\end{itemize}

\\section{Experience}
  \\resumeSubheading
    {Senior Software Engineer}{Jan 2023 -- Present}
    {CloudScale Systems}{Bengaluru, India}
    \\resumeItemListStart
      \\resumeItem{Architected resilient background crawler processing 200k+ company career pages daily.}
      \\resumeItem{Reduced p99 API query latencies by 42% through optimized SQLite indexing and caching.}
    \\resumeItemListEnd

\\section{Education}
  \\resumeSubheading
    {Indian Institute of Technology}{2018 -- 2022}
    {Bachelor of Technology in Computer Science}{GPA: 8.8/10}

\\end{document}
`;

export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  skills: string[];
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

// parsedJson arrives as a JSON string; skill extraction can leak LaTeX tokens, so drop those.
export function parseResume(raw: string | null | undefined): ParsedResume {
  let data: any = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }
  const skills: unknown[] = Array.isArray(data?.skills) ? data.skills : [];
  const clean = [...new Set(skills.map((s) => String(s).trim()))].filter(
    (s) => s.length > 0 && s.length <= 32 && !/[\\%{}$&]/.test(s) && !/^[-:.,|]+/.test(s)
  );
  return {
    name: str(data?.name),
    email: str(data?.email),
    phone: str(data?.phone),
    linkedin: str(data?.linkedin),
    github: str(data?.github),
    website: str(data?.website),
    skills: clean,
  };
}

export function base64ToPdfBlob(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formatResumeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function pdfFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${slug || "resume"}.pdf`;
}

/** Picks a unique "<name> copy" style name against the existing library. */
export function copyName(name: string, existing: ResumeRecord[]): string {
  const taken = new Set(existing.map((r) => r.name));
  let candidate = `${name} copy`;
  for (let i = 2; taken.has(candidate); i++) candidate = `${name} copy ${i}`;
  return candidate;
}
