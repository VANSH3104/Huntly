import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "../components/common/Badge";
import {
  FileText,
  Save,
  CheckCircle,
  Copy,
  Check,
  Code2,
  Sparkles,
  Upload,
  User,
  GraduationCap,
} from "lucide-react";

const SAMPLE_LATEX = `\\documentclass[letterpaper,11pt]{article}
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

export const ResumeStudioView: React.FC = () => {
  const queryClient = useQueryClient();
  const [latexInput, setLatexInput] = useState(SAMPLE_LATEX);
  const [resumeName, setResumeName] = useState("Master Software Engineer Resume");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: activeResume, isLoading } = useQuery({
    queryKey: ["resume", "active"],
    queryFn: async () => {
      try {
        const res = await api.resumes.getActive();
        if (res?.latex) {
          setLatexInput(res.latex);
          if (res.name) setResumeName(res.name);
        }
        return res;
      } catch {
        return null;
      }
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      return api.resumes.create({
        name: resumeName,
        latex: latexInput,
        makeActive: true,
      });
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      queryClient.invalidateQueries({ queryKey: ["resume"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const copyLatex = () => {
    navigator.clipboard.writeText(latexInput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parsedJson = activeResume?.parsedJson || {
    name: "Alex Vance",
    email: "alex@example.com",
    skills: ["TypeScript", "Node.js", "React", "Python", "Go", "SQL", "PostgreSQL", "Docker", "AWS", "SQLite"],
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700 }}>Resume Intelligence Studio</h2>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Your master LaTeX resume serves as the ground truth for skill extraction and job matching.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {saveSuccess && (
            <span style={{ fontSize: "12px", color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: "4px" }}>
              <CheckCircle size={14} /> Saved & Active!
            </span>
          )}
          <button className="btn btn-secondary" onClick={copyLatex}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Copied" : "Copy LaTeX"}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save size={14} />
            <span>{saveMutation.isPending ? "Saving..." : "Save & Recompute Matches"}</span>
          </button>
        </div>
      </div>

      {/* Two Column Layout: Structured Profile vs LaTeX Editor */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "24px" }}>
        {/* Left: Extracted Ground Truth */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Identity & Status */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(6, 182, 212, 0.15)",
                  border: "1px solid var(--accent-cyan)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <User size={22} color="var(--accent-cyan)" />
              </div>
              <div>
                <h3 style={{ fontSize: "15px", fontWeight: 600 }}>{parsedJson.name || "Candidate"}</h3>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {parsedJson.email || "alex@example.com"}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>RESUME PROFILE</div>
              <input
                type="text"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
          </div>

          {/* Extracted Skills */}
          <div className="glass-panel" style={{ padding: "20px" }}>
            <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <Sparkles size={15} color="var(--accent-cyan)" />
              Extracted Canonical Skills
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {parsedJson.skills?.map((skill: string, i: number) => (
                <span
                  key={i}
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    padding: "4px 10px",
                    backgroundColor: "rgba(6, 182, 212, 0.12)",
                    border: "1px solid rgba(6, 182, 212, 0.3)",
                    borderRadius: "4px",
                    color: "var(--accent-cyan)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
              These skills are automatically indexed and matched against crawl requirements.
            </p>
          </div>
        </div>

        {/* Right: LaTeX Code Editor */}
        <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600 }}>
              <Code2 size={16} color="var(--accent-purple)" />
              LaTeX Source
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Standard .tex template
            </span>
          </div>

          <textarea
            value={latexInput}
            onChange={(e) => setLatexInput(e.target.value)}
            style={{
              width: "100%",
              height: "560px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              lineHeight: 1.5,
              backgroundColor: "var(--bg-input)",
              color: "#e2e8f0",
              padding: "16px",
              resize: "none",
              borderRadius: "var(--radius-md)",
            }}
          />
        </div>
      </div>
    </div>
  );
};
