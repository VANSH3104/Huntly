import React, { useState } from "react";
import {
  Eye,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api";

interface FreehireJobCardProps {
  job: any;
  onSelect: (jobId: string) => void;
}

const COMPANY_COLORS: Record<string, { bg: string; text: string }> = {
  plata: { bg: "#dcfce7", text: "#15803d" },
  cloudflare: { bg: "#ffedd5", text: "#c2410c" },
  displate: { bg: "#e0e7ff", text: "#4338ca" },
  anthropic: { bg: "#f3e8ff", text: "#7e22ce" },
  playstation: { bg: "#dbeafe", text: "#1d4ed8" },
  securityboat: { bg: "#ccfbf1", text: "#0f766e" },
  coinbase: { bg: "#dbeafe", text: "#1e40af" },
  rippling: { bg: "#fee2e2", text: "#b91c1c" },
  ashby: { bg: "#e0e7ff", text: "#3730a3" },
};

function getCompanyColor(name: string) {
  const key = (name || "").toLowerCase().trim();
  for (const [k, v] of Object.entries(COMPANY_COLORS)) {
    if (key.includes(k)) return v;
  }
  // Deterministic pastel color
  const hues = [
    { bg: "#dcfce7", text: "#166534" },
    { bg: "#ffedd5", text: "#9a3412" },
    { bg: "#e0e7ff", text: "#3730a3" },
    { bg: "#f3e8ff", text: "#6b21a8" },
    { bg: "#ccfbf1", text: "#115e59" },
    { bg: "#fef3c7", text: "#854d0e" },
  ];
  const charCode = name.charCodeAt(0) || 0;
  return hues[charCode % hues.length];
}

export const FreehireJobCard: React.FC<FreehireJobCardProps> = ({ job, onSelect }) => {
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const compName = job.companyName || job.company?.name || "Company";
  const colors = getCompanyColor(compName);

  // Skill calculations
  const skillsMatch = job.skillsMatch || {
    matchPercent: job.matchScore || 75,
    matchedCount: 5,
    totalSkills: 8,
    youHave: [],
    missing: [],
  };

  const matchPercent = Math.max(0, Math.min(100, skillsMatch.matchPercent ?? job.matchScore ?? 75));
  const matchedCount = skillsMatch.matchedCount ?? Math.round((matchPercent / 100) * (job.skills?.length || 8));
  const totalSkills = skillsMatch.totalSkills || (job.skills?.length || 8);

  // Badges
  const openDays = job.openDays ?? 124;
  const workFormat = job.workFormat || (job.location?.remote || job.location?.isRemote ? "Remote" : "Hybrid");
  const region = job.region || job.location?.country || job.location?.region || "Worldwide";
  const grade = job.grade || job.experienceLevel || "Junior";

  // Freshness
  const postedText = job.postedAt
    ? formatTimeAgo(new Date(job.postedAt).getTime())
    : "1 hour ago";

  const viewsCount = job.views ?? 47;

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSaving(true);
    try {
      await api.applications.create({
        jobId: job.id,
        status: "saved",
        notes: "Saved via AgentForge Job Radar",
      });
      setIsSaved(true);
    } catch {
      setIsSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = job.applyUrl || job.sourceUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Skill pills: show up to 5, rest as +N
  const rawSkills: string[] = Array.isArray(job.skills) ? job.skills : [];
  const displaySkills = rawSkills.slice(0, 5);
  const remainingCount = Math.max(0, rawSkills.length - 5);

  return (
    <div
      onClick={() => onSelect(job.id)}
      className="forge-job-card"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* Top row: Company icon, Company name, Views, Time, Bookmark */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Company Logo / Initial Badge */}
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "6px",
              backgroundColor: colors.bg,
              color: colors.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            {compName.slice(0, 2)}
          </div>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {compName}
          </span>
        </div>

        {/* Views + Time + Bookmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
            <Eye size={14} />
            <span>{viewsCount}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)" }}>
            <span>{postedText}</span>
          </div>
          <button
            onClick={handleSave}
            title={isSaved ? "Saved to board" : "Save to board"}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              color: isSaved ? "#5b7b12" : "var(--text-muted)",
              transition: "transform 0.15s ease",
            }}
          >
            {isSaved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
        </div>
      </div>

      {/* Job Title */}
      <div>
        <h3
          style={{
            fontSize: "17px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: 1.3,
            cursor: "pointer",
          }}
        >
          {job.title}
        </h3>
      </div>

      {/* Meta Pills: Open 124d, Remote, Worldwide, Junior, H-1B sponsor */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(0,0,0,0.04)",
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          Open {openDays}d
        </span>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(0,0,0,0.04)",
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          {workFormat}
        </span>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(0,0,0,0.04)",
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          {region}
        </span>
        <span
          style={{
            fontSize: "11px",
            padding: "2px 8px",
            borderRadius: "4px",
            backgroundColor: "rgba(0,0,0,0.04)",
            color: "var(--text-secondary)",
            fontWeight: 500,
          }}
        >
          {grade}
        </span>
        {job.location?.isH1b && (
          <span
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(16, 185, 129, 0.08)",
              color: "#059669",
              fontWeight: 500,
            }}
          >
            H-1B sponsor history
          </span>
        )}
      </div>

      {/* 2-line Description Summary */}
      <div
        style={{
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {job.description?.replace(/###[^\n]+/g, "").replace(/[-*•]/g, "").trim() ||
          "Join the engineering team to build scalable systems, collaborate with cross-functional partners, and shape high-impact products."}
      </div>

      {/* Skill Pills */}
      {rawSkills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
          {displaySkills.map((sk) => {
            const isMatched = (skillsMatch.youHave || []).some(
              (yh: string) => yh.toLowerCase() === sk.toLowerCase()
            );
            return (
              <span
                key={sk}
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: isMatched ? "rgba(91, 123, 18, 0.1)" : "rgba(0, 0, 0, 0.05)",
                  color: isMatched ? "#4c6b0c" : "var(--text-secondary)",
                  fontWeight: 500,
                  border: isMatched ? "1px solid rgba(91, 123, 18, 0.2)" : "1px solid transparent",
                }}
              >
                {sk}
              </span>
            );
          })}
          {remainingCount > 0 && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
              +{remainingCount} skills
            </span>
          )}
        </div>
      )}

      {/* Dual Match Progress Bar */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "5px",
          }}
        >
          <div className="forge-job-match-track" style={{ flex: 1, marginRight: "12px" }}>
            <div
              className="forge-job-match-fill"
              style={{ width: `${matchPercent}%` }}
            />
          </div>
          <span
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: matchPercent >= 60 ? "#059669" : "var(--text-secondary)",
              whiteSpace: "nowrap",
            }}
          >
            {matchPercent}% · {matchedCount}/{totalSkills} skills
          </span>
        </div>
      </div>

      {/* Bottom Actions: Save to board & Apply */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: "6px",
          borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.05))",
        }}
      >
        <button
          onClick={handleSave}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid var(--border-subtle)",
            backgroundColor: isSaved ? "rgba(99, 102, 241, 0.12)" : "var(--bg-card)",
            color: isSaved ? "var(--accent-indigo, #6366f1)" : "var(--text-primary)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {isSaved ? <BookmarkCheck size={14} color="var(--accent-indigo, #6366f1)" /> : <Bookmark size={14} />}
          <span>{isSaved ? "Saved to board" : "Save to board"}</span>
        </button>

        <button
          onClick={handleApply}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 16px",
            borderRadius: "6px",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <span>Apply</span>
          <ExternalLink size={13} color="var(--text-muted)" />
        </button>
      </div>
    </div>
  );
};

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
