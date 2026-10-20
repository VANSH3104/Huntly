import React, { useState, useEffect } from "react";
import {
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  User,
  Globe,
  Camera,
  Send,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/api";

interface AutoApplyModalProps {
  job: any;
  isOpen: boolean;
  onClose: () => void;
  onAppliedSuccess?: (application: any) => void;
}

export const AutoApplyModal: React.FC<AutoApplyModalProps> = ({
  job,
  isOpen,
  onClose,
  onAppliedSuccess,
}) => {
  const [mode, setMode] = useState<"review" | "auto_submit">("review");
  const [step, setStep] = useState<"configure" | "running" | "reviewed" | "submitted" | "error">("configure");
  const [profile, setProfile] = useState<any>({
    fullName: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    authorizedToWork: true,
    requireSponsorship: false,
    yearsOfExperience: 2,
  });

  const [activeResume, setActiveResume] = useState<any>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<"screenshot" | "fields">("screenshot");
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [showMemory, setShowMemory] = useState<boolean>(false);
  const [newMemQ, setNewMemQ] = useState("");
  const [newMemA, setNewMemA] = useState("");
  const [isSavingMem, setIsSavingMem] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("configure");
      setResult(null);
      setLogs([]);
      loadProfileAndResume();
    }
  }, [isOpen, job?.id]);

  const loadProfileAndResume = async () => {
    try {
      const [savedProfile, resume, memRes] = await Promise.all([
        api.autoApply.getProfile().catch(() => ({})),
        api.resumes.getActive().catch(() => null),
        api.autoApply.getMemory().catch(() => ({ success: true, memory: {} })),
      ]);

      setActiveResume(resume);
      if (memRes?.memory) {
        setMemory(memRes.memory);
      }

      setProfile({
        fullName: savedProfile.fullName || resume?.parsed?.basics?.name || "",
        email: savedProfile.email || resume?.parsed?.basics?.email || "",
        phone: savedProfile.phone || resume?.parsed?.basics?.phone || "",
        linkedinUrl:
          savedProfile.linkedinUrl ||
          resume?.parsed?.basics?.profiles?.find((p: any) => /linkedin/i.test(p.network || p.url))?.url ||
          "",
        githubUrl:
          savedProfile.githubUrl ||
          resume?.parsed?.basics?.profiles?.find((p: any) => /github/i.test(p.network || p.url))?.url ||
          "",
        portfolioUrl: savedProfile.portfolioUrl || resume?.parsed?.basics?.website || "",
        authorizedToWork: savedProfile.authorizedToWork ?? true,
        requireSponsorship: savedProfile.requireSponsorship ?? false,
        yearsOfExperience: savedProfile.yearsOfExperience ?? 2,
      });
    } catch (err) {
      console.error("Failed to load profile for auto-apply:", err);
    }
  };

  const handleSaveMemoryItem = async (q: string, a: string) => {
    if (!q.trim() || !a.trim()) return;
    try {
      setIsSavingMem(true);
      await api.autoApply.saveMemory({ question: q.trim(), answer: a.trim() });
      setMemory((prev) => ({ ...prev, [q.trim().toLowerCase()]: a.trim() }));
      setNewMemQ("");
      setNewMemA("");
    } catch (err: any) {
      alert(`Failed to save memory: ${err.message}`);
    } finally {
      setIsSavingMem(false);
    }
  };

  const handleStartApply = async () => {
    if (!job?.id) return;
    try {
      setIsRunning(true);
      setStep("running");
      setLogs([`[${new Date().toLocaleTimeString()}] Initializing Autonomous Job Application Crawler...`]);

      // Save profile updates for next time
      api.autoApply.updateProfile(profile).catch(() => {});

      const res = await api.autoApply.apply({
        jobId: job.id,
        resumeId: activeResume?.id,
        mode,
        profileOverrides: profile,
      });

      setResult(res);
      setLogs(res.logs || []);

      if (res.status === "ready_for_review") {
        setStep("reviewed");
      } else if (res.status === "submitted") {
        setStep("submitted");
        onAppliedSuccess?.(res);
      } else {
        setStep("error");
      }
    } catch (err: any) {
      setStep("error");
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!job?.id) return;
    try {
      setIsRunning(true);
      setStep("running");

      const res = await api.autoApply.confirm({
        jobId: job.id,
        resumeId: activeResume?.id,
      });

      setResult(res);
      setLogs(res.logs || []);

      if (res.status === "submitted") {
        setStep("submitted");
        onAppliedSuccess?.(res);
      } else {
        setStep("error");
      }
    } catch (err: any) {
      setStep("error");
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "20px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "840px",
          maxHeight: "90vh",
          backgroundColor: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-xl)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(99, 102, 241, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Zap size={20} color="var(--accent-indigo)" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                  Autonomous Job Application Crawler
                </h2>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "var(--accent-emerald)",
                  }}
                >
                  AI POWERED
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                Applying to <strong style={{ color: "var(--text-primary)" }}>{job.title}</strong> at {job.company?.name || "Target Company"}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => setShowMemory(!showMemory)}
              className="btn btn-secondary"
              style={{
                fontSize: "11px",
                padding: "5px 11px",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                borderColor: showMemory ? "var(--accent-indigo)" : undefined,
                backgroundColor: showMemory ? "rgba(99, 102, 241, 0.1)" : undefined,
                color: showMemory ? "var(--accent-indigo)" : "var(--text-secondary)",
                borderRadius: "6px",
              }}
              title="Persistent Q&A Memory: Agent remembers your answers so you don't need to re-enter them"
            >
              <span>🧠 Learned Answers ({Object.keys(memory).length})</span>
            </button>

            <button
              onClick={onClose}
              className="btn-icon btn-ghost"
              style={{ width: "32px", height: "32px" }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {/* LEARNED MEMORY DRAWER */}
          {showMemory && (
            <div
              style={{
                marginBottom: "20px",
                padding: "16px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(99, 102, 241, 0.05)",
                border: "1px solid rgba(99, 102, 241, 0.2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Sparkles size={15} color="var(--accent-indigo)" />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Persistent Learned Answers Memory
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Auto-populated across all ATS portals (Greenhouse, Lever, Ashby, Workday, etc.)
                </span>
              </div>

              {/* Add new memory input */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Question / Prompt (e.g. Notice period or Work authorization)"
                  value={newMemQ}
                  onChange={(e) => setNewMemQ(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: "220px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-card)",
                    color: "var(--text-primary)",
                  }}
                />
                <input
                  type="text"
                  placeholder="Answer (e.g. Immediate / 15 days or Yes, Authorized)"
                  value={newMemA}
                  onChange={(e) => setNewMemA(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: "220px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-card)",
                    color: "var(--text-primary)",
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => handleSaveMemoryItem(newMemQ, newMemA)}
                  disabled={isSavingMem || !newMemQ.trim() || !newMemA.trim()}
                  style={{ fontSize: "12px", padding: "6px 14px", whiteSpace: "nowrap" }}
                >
                  {isSavingMem ? "Saving..." : "Remember Answer"}
                </button>
              </div>

              {/* List of remembered items */}
              {Object.keys(memory).length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                  No custom answers stored yet. As applications are filled, the agent will learn and remember recurring questions automatically!
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "160px", overflowY: "auto" }}>
                  {Object.entries(memory).map(([q, a]) => (
                    <div
                      key={q}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "var(--bg-card)",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{q}</span>
                        <span style={{ color: "var(--text-secondary)" }}>{a}</span>
                      </div>
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor: "rgba(16, 185, 129, 0.12)",
                          color: "var(--accent-emerald)",
                          fontWeight: 600,
                        }}
                      >
                        CACHED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 1: CONFIGURE & REVIEW DETAILS */}
          {step === "configure" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Mode Selection */}
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: "8px" }}>
                  Select Automation Execution Mode
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div
                    onClick={() => setMode("review")}
                    style={{
                      padding: "14px",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${mode === "review" ? "var(--accent-indigo)" : "var(--border-subtle)"}`,
                      backgroundColor: mode === "review" ? "rgba(99, 102, 241, 0.05)" : "var(--bg-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <Eye size={16} color="var(--accent-indigo)" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Interactive Review Mode
                      </span>
                    </div>
                    <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Crawler navigates, fills all fields, uploads resume, uses AI for questions, captures screenshot, and pauses for your approval before submitting.
                    </p>
                  </div>

                  <div
                    onClick={() => setMode("auto_submit")}
                    style={{
                      padding: "14px",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${mode === "auto_submit" ? "var(--accent-emerald)" : "var(--border-subtle)"}`,
                      backgroundColor: mode === "auto_submit" ? "rgba(16, 185, 129, 0.05)" : "var(--bg-secondary)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <Zap size={16} color="var(--accent-emerald)" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        1-Click Full Automation
                      </span>
                    </div>
                    <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      Crawler autonomously fills the complete application, uploads resume, answers screening prompts, clicks Submit, and records confirmation in your database.
                    </p>
                  </div>
                </div>
              </div>

              {/* Applicant Profile Information */}
              <div
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                  <User size={15} color="var(--accent-indigo)" />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Applicant Details to Autofill
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>
                    {activeResume ? `Active Resume: ${activeResume.name}` : "No active resume loaded"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={profile.phone}
                      onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      LinkedIn URL
                    </label>
                    <input
                      type="url"
                      value={profile.linkedinUrl}
                      onChange={(e) => setProfile({ ...profile, linkedinUrl: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      GitHub URL
                    </label>
                    <input
                      type="url"
                      value={profile.githubUrl}
                      onChange={(e) => setProfile({ ...profile, githubUrl: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Portfolio / Website
                    </label>
                    <input
                      type="url"
                      value={profile.portfolioUrl}
                      onChange={(e) => setProfile({ ...profile, portfolioUrl: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-subtle)",
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </div>

                {/* Work Authorization Checkboxes */}
                <div style={{ marginTop: "14px", display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-primary)" }}>
                    <input
                      type="checkbox"
                      checked={profile.authorizedToWork}
                      onChange={(e) => setProfile({ ...profile, authorizedToWork: e.target.checked })}
                    />
                    <span>Legally authorized to work</span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", color: "var(--text-primary)" }}>
                    <input
                      type="checkbox"
                      checked={profile.requireSponsorship}
                      onChange={(e) => setProfile({ ...profile, requireSponsorship: e.target.checked })}
                    />
                    <span>Requires visa sponsorship now or future</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: RUNNING LIVE PROGRESS */}
          {step === "running" && (
            <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={44} className="animate-spin" color="var(--accent-indigo)" style={{ marginBottom: "16px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                Crawler Automating Application...
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "center", maxWidth: "480px" }}>
                Navigating to application portal, detecting ATS, filling candidate credentials, uploading resume PDF, and formulating AI responses.
              </p>

              {/* Live Step Stepper */}
              <div
                style={{
                  marginTop: "24px",
                  width: "100%",
                  maxWidth: "500px",
                  padding: "16px",
                  backgroundColor: "var(--bg-secondary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  "1. Launching automated browser & loading portal",
                  "2. Detecting ATS signature & form field hierarchy",
                  "3. Autofilling contact details, links & locations",
                  "4. Uploading compiled LaTeX resume PDF",
                  "5. AI answering custom screening prompts",
                  mode === "auto_submit" ? "6. Submitting application & capturing confirmation" : "6. Generating visual preview snapshot for review",
                ].map((s, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-secondary)" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-indigo)" }} />
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW BEFORE SUBMIT */}
          {step === "reviewed" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div
                style={{
                  padding: "12px 16px",
                  backgroundColor: "rgba(99, 102, 241, 0.08)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <ShieldCheck size={18} color="var(--accent-indigo)" />
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                      Application Ready for Final Review ({result.atsType?.toUpperCase()})
                    </span>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Successfully autofilled {result.fieldsFilled?.length || 0} fields. Inspect the preview below before submitting.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    className={`btn ${previewTab === "screenshot" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setPreviewTab("screenshot")}
                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                  >
                    <Camera size={12} />
                    <span>Page Screenshot</span>
                  </button>
                  <button
                    className={`btn ${previewTab === "fields" ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setPreviewTab("fields")}
                    style={{ height: "28px", padding: "0 10px", fontSize: "11px" }}
                  >
                    <FileText size={12} />
                    <span>Filled Fields ({result.fieldsFilled?.length || 0})</span>
                  </button>
                </div>
              </div>

              {/* Preview Content */}
              {previewTab === "screenshot" ? (
                <div
                  style={{
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    overflow: "hidden",
                    backgroundColor: "#1e1e1e",
                    maxHeight: "440px",
                    overflowY: "auto",
                  }}
                >
                  {result.screenshotBase64 ? (
                    <img
                      src={result.screenshotBase64}
                      alt="Filled Application Form Preview"
                      style={{ width: "100%", display: "block" }}
                    />
                  ) : (
                    <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Screenshot unavailable</div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-subtle)",
                    backgroundColor: "var(--bg-secondary)",
                    padding: "12px",
                    maxHeight: "440px",
                    overflowY: "auto",
                  }}
                >
                  <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)", textAlign: "left" }}>
                        <th style={{ padding: "6px 8px" }}>Field Label</th>
                        <th style={{ padding: "6px 8px" }}>Category</th>
                        <th style={{ padding: "6px 8px" }}>Autofilled Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.fieldsFilled?.map((f: any, idx: number) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "8px", fontWeight: 600, color: "var(--text-primary)" }}>{f.label || f.field}</td>
                          <td style={{ padding: "8px", color: "var(--text-muted)" }}>
                            <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "var(--bg-card)" }}>
                              {f.category}
                            </span>
                          </td>
                          <td style={{ padding: "8px", color: "var(--text-primary)" }}>
                            {f.type === "ai_generated" ? (
                              <div>
                                <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", backgroundColor: "rgba(168, 85, 247, 0.2)", color: "#c084fc", marginRight: "4px" }}>
                                  AI ANSWER
                                </span>
                                {f.value}
                              </div>
                            ) : (
                              f.value
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: SUBMITTED SUCCESS */}
          {step === "submitted" && result && (
            <div style={{ padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "50%",
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "16px",
                }}
              >
                <CheckCircle2 size={32} color="var(--accent-emerald)" />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>
                Application Successfully Submitted!
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "460px", marginBottom: "16px" }}>
                {result.confirmationMessage || `Applied to ${job.title} at ${job.company?.name || "Company"}.`}
              </p>
              <div
                style={{
                  padding: "10px 16px",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                Recorded in database & added to your <strong>Applications Kanban Board</strong>.
              </div>
            </div>
          )}

          {/* STEP 5: ERROR */}
          {step === "error" && (
            <div style={{ padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <AlertCircle size={40} color="var(--accent-rose)" style={{ marginBottom: "12px" }} />
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                Application Crawler Encountered an Issue
              </h3>
              <p style={{ fontSize: "12.5px", color: "var(--accent-rose)", maxWidth: "500px", marginBottom: "16px" }}>
                {result?.error || result?.reason || logs[logs.length - 1] || "Failed to automate job application form."}
              </p>
              <button className="btn btn-secondary" onClick={() => setStep("configure")}>
                Try Again
              </button>
            </div>
          )}

          {/* Logs Accordion */}
          {logs.length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
              <button
                onClick={() => setShowLogs(!showLogs)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: "12px",
                }}
              >
                <span>Crawler Automation Logs ({logs.length} events)</span>
                {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showLogs && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "10px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "#0d1117",
                    color: "#c9d1d9",
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    maxHeight: "150px",
                    overflowY: "auto",
                  }}
                >
                  {logs.map((l, i) => (
                    <div key={i} style={{ marginBottom: "3px" }}>
                      {l}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            {job.applyUrl ? (
              <a href={job.applyUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-indigo)", textDecoration: "underline" }}>
                Open original job posting ↗
              </a>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={isRunning}>
              {step === "submitted" ? "Done" : "Cancel"}
            </button>

            {step === "configure" && (
              <button className="btn btn-primary" onClick={handleStartApply} disabled={isRunning}>
                <Zap size={14} />
                <span>{mode === "review" ? "Start Autofill & Review" : "⚡ 1-Click Auto-Submit"}</span>
              </button>
            )}

            {step === "reviewed" && (
              <button className="btn btn-primary" onClick={handleConfirmSubmit} disabled={isRunning} style={{ backgroundColor: "var(--accent-emerald)" }}>
                <Send size={14} />
                <span>Confirm & Submit Application</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
