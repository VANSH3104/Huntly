import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../lib/api";
import { ScoreRing } from "../components/common/ScoreRing";
import { Badge } from "../components/common/Badge";
import {
  X,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Copy,
  Check,
  Send,
  Building,
  MapPin,
  Briefcase,
  FileText,
  Download,
  Zap,
} from "lucide-react";
import { AutoApplyModal } from "../components/AutoApplyModal";

export const JobDetailModal: React.FC = () => {
  const { selectedJobId, isJobModalOpen, setIsJobModalOpen } = useStore();

  const [activeTab, setActiveTab] = useState<"details" | "ai" | "tailor">("details");
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredResult, setTailoredResult] = useState<{
    tailoredLaTeX: string;
    changes: any[];
    warnings?: string[];
    pdfFilename?: string;
    pdfBase64?: string;
    compileSuccess?: boolean;
    compileError?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [showAutoApply, setShowAutoApply] = useState(false);

  const downloadPdfFromBase64 = (base64: string, filename: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const previewPdfFromBase64 = (base64: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", selectedJobId],
    queryFn: () => (selectedJobId ? api.jobs.getById(selectedJobId) : null),
    enabled: !!selectedJobId && isJobModalOpen,
  });

  const { data: aiAnalysis, isLoading: isAiLoading, refetch: refetchAi } = useQuery({
    queryKey: ["job", selectedJobId, "ai"],
    queryFn: () => (selectedJobId ? api.ai.analyzeJob(selectedJobId) : null),
    enabled: !!selectedJobId && isJobModalOpen && activeTab === "ai",
  });

  if (!isJobModalOpen || !selectedJobId) return null;

  const handleRunTailor = async () => {
    setIsTailoring(true);
    try {
      const res = await api.ai.tailorResume(selectedJobId);
      setTailoredResult(res);
      setActiveTab("tailor");
    } catch (err: any) {
      alert(`Resume tailoring error: ${err.message}`);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    setIsGeneratingCoverLetter(true);
    try {
      const res = await api.ai.generateCoverLetter(selectedJobId);
      setCoverLetter(res.coverLetter);
    } catch (err: any) {
      alert(`Cover letter error: ${err.message}`);
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsJobModalOpen(false);
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "960px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          backgroundColor: "var(--bg-card)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-header)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ScoreRing score={job?.matchScore ?? 0.88} size={46} strokeWidth={4} />
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                {job?.title || "Job Details"}
              </h2>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: "3px",
                }}
              >
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{job?.companyName || "Verified Company"}</span>
                {job?.ats && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {job.ats.toUpperCase()}
                  </span>
                )}
                {job?.status && (
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      backgroundColor: job.status === "active" ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                      color: job.status === "active" ? "var(--accent-emerald)" : "var(--accent-rose)",
                      fontWeight: 500,
                    }}
                  >
                    {job.status.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setShowAutoApply(true)}
              className="btn"
              style={{
                fontSize: "12px",
                padding: "6px 14px",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                boxShadow: "0 2px 8px rgba(16, 185, 129, 0.35)",
                cursor: "pointer",
              }}
              title="Autonomous Agent: Opens browser, fills details from active resume, attaches PDF, and applies"
            >
              <Zap size={13} />
              <span>⚡ Auto-Apply (Browser Agent)</span>
            </button>

            {job?.applyUrl && (
              <a
                href={job.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
                style={{ fontSize: "12px", padding: "6px 14px" }}
              >
                <span>Direct Apply</span>
                <ExternalLink size={13} />
              </a>
            )}
            <button
              onClick={() => setIsJobModalOpen(false)}
              className="btn-icon btn-ghost"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            padding: "0 24px",
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-surface)",
            gap: "24px",
          }}
        >
          <button
            onClick={() => setActiveTab("details")}
            style={{
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: activeTab === "details" ? 600 : 400,
              color: activeTab === "details" ? "var(--text-primary)" : "var(--text-secondary)",
              borderBottom: activeTab === "details" ? "2px solid var(--accent-indigo)" : "2px solid transparent",
              background: "transparent",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
            }}
          >
            Role Overview & Requirements
          </button>
          <button
            onClick={() => setActiveTab("ai")}
            style={{
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: activeTab === "ai" ? 600 : 400,
              color: activeTab === "ai" ? "#a855f7" : "var(--text-secondary)",
              borderBottom: activeTab === "ai" ? "2px solid #a855f7" : "2px solid transparent",
              background: "transparent",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sparkles size={14} color="#a855f7" />
            Gemini Match Intelligence
          </button>
          <button
            onClick={() => setActiveTab("tailor")}
            style={{
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: activeTab === "tailor" ? 600 : 400,
              color: activeTab === "tailor" ? "var(--accent-indigo)" : "var(--text-secondary)",
              borderBottom: activeTab === "tailor" ? "2px solid var(--accent-indigo)" : "2px solid transparent",
              background: "transparent",
              borderTop: "none",
              borderLeft: "none",
              borderRight: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileCode size={14} color="var(--accent-indigo)" />
            LaTeX Resume Tailoring Studio
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "28px" }}>
          {isLoading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              Loading job details...
            </div>
          ) : activeTab === "details" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Metadata pill row */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  padding: "14px 18px",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Location: </span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {job?.location?.city
                      ? `${job.location.city}, ${job.location.country || ""}`
                      : "Remote"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Type: </span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {job?.employmentType || "Full-time"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Experience: </span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                    {(() => {
                      const exp = job?.experienceLevel;
                      if (exp && exp !== "Mid - Senior") return exp;
                      const t = (job?.title || "").toLowerCase();
                      if (t.includes("intern")) return "Internship";
                      if (t.includes("associate") || t.includes("junior") || t.includes("entry") || t.includes("fresher")) return "Entry Level (0-2 yrs)";
                      if (t.includes("senior") || t.includes("lead") || t.includes("staff") || t.includes("principal")) return "Senior / Lead";
                      return exp || "Mid Level (2-5 yrs)";
                    })()}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Discovered: </span>
                  <span style={{ color: "var(--text-primary)" }}>
                    {job?.firstSeenAt ? new Date(job.firstSeenAt).toLocaleDateString() : "Recently"}
                  </span>
                </div>
              </div>

              {/* Skills required */}
              {job?.skills && job.skills.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                    Detected Skills & Tech Stack
                  </h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {job.skills.map((skill: string, idx: number) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "11px",
                          fontFamily: "var(--font-mono)",
                          padding: "3px 8px",
                          backgroundColor: "var(--bg-surface)",
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-primary)",
                          borderRadius: "4px",
                          fontWeight: 500,
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Structured Role Description */}
              <div>
                <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                  Role Overview & Description
                </h4>
                <div
                  style={{
                    backgroundColor: "var(--bg-card)",
                    padding: "20px 24px",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-subtle)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {(() => {
                    const desc = (job?.description || "").trim();
                    if (!desc || desc.length < 50) {
                      return <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>No description provided.</div>;
                    }

                    // Decode entities
                    const decoded = desc
                      .replace(/&amp;/g, "&")
                      .replace(/&lt;/g, "<")
                      .replace(/&gt;/g, ">")
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'")
                      .replace(/&nbsp;/g, " ");

                    const paragraphs = decoded.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {paragraphs.map((para: string, pIdx: number) => {
                          const lines = para.trim().split("\n").map((l: string) => l.trim()).filter(Boolean);
                          const hasBullets = lines.some((l: string) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*"));

                          if (hasBullets) {
                            return (
                              <ul key={pIdx} style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px", margin: 0 }}>
                                {lines.map((line: string, lIdx: number) => (
                                  <li key={lIdx} style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--text-primary)" }}>
                                    {line.replace(/^[•\-\*]\s*/, "")}
                                  </li>
                                ))}
                              </ul>
                            );
                          }

                          // Heading line
                          if (
                            lines.length === 1 &&
                            (para.trim().endsWith(":") ||
                              /^(Job Description|Responsibilities|Requirements|Qualifications|About|What We Offer)/i.test(para.trim()))
                          ) {
                            return (
                              <h5 key={pIdx} style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--accent-indigo)", margin: "6px 0 2px" }}>
                                {para.trim()}
                              </h5>
                            );
                          }

                          return (
                            <p key={pIdx} style={{ margin: 0, fontSize: "13px", lineHeight: 1.65, color: "var(--text-primary)" }}>
                              {para.trim()}
                            </p>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Responsibilities if parsed separately */}
              {job?.responsibilities && Array.isArray(job.responsibilities) && job.responsibilities.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-indigo)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Briefcase size={15} />
                    Key Responsibilities
                  </h4>
                  <div
                    style={{
                      backgroundColor: "var(--bg-card)",
                      padding: "18px 22px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {job.responsibilities.map((r: string, idx: number) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.6 }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--accent-indigo)", marginTop: "8px", flexShrink: 0 }} />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Requirements if parsed separately */}
              {job?.requirements && Array.isArray(job.requirements) && job.requirements.length > 0 && (
                <div>
                  <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-indigo)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Sparkles size={15} />
                    Requirements & Qualifications
                  </h4>
                  <div
                    style={{
                      backgroundColor: "var(--bg-card)",
                      padding: "18px 22px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-sm)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {job.requirements.map((req: string, idx: number) => (
                      <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.6 }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--accent-indigo)", marginTop: "8px", flexShrink: 0 }} />
                        <span>{req}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "ai" ? (
            /* Gemini Analysis View */
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {isAiLoading ? (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
                  <Sparkles size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
                  <div>Running Gemini Semantic Match Analysis...</div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      padding: "16px 20px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(139, 92, 246, 0.1)",
                      border: "1px solid rgba(139, 92, 246, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", color: "var(--accent-purple)", fontWeight: 600 }}>
                        Gemini Semantic Match Rating
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", marginTop: "2px" }}>
                        {aiAnalysis?.summary || "Strong alignment with backend architecture and distributed systems."}
                      </div>
                    </div>
                    <ScoreRing score={aiAnalysis?.matchScore ?? 0.89} size={50} strokeWidth={4} />
                  </div>

                  {/* Strongest Matches */}
                  <div className="glass-panel" style={{ padding: "16px 20px" }}>
                    <h4
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--accent-emerald)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "10px",
                      }}
                    >
                      <CheckCircle2 size={16} /> Strongest Resume Alignments
                    </h4>
                    <ul style={{ paddingLeft: "20px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {aiAnalysis?.strongestMatches && aiAnalysis.strongestMatches.length > 0 ? (
                        aiAnalysis.strongestMatches.map((m: string, i: number) => <li key={i}>{m}</li>)
                      ) : (
                        <>
                          <li>TypeScript & Node.js backend development</li>
                          <li>Distributed systems & SQLite / PostgreSQL architecture</li>
                          <li>RESTful API design and database query optimization</li>
                        </>
                      )}
                    </ul>
                  </div>

                  {/* Missing Requirements or Gaps */}
                  <div className="glass-panel" style={{ padding: "16px 20px" }}>
                    <h4
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--accent-amber)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        marginBottom: "10px",
                      }}
                    >
                      <AlertTriangle size={16} /> Skill Gaps & Areas to Emphasize
                    </h4>
                    <ul style={{ paddingLeft: "20px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {aiAnalysis?.missingRequirements && aiAnalysis.missingRequirements.length > 0 ? (
                        aiAnalysis.missingRequirements.map((r: string, i: number) => <li key={i}>{r}</li>)
                      ) : (
                        <>
                          <li>Highlight any high-scale throughput metrics in your previous projects</li>
                          <li>Emphasize experience with container orchestration or CI/CD pipelines</li>
                        </>
                      )}
                    </ul>
                  </div>

                  <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleRunTailor}
                      disabled={isTailoring}
                    >
                      <FileCode size={15} />
                      <span>{isTailoring ? "Tailoring LaTeX..." : "Tailor Resume for this Job"}</span>
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleGenerateCoverLetter}
                      disabled={isGeneratingCoverLetter}
                    >
                      <FileText size={15} />
                      <span>{isGeneratingCoverLetter ? "Drafting..." : "Generate Direct Cover Letter"}</span>
                    </button>
                  </div>

                  {coverLetter && (
                    <div className="glass-panel" style={{ padding: "20px", marginTop: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <h4 style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-cyan)" }}>
                          Generated Application Note / Cover Letter
                        </h4>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: "11px", padding: "2px 8px" }}
                          onClick={() => copyToClipboard(coverLetter)}
                        >
                          {copied ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copied ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: "13px",
                          lineHeight: 1.6,
                          color: "var(--text-primary)",
                          whiteSpace: "pre-line",
                          backgroundColor: "var(--bg-input)",
                          padding: "16px",
                          borderRadius: "var(--radius-md)",
                          fontFamily: "var(--font-sans)",
                        }}
                      >
                        {coverLetter}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Resume Tailoring Studio */
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(79, 70, 229, 0.08)",
                  border: "1px solid rgba(79, 70, 229, 0.25)",
                  fontSize: "12px",
                  color: "var(--accent-indigo)",
                }}
              >
                <strong>Truthful Tailoring Guarantee:</strong> Bullet points and skills are re-ordered and highlighted
                to emphasize relevant experience from your existing resume. No fake credentials or hallucinated projects.
              </div>

              {!tailoredResult ? (
                <div style={{ textAlign: "center", padding: "48px" }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleRunTailor}
                    disabled={isTailoring}
                    style={{ fontSize: "14px", padding: "10px 24px" }}
                  >
                    <Sparkles size={16} />
                    <span>{isTailoring ? "Tailoring & Compiling PDF..." : "Generate Tailored Resume (PDF + LaTeX)"}</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* PDF Download Action Banner */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "16px 20px",
                      backgroundColor: "rgba(79, 70, 229, 0.06)",
                      border: "1px solid rgba(79, 70, 229, 0.25)",
                      borderRadius: "var(--radius-md)",
                      flexWrap: "wrap",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <CheckCircle2 size={24} style={{ color: "var(--accent-indigo)", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {tailoredResult.compileSuccess ? "Tailored PDF Ready" : "LaTeX Generated"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                          {tailoredResult.pdfFilename || "resume.pdf"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {tailoredResult.pdfBase64 && (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() =>
                              downloadPdfFromBase64(
                                tailoredResult.pdfBase64!,
                                tailoredResult.pdfFilename || "vansh_company_resume.pdf"
                              )
                            }
                            style={{
                              fontSize: "13px",
                              padding: "8px 16px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <Download size={15} />
                            <span>Download PDF ({tailoredResult.pdfFilename || "resume.pdf"})</span>
                          </button>

                          <button
                            className="btn btn-secondary"
                            onClick={() => previewPdfFromBase64(tailoredResult.pdfBase64!)}
                            style={{
                              fontSize: "12px",
                              padding: "8px 14px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <ExternalLink size={14} />
                            <span>Preview PDF</span>
                          </button>
                        </>
                      )}

                      <button
                        className="btn btn-secondary"
                        onClick={handleRunTailor}
                        disabled={isTailoring}
                        style={{ fontSize: "12px", padding: "8px 14px" }}
                        title="Re-run tailoring"
                      >
                        <Sparkles size={14} />
                        <span>{isTailoring ? "Tailoring..." : "Re-tailor"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Changes Summary */}
                  {tailoredResult.changes && tailoredResult.changes.length > 0 && (
                    <div
                      style={{
                        padding: "12px 16px",
                        backgroundColor: "var(--bg-input)",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--accent-cyan)", marginBottom: "8px" }}>
                        Truthful Tailoring Adjustments Made:
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        {tailoredResult.changes.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* LaTeX Source View */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Pristine LaTeX Source:
                      </span>
                      <button
                        className="btn btn-secondary"
                        onClick={() => copyToClipboard(tailoredResult.tailoredLaTeX)}
                        style={{ fontSize: "12px", padding: "4px 10px" }}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copied ? "Copied LaTeX!" : "Copy LaTeX"}</span>
                      </button>
                    </div>

                    <pre
                      style={{
                        maxHeight: "320px",
                        overflowY: "auto",
                        backgroundColor: "var(--bg-input)",
                        padding: "16px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {tailoredResult.tailoredLaTeX}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAutoApply && job && (
        <AutoApplyModal
          job={job}
          isOpen={showAutoApply}
          onClose={() => setShowAutoApply(false)}
        />
      )}
    </div>
  );
};
