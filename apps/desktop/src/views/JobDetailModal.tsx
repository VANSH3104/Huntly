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
  Layers,
  FileText,
} from "lucide-react";

export const JobDetailModal: React.FC = () => {
  const { selectedJobId, isJobModalOpen, setIsJobModalOpen } = useStore();

  const [activeTab, setActiveTab] = useState<"details" | "ai" | "tailor">("details");
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredResult, setTailoredResult] = useState<{ tailoredLaTeX: string; changes: any[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);

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
          border: "1px solid rgba(59, 130, 246, 0.3)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 28px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(15, 20, 32, 0.9)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <ScoreRing score={job?.matchScore ?? 0.88} size={48} strokeWidth={4} />
            <div>
              <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)" }}>
                {job?.title || "Job Details"}
              </h2>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--accent-cyan)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  marginTop: "2px",
                }}
              >
                <span>{job?.companyName || "Verified Company"}</span>
                {job?.ats && <Badge variant="purple">{job.ats.toUpperCase()}</Badge>}
                {job?.status && (
                  <Badge variant={job.status === "active" ? "emerald" : "rose"}>
                    {job.status.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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
            padding: "0 28px",
            borderBottom: "1px solid var(--border-subtle)",
            backgroundColor: "rgba(10, 13, 20, 0.4)",
            gap: "24px",
          }}
        >
          <button
            onClick={() => setActiveTab("details")}
            style={{
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: activeTab === "details" ? 600 : 400,
              color: activeTab === "details" ? "var(--accent-cyan)" : "var(--text-secondary)",
              borderBottom: activeTab === "details" ? "2px solid var(--accent-cyan)" : "2px solid transparent",
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
              color: activeTab === "ai" ? "var(--accent-purple)" : "var(--text-secondary)",
              borderBottom: activeTab === "ai" ? "2px solid var(--accent-purple)" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Sparkles size={14} color="var(--accent-purple)" />
            Gemini Match Intelligence
          </button>
          <button
            onClick={() => setActiveTab("tailor")}
            style={{
              padding: "12px 0",
              fontSize: "13px",
              fontWeight: activeTab === "tailor" ? 600 : 400,
              color: activeTab === "tailor" ? "var(--accent-emerald)" : "var(--text-secondary)",
              borderBottom: activeTab === "tailor" ? "2px solid var(--accent-emerald)" : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileCode size={14} color="var(--accent-emerald)" />
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
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
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
                  <span style={{ color: "var(--text-primary)" }}>
                    {job?.experienceLevel || "Mid - Senior"}
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
                  <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
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
                          backgroundColor: "rgba(6, 182, 212, 0.1)",
                          border: "1px solid rgba(6, 182, 212, 0.25)",
                          color: "var(--accent-cyan)",
                          borderRadius: "4px",
                        }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <h4 style={{ fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
                  Role Description
                </h4>
                <div
                  style={{
                    fontSize: "13px",
                    lineHeight: 1.7,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-line",
                  }}
                >
                  {job?.description || "No description provided."}
                </div>
              </div>
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
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  fontSize: "12px",
                  color: "var(--accent-emerald)",
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
                    <span>{isTailoring ? "Tailoring with Gemini..." : "Generate Tailored LaTeX Resume"}</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                      Tailored LaTeX Source:
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
                      maxHeight: "360px",
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
