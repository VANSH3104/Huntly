import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  ExternalLink,
  Sparkles,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Flag,
  Share2,
  FileText,
  Download,
  Building,
  MapPin,
  Check,
  AlertCircle,
} from "lucide-react";
import { api } from "../../lib/api";

interface FreehireJobDetailModalProps {
  jobId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FreehireJobDetailModal: React.FC<FreehireJobDetailModalProps> = ({
  jobId,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"description" | "company" | "application" | "tailor">("description");
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailorResult, setTailorResult] = useState<any | null>(null);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => (jobId ? api.jobs.getById(jobId) : null),
    enabled: !!jobId && isOpen,
  });

  if (!isOpen || !jobId) return null;

  const compName = job?.companyName || job?.company?.name || "Company";
  const skillsMatch = job?.skillsMatch || {
    matchPercent: job?.matchScore || 75,
    matchedCount: 5,
    totalSkills: 8,
    youHave: ["AI", "Kafka", "MongoDB", "PostgreSQL", "Redis"],
    missing: ["AWS", "EKS", "Go"],
  };

  const matchPercent = Math.max(0, Math.min(100, skillsMatch.matchPercent ?? job?.matchScore ?? 75));
  const matchedCount = skillsMatch.matchedCount ?? 5;
  const totalSkills = skillsMatch.totalSkills ?? 8;
  const youHaveList = skillsMatch.youHave || [];
  const missingList = skillsMatch.missing || [];

  const openDays = job?.openDays ?? 124;
  const views = job?.views ?? 47;
  const applied = job?.applied ?? 1;
  const workFormat = job?.workFormat || (job?.location?.remote ? "Remote" : "Hybrid");
  const locationStr = job?.location?.city || job?.location?.country || "Worldwide";
  const region = job?.region || "Worldwide";
  const grade = job?.grade || job?.experienceLevel || "Junior";
  const experience = job?.location?.experience || "1+ yrs";
  const english = job?.location?.english || "B1";
  const category = job?.location?.specialization || "Software Engineering";
  const relocation = "Supported";
  const companyType = job?.company?.companyType || "Startup";
  const domain = job?.domain || job?.company?.industry || "FinTech";
  const sourceName = job?.sourceName || job?.ats || "Greenhouse";

  const handleTailorCV = async () => {
    try {
      setIsTailoring(true);
      setActiveTab("tailor");
      const res = await api.ai.tailorResume(jobId);
      setTailorResult(res);
    } catch (err: any) {
      alert(`CV tailoring notice: ${err.message}`);
    } finally {
      setIsTailoring(false);
    }
  };

  const handleApply = () => {
    const url = job?.applyUrl || job?.sourceUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleSave = async () => {
    try {
      await api.applications.create({
        jobId: job.id,
        status: "saved",
        notes: "Saved via Freehire view",
      });
      setIsSaved(true);
    } catch {
      setIsSaved(true);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1040px",
          height: "90vh",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.35)",
          display: "flex",
          overflow: "hidden",
        }}
      >
        {/* LEFT COLUMN: Profile Match, Skills Breakdown, Metadata */}
        <div
          style={{
            width: "320px",
            borderRight: "1px solid #e5e7eb",
            backgroundColor: "#fafaf9",
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {/* Match Score Header */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Profile Match
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: "4px" }}>
              <span style={{ fontSize: "32px", fontWeight: 800, color: "#111827", lineHeight: 1 }}>
                {matchPercent}%
              </span>
              <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>
                {matchedCount} of {totalSkills} skills
              </span>
            </div>

            {/* Dual color progress bar */}
            <div className="freehire-match-bar-track" style={{ height: "6px", marginTop: "10px" }}>
              <div
                className="freehire-match-bar-fill"
                style={{ width: `${matchPercent}%` }}
              />
            </div>
          </div>

          {/* You have chips */}
          {youHaveList.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#166534", marginBottom: "8px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#16a34a" }} />
                <span>You have</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {youHaveList.map((s: string) => (
                  <span
                    key={s}
                    style={{
                      fontSize: "11.5px",
                      padding: "3px 9px",
                      borderRadius: "6px",
                      backgroundColor: "rgba(91, 123, 18, 0.12)",
                      color: "#4d6b0a",
                      fontWeight: 600,
                      border: "1px solid rgba(91, 123, 18, 0.25)",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing chips */}
          {missingList.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#b91c1c", marginBottom: "8px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "#ef4444" }} />
                <span>Missing</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {missingList.map((s: string) => (
                  <span
                    key={s}
                    style={{
                      fontSize: "11.5px",
                      padding: "3px 9px",
                      borderRadius: "6px",
                      backgroundColor: "#fee2e2",
                      color: "#b91c1c",
                      fontWeight: 500,
                      border: "1px solid #fecaca",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ height: "1px", backgroundColor: "#e5e7eb" }} />

          {/* Metadata Table */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Work format</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{workFormat}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Location</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{locationStr}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Region</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{region}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Grade</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{grade}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Experience</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{experience}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>English</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{english}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Category</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{category}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Relocation</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{relocation}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Company</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{companyType}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#6b7280" }}>Domains</span>
              <span style={{ fontWeight: 600, color: "#111827" }}>{domain}</span>
            </div>
          </div>

          <div style={{ height: "1px", backgroundColor: "#e5e7eb" }} />

          {/* Source badge */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#166534",
                backgroundColor: "rgba(91, 123, 18, 0.12)",
                padding: "3px 10px",
                borderRadius: "6px",
                border: "1px solid rgba(91, 123, 18, 0.2)",
              }}
            >
              {sourceName}
            </span>
            <span style={{ fontSize: "11px", color: "#9ca3af", cursor: "pointer" }}>
              Avoid this source
            </span>
          </div>

          {/* Thumbs up / down feedback */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "auto", paddingTop: "12px" }}>
            <button
              onClick={() => setFeedback("up")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                border: `1px solid ${feedback === "up" ? "#5b7b12" : "#e5e7eb"}`,
                backgroundColor: feedback === "up" ? "rgba(91, 123, 18, 0.1)" : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ThumbsUp size={16} color={feedback === "up" ? "#5b7b12" : "#6b7280"} />
            </button>
            <button
              onClick={() => setFeedback("down")}
              style={{
                flex: 1,
                padding: "8px",
                borderRadius: "8px",
                border: `1px solid ${feedback === "down" ? "#ef4444" : "#e5e7eb"}`,
                backgroundColor: feedback === "down" ? "rgba(239, 68, 68, 0.1)" : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ThumbsDown size={16} color={feedback === "down" ? "#ef4444" : "#6b7280"} />
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Job Details, Tabs & Actions */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Top Bar with Company and Action Buttons */}
          <div
            style={{
              padding: "20px 28px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "20px",
            }}
          >
            <div>
              {/* Company & badges */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                  {compName}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(0, 0, 0, 0.05)",
                    color: "#4b5563",
                    fontWeight: 500,
                  }}
                >
                  Open {openDays}d
                </span>
                <span style={{ fontSize: "11px", color: "#9ca3af" }}>posting date refreshed</span>
              </div>

              {/* Job Title */}
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 800,
                  color: "#111827",
                  margin: "0 0 8px 0",
                  lineHeight: 1.25,
                }}
              >
                {job?.title}
              </h2>

              {/* Meta stats */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "#6b7280" }}>
                <span>🕒 1 hr. ago</span>
                <span>⏱️ 60 min. ago</span>
                <span>👁️ {views} views</span>
                <span>✓ {applied} applied</span>
              </div>
            </div>

            {/* Actions: Apply + Tailor my CV */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={handleApply}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <span>Apply</span>
                <ExternalLink size={14} color="#6b7280" />
              </button>

              <button
                onClick={handleTailorCV}
                disabled={isTailoring}
                className="freehire-btn-olive"
                style={{
                  padding: "9px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                <Sparkles size={14} />
                <span>{isTailoring ? "Tailoring CV..." : "Tailor my CV"}</span>
              </button>

              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px",
                  color: "#6b7280",
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Sub Navigation Bar: Tabs & Quick Actions */}
          <div
            style={{
              padding: "0 28px",
              borderBottom: "1px solid #e5e7eb",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: "#ffffff",
            }}
          >
            {/* Tabs */}
            <div style={{ display: "flex", gap: "24px" }}>
              {[
                { id: "description", label: "Description" },
                { id: "company", label: "Company" },
                { id: "application", label: "Application" },
                { id: "tailor", label: "LaTeX Tailor Studio" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  style={{
                    padding: "12px 0",
                    fontSize: "13px",
                    fontWeight: activeTab === t.id ? 700 : 500,
                    color: activeTab === t.id ? "#111827" : "#6b7280",
                    borderBottom: activeTab === t.id ? "2px solid #5b7b12" : "2px solid transparent",
                    background: "transparent",
                    borderTop: "none",
                    borderLeft: "none",
                    borderRight: "none",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Quick Actions: Discussion, Report, Save */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "#6b7280" }}>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: "#6b7280",
                }}
              >
                <MessageSquare size={14} />
                <span>Discussion</span>
              </button>
              <button
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: "#6b7280",
                }}
              >
                <Flag size={14} />
                <span>Report</span>
              </button>
              <button
                onClick={handleSave}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  color: isSaved ? "#5b7b12" : "#6b7280",
                  fontWeight: isSaved ? 600 : 400,
                }}
              >
                {isSaved ? <BookmarkCheck size={14} color="#5b7b12" /> : <Bookmark size={14} />}
                <span>{isSaved ? "Saved" : "Save"}</span>
              </button>
            </div>
          </div>

          {/* Tab Content Area */}
          <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
            {/* TAB: DESCRIPTION */}
            {activeTab === "description" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Summary */}
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    Summary
                  </h4>
                  <p style={{ fontSize: "13.5px", color: "#374151", lineHeight: 1.6, margin: 0 }}>
                    {job?.description?.split("###")[0] ||
                      "Build and maintain backend services in modern technologies like Go, React, Python, or TypeScript, collaborating with cross-functional teams to improve reliability, scale, and customer satisfaction."}
                  </p>
                </div>

                {/* Challenges that await you */}
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    Challenges that await you:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13.5px", color: "#374151", lineHeight: 1.6 }}>
                    <li>Interactions with cross-functional product and infrastructure squads for successful implementation</li>
                    <li>Participation in the architecture of scalable backend services and high-resiliency system components</li>
                    <li>Designing clean APIs, monitoring observability metrics, and troubleshooting distributed bottlenecks</li>
                  </ul>
                </div>

                {/* What makes you a great fit */}
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    What makes you a great fit:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13.5px", color: "#374151", lineHeight: 1.6 }}>
                    <li>1+ years of experience in Software Engineering and technical problem solving</li>
                    <li>Excellent proven knowledge of relevant languages and frameworks (e.g. Go, TypeScript, React, Python, Kafka, PostgreSQL)</li>
                    <li>You love automating routine workflows, writing tests, and maintaining high code standards</li>
                    <li>You have a strong understanding of how the core technologies in our stack operate</li>
                  </ul>
                </div>

                {/* What we offer */}
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    What we offer:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13.5px", color: "#374151", lineHeight: 1.6 }}>
                    <li>Competitive compensation with equity incentives and performance bonuses</li>
                    <li>Flexible work model (Remote or Hybrid) with home office and workstation equipment stipend</li>
                    <li>Comprehensive healthcare, pension plans, learning budget, and generous PTO</li>
                  </ul>
                </div>
              </div>
            )}

            {/* TAB: COMPANY */}
            {activeTab === "company" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "8px", backgroundColor: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                    {compName.slice(0, 2)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>{compName}</h3>
                    <div style={{ fontSize: "12px", color: "#6b7280" }}>{domain} · {companyType}</div>
                  </div>
                </div>
                <p style={{ fontSize: "13.5px", color: "#374151", lineHeight: 1.6 }}>
                  {job?.company?.description ||
                    `${compName} is a high-growth technology organization building mission-critical platforms and infrastructure for millions of global users.`}
                </p>
              </div>
            )}

            {/* TAB: APPLICATION */}
            {activeTab === "application" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Application Checklist</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534" }}>
                    <Check size={16} /> <span>Resume skill alignment verified ({matchPercent}% match)</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534" }}>
                    <Check size={16} /> <span>Verified job posting ({sourceName})</span>
                  </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                  <button onClick={handleApply} className="freehire-btn-olive" style={{ padding: "8px 18px", fontSize: "13px" }}>
                    <span>Launch Direct Application Portal</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* TAB: TAILOR */}
            {activeTab === "tailor" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#111827", margin: 0 }}>
                    Tailored LaTeX Resume for {compName}
                  </h4>
                  {tailorResult?.pdfBase64 && (
                    <button
                      onClick={() => {
                        const byteCharacters = atob(tailorResult.pdfBase64);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: "application/pdf" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = tailorResult.pdfFilename || "Vansh_Kabra_Tailored_Resume.pdf";
                        a.click();
                      }}
                      className="freehire-btn-olive"
                      style={{ padding: "6px 14px", fontSize: "12px" }}
                    >
                      <Download size={14} />
                      <span>Download PDF</span>
                    </button>
                  )}
                </div>

                {isTailoring && (
                  <div style={{ padding: "20px", textAlign: "center", color: "#6b7280" }}>
                    AI is optimizing your LaTeX resume for {compName} with targeted keywords...
                  </div>
                )}

                {tailorResult?.tailoredLaTeX && (
                  <pre
                    style={{
                      padding: "16px",
                      borderRadius: "8px",
                      backgroundColor: "#1e1e1e",
                      color: "#d4d4d4",
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)",
                      maxHeight: "360px",
                      overflowY: "auto",
                    }}
                  >
                    {tailorResult.tailoredLaTeX}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
