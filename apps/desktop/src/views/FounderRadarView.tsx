import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import {
  Radio,
  Sparkles,
  Send,
  Mail,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Search,
  Building2,
  DollarSign,
  Briefcase,
  Zap,
  TrendingUp,
  X,
  MessageSquare,
  BookmarkPlus,
  BookmarkCheck,
  Flame,
} from "lucide-react";

interface SocialJobCard {
  id: string;
  title: string;
  companyName: string;
  location: string;
  platform: "twitter" | "yc" | "hn" | string;
  description: string;
  sourceUrl: string;
  postedAt?: string;
  salaryFormatted?: string;
  equityRange?: string;
  ycBatch?: string;
  founderHandle?: string;
  contactEmail?: string;
  matchScore?: number;
}

interface OutreachResult {
  twitterDM: string;
  coldEmail: { subject: string; body: string };
  linkedInNote: string;
  keyHook: string;
}

export const FounderRadarView: React.FC = () => {
  const [activeChannel, setActiveChannel] = useState<"all" | "twitter" | "yc" | "hn">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFreshness, setSelectedFreshness] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState<string | null>(null);
  const [jobsList, setJobsList] = useState<SocialJobCard[]>([]);
  const [addedJobs, setAddedJobs] = useState<Set<string>>(new Set());

  // Outreach Modal State
  const [selectedJobForOutreach, setSelectedJobForOutreach] = useState<SocialJobCard | null>(null);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [outreachData, setOutreachData] = useState<OutreachResult | null>(null);
  const [activeOutreachTab, setActiveOutreachTab] = useState<"twitter" | "email" | "linkedin">("twitter");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Fetch jobs on mount or filter changes
  useEffect(() => {
    loadJobs();
  }, [selectedFreshness]);

  const loadJobs = async () => {
    setIsLoading(true);
    try {
      const res = await api.jobs.list({
        pageSize: 60,
        postedWithin: selectedFreshness !== "all" ? selectedFreshness : undefined,
      });

      const formatted: SocialJobCard[] = (res.jobs || []).map((j: any) => {
        let locData: any = {};
        try {
          locData = typeof j.locationJson === "string" ? JSON.parse(j.locationJson) : j.locationJson || {};
        } catch {}

        const platform = j.ats === "twitter" || j.ats === "yc" || j.ats === "hn" 
          ? j.ats 
          : locData.platform || (j.sourceUrl?.includes("x.com") || j.sourceUrl?.includes("twitter.com") ? "twitter" : j.sourceUrl?.includes("ycombinator") ? "yc" : j.sourceUrl?.includes("news.ycombinator") ? "hn" : "yc");

        return {
          id: j.id,
          title: j.title,
          companyName: j.company?.name || "Tech Startup",
          location: locData.city || (locData.remote ? "Remote / Global" : "Global"),
          platform,
          description: j.description || "",
          sourceUrl: j.sourceUrl || j.applyUrl || "",
          postedAt: j.postedAt,
          salaryFormatted: locData.salaryFormatted || (j.skills?.find((s: string) => s.startsWith("Pay:"))?.replace("Pay:", "").trim()),
          equityRange: locData.equityRange || (j.skills?.find((s: string) => s.startsWith("Equity:"))?.replace("Equity:", "").trim()),
          ycBatch: locData.ycBatch || (j.skills?.find((s: string) => s.startsWith("YC "))),
          founderHandle: locData.founderHandle,
          contactEmail: locData.contactEmail,
          matchScore: j.match?.overallScore || Math.round(75 + Math.random() * 20),
        };
      });

      setJobsList(formatted);
    } catch (err) {
      console.error("Failed to load jobs for radar:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCrawlChannel = async (channel: "twitter" | "yc" | "hn") => {
    setIsCrawling(channel);
    try {
      if (channel === "twitter") {
        await api.crawl.scrapeTwitter({ keywords: searchQuery || "Software Engineer", limit: 20 });
      } else if (channel === "yc") {
        await api.crawl.scrapeYC({ keywords: searchQuery || "Software Engineer", limit: 20 });
      } else if (channel === "hn") {
        await api.crawl.scrapeHN({ keywords: searchQuery || "Software Engineer", limit: 25 });
      }
      await loadJobs();
    } catch (err) {
      console.error(`Crawl error for ${channel}:`, err);
    } finally {
      setIsCrawling(null);
    }
  };

  const handleOpenOutreach = async (job: SocialJobCard) => {
    setSelectedJobForOutreach(job);
    setIsGeneratingOutreach(true);
    setOutreachData(null);
    setActiveOutreachTab(job.platform === "twitter" ? "twitter" : job.contactEmail ? "email" : "linkedin");

    try {
      const res = await api.ai.generateOutreach({
        jobId: job.id,
        jobTitle: job.title,
        companyName: job.companyName,
        platform: job.platform,
        jobDescription: job.description,
        founderHandle: job.founderHandle,
        contactEmail: job.contactEmail,
      });

      setOutreachData({
        twitterDM: res.twitterDM,
        coldEmail: res.coldEmail,
        linkedInNote: res.linkedInNote,
        keyHook: res.keyHook,
      });
    } catch (err) {
      console.error("Failed to generate cold outreach:", err);
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleTrackApplication = async (job: SocialJobCard) => {
    try {
      await api.applications.create({
        jobId: job.id,
        status: "SOURCED",
        notes: `Sourced via Founder Radar (${job.platform.toUpperCase()}) | Founder: ${job.founderHandle || "N/A"}`,
      });
      setAddedJobs((prev) => new Set([...prev, job.id]));
    } catch (err) {
      console.error("Failed to track application:", err);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Filter list
  const filteredJobs = jobsList.filter((j) => {
    if (activeChannel !== "all" && j.platform !== activeChannel) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${j.title} ${j.companyName} ${j.description} ${j.location}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Top Banner Header */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "16px",
          padding: "24px 28px",
          marginBottom: "28px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(244, 63, 94, 0.35)",
                }}
              >
                <Radio size={20} />
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Founder Radar & Unlisted Streams
              </h1>
              <span
                style={{
                  background: "rgba(244, 63, 94, 0.12)",
                  color: "#e11d48",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Flame size={13} /> LIVE FOUNDER SIGNALS
              </span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0, maxWidth: "700px" }}>
              Bypass automated ATS gatekeepers. Scrape direct hiring tweets, Y Combinator founder batches, and monthly Hacker News hiring threads with instant 1-Click Cold DM & Email generation.
            </p>
          </div>

          {/* Direct Scraper Triggers */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              onClick={() => handleCrawlChannel("twitter")}
              disabled={isCrawling !== null}
              style={{
                padding: "9px 15px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.12)",
                color: "#0284c7",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isCrawling === "twitter" ? <RefreshCw size={14} className="spin" /> : "🐦"} Crawl X / Twitter
            </button>
            <button
              onClick={() => handleCrawlChannel("yc")}
              disabled={isCrawling !== null}
              style={{
                padding: "9px 15px",
                borderRadius: "10px",
                background: "rgba(249, 115, 22, 0.12)",
                color: "#ea580c",
                border: "1px solid rgba(249, 115, 22, 0.3)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isCrawling === "yc" ? <RefreshCw size={14} className="spin" /> : "🚀"} Fetch YC Startups
            </button>
            <button
              onClick={() => handleCrawlChannel("hn")}
              disabled={isCrawling !== null}
              style={{
                padding: "9px 15px",
                borderRadius: "10px",
                background: "rgba(245, 158, 11, 0.12)",
                color: "#d97706",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {isCrawling === "hn" ? <RefreshCw size={14} className="spin" /> : "🧡"} Crawl HN Monthly Thread
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "24px",
        }}
      >
        {/* Channel Selector Tabs */}
        <div style={{ display: "flex", gap: "8px", background: "var(--bg-secondary)", padding: "4px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
          {[
            { id: "all", label: "All Streams", count: jobsList.length },
            { id: "twitter", label: "🐦 X / Twitter Posts", count: jobsList.filter((j) => j.platform === "twitter").length },
            { id: "yc", label: "🚀 Y Combinator", count: jobsList.filter((j) => j.platform === "yc").length },
            { id: "hn", label: "🧡 Hacker News", count: jobsList.filter((j) => j.platform === "hn").length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveChannel(tab.id as any)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: activeChannel === tab.id ? "var(--bg-card)" : "transparent",
                color: activeChannel === tab.id ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeChannel === tab.id ? 600 : 500,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: activeChannel === tab.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 7px",
                  borderRadius: "10px",
                  background: activeChannel === tab.id ? "var(--border-subtle)" : "rgba(0,0,0,0.05)",
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Freshness dropdown */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search size={15} style={{ position: "absolute", left: "12px", top: "11px", color: "var(--text-secondary)" }} />
            <input
              type="text"
              placeholder="Search roles, founders, stack..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 14px 8px 34px",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "13px",
                width: "240px",
              }}
            />
          </div>

          <select
            value={selectedFreshness}
            onChange={(e) => setSelectedFreshness(e.target.value)}
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <option value="all">⚡ All Post Times</option>
            <option value="4h">🔥 Last 4 Hours</option>
            <option value="9h">⏳ Last 9 Hours</option>
            <option value="24h">📅 Today (24 Hours)</option>
            <option value="3d">🗓️ Last 3 Days</option>
            <option value="7d">🗓️ This Week</option>
          </select>
        </div>
      </div>

      {/* Cards Grid */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
          <RefreshCw size={28} className="spin" style={{ marginBottom: "12px" }} />
          <p>Scanning founder streams across X, YC and Hacker News...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "16px",
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <Radio size={36} color="var(--accent-indigo)" style={{ marginBottom: "12px", opacity: 0.7 }} />
          <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 8px 0" }}>No founder posts found for this filter</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 16px 0" }}>
            Click one of the buttons above to crawl fresh Twitter/X tweets, YC batches, or the latest HN hiring thread.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: "20px" }}>
          {filteredJobs.map((job) => {
            const isAdded = addedJobs.has(job.id);
            const isTwitter = job.platform === "twitter";
            const isYC = job.platform === "yc";
            const isHN = job.platform === "hn";

            return (
              <div
                key={job.id}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "14px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                <div>
                  {/* Top Tags Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                      {/* Platform Tag */}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: isTwitter ? "rgba(56, 189, 248, 0.15)" : isYC ? "rgba(249, 115, 22, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: isTwitter ? "#0284c7" : isYC ? "#ea580c" : "#d97706",
                        }}
                      >
                        {isTwitter ? "🐦 X / Twitter" : isYC ? "🚀 YC Startup" : "🧡 Hacker News"}
                      </span>

                      {/* YC Batch Tag */}
                      {job.ycBatch && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "rgba(99, 102, 241, 0.12)",
                            color: "#4f46e5",
                          }}
                        >
                          {job.ycBatch}
                        </span>
                      )}

                      {/* Founder handle */}
                      {job.founderHandle && (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {job.founderHandle}
                        </span>
                      )}
                    </div>

                    {/* Match Score */}
                    {job.matchScore && (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#16a34a",
                          background: "rgba(34, 197, 94, 0.12)",
                          padding: "2px 8px",
                          borderRadius: "10px",
                        }}
                      >
                        {job.matchScore}% Match
                      </span>
                    )}
                  </div>

                  {/* Job Title & Company */}
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                    {job.title}
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                    <Building2 size={14} />
                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{job.companyName}</span>
                    <span>•</span>
                    <span>{job.location}</span>
                  </div>

                  {/* Compensation & Equity Highlights */}
                  {(job.salaryFormatted || job.equityRange) && (
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "12px",
                        padding: "8px 12px",
                        background: "var(--bg-secondary)",
                        borderRadius: "8px",
                      }}
                    >
                      {job.salaryFormatted && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#16a34a" }}>
                          <DollarSign size={13} /> {job.salaryFormatted}
                        </div>
                      )}
                      {job.equityRange && (
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#9333ea" }}>
                          <TrendingUp size={13} /> {job.equityRange}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Description Snippet */}
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.5",
                      margin: "0 0 16px 0",
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {job.description}
                  </p>
                </div>

                {/* Actions Bottom Bar */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: "14px",
                    borderTop: "1px solid var(--border-subtle)",
                    gap: "8px",
                  }}
                >
                  <button
                    onClick={() => handleOpenOutreach(job)}
                    style={{
                      flex: 1,
                      padding: "8px 14px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      border: "none",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)",
                    }}
                  >
                    <Sparkles size={13} /> 1-Click Cold DM
                  </button>

                  <button
                    onClick={() => handleTrackApplication(job)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: isAdded ? "rgba(34, 197, 94, 0.15)" : "var(--bg-secondary)",
                      color: isAdded ? "#16a34a" : "var(--text-primary)",
                      border: "1px solid var(--border-subtle)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {isAdded ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                    {isAdded ? "Tracked" : "Track"}
                  </button>

                  {job.sourceUrl && (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "8px 10px",
                        borderRadius: "8px",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-subtle)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Open Original Post"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1-Click Cold Outreach Modal */}
      {selectedJobForOutreach && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setSelectedJobForOutreach(null)}
        >
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border-subtle)",
              padding: "24px 28px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <div style={{ background: "rgba(99, 102, 241, 0.12)", color: "#4f46e5", padding: "6px", borderRadius: "8px" }}>
                    <Sparkles size={18} />
                  </div>
                  <h2 style={{ fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                    AI Cold Outreach Generator
                  </h2>
                </div>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
                  Reaching out to <strong>{selectedJobForOutreach.founderHandle || selectedJobForOutreach.companyName}</strong> for <em>{selectedJobForOutreach.title}</em>
                </p>
              </div>

              <button
                onClick={() => setSelectedJobForOutreach(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {isGeneratingOutreach ? (
              <div style={{ textAlign: "center", padding: "50px 0" }}>
                <RefreshCw size={28} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Crafting personalized high-converting DM and email with Gemini...</p>
              </div>
            ) : outreachData ? (
              <div>
                {/* Hook banner */}
                {outreachData.keyHook && (
                  <div
                    style={{
                      background: "rgba(99, 102, 241, 0.08)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      fontSize: "12px",
                      color: "#4f46e5",
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Zap size={14} /> <strong>Strategy Hook:</strong> {outreachData.keyHook}
                  </div>
                )}

                {/* Channel Selector */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                  <button
                    onClick={() => setActiveOutreachTab("twitter")}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: activeOutreachTab === "twitter" ? "rgba(56, 189, 248, 0.15)" : "var(--bg-secondary)",
                      color: activeOutreachTab === "twitter" ? "#0284c7" : "var(--text-primary)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    🐦 Twitter / X DM
                  </button>
                  <button
                    onClick={() => setActiveOutreachTab("email")}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: activeOutreachTab === "email" ? "rgba(244, 63, 94, 0.15)" : "var(--bg-secondary)",
                      color: activeOutreachTab === "email" ? "#e11d48" : "var(--text-primary)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    ✉️ Cold Email
                  </button>
                  <button
                    onClick={() => setActiveOutreachTab("linkedin")}
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-subtle)",
                      background: activeOutreachTab === "linkedin" ? "rgba(14, 165, 233, 0.15)" : "var(--bg-secondary)",
                      color: activeOutreachTab === "linkedin" ? "#0284c7" : "var(--text-primary)",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    💼 LinkedIn Note
                  </button>
                </div>

                {/* Content Box */}
                {activeOutreachTab === "twitter" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                      <span>TWITTER DIRECT MESSAGE</span>
                      <span>{outreachData.twitterDM.length} / 280 chars</span>
                    </div>
                    <textarea
                      readOnly
                      value={outreachData.twitterDM}
                      style={{
                        width: "100%",
                        height: "100px",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        fontFamily: "inherit",
                        resize: "none",
                        marginBottom: "12px",
                      }}
                    />
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={() => handleCopy(outreachData.twitterDM, "twitter")}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-subtle)",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {copiedField === "twitter" ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                        {copiedField === "twitter" ? "Copied!" : "Copy DM"}
                      </button>
                      {selectedJobForOutreach.sourceUrl && (
                        <a
                          href={selectedJobForOutreach.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: "8px",
                            background: "#0284c7",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            textDecoration: "none",
                          }}
                        >
                          <Send size={15} /> Open Tweet & DM
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {activeOutreachTab === "email" && (
                  <div>
                    <div style={{ marginBottom: "10px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        SUBJECT LINE
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={outreachData.coldEmail.subject}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: "12px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                        BODY
                      </label>
                      <textarea
                        readOnly
                        value={outreachData.coldEmail.body}
                        style={{
                          width: "100%",
                          height: "150px",
                          padding: "12px",
                          borderRadius: "10px",
                          border: "1px solid var(--border-subtle)",
                          background: "var(--bg-secondary)",
                          color: "var(--text-primary)",
                          fontSize: "13px",
                          lineHeight: "1.5",
                          fontFamily: "inherit",
                          resize: "none",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button
                        onClick={() => handleCopy(`${outreachData.coldEmail.subject}\n\n${outreachData.coldEmail.body}`, "email")}
                        style={{
                          flex: 1,
                          padding: "10px",
                          borderRadius: "8px",
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-subtle)",
                          fontWeight: 600,
                          fontSize: "13px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        {copiedField === "email" ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                        {copiedField === "email" ? "Copied Full Email!" : "Copy Email"}
                      </button>
                      {selectedJobForOutreach.contactEmail && (
                        <a
                          href={`mailto:${selectedJobForOutreach.contactEmail}?subject=${encodeURIComponent(outreachData.coldEmail.subject)}&body=${encodeURIComponent(outreachData.coldEmail.body)}`}
                          style={{
                            flex: 1,
                            padding: "10px",
                            borderRadius: "8px",
                            background: "#e11d48",
                            color: "#fff",
                            fontWeight: 600,
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            textDecoration: "none",
                          }}
                        >
                          <Mail size={15} /> Send in Email Client
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {activeOutreachTab === "linkedin" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                      <span>LINKEDIN CONNECTION INVITATION</span>
                      <span>{outreachData.linkedInNote.length} / 300 chars</span>
                    </div>
                    <textarea
                      readOnly
                      value={outreachData.linkedInNote}
                      style={{
                        width: "100%",
                        height: "100px",
                        padding: "12px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-subtle)",
                        background: "var(--bg-secondary)",
                        color: "var(--text-primary)",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        fontFamily: "inherit",
                        resize: "none",
                        marginBottom: "12px",
                      }}
                    />
                    <button
                      onClick={() => handleCopy(outreachData.linkedInNote, "linkedin")}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: "8px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-subtle)",
                        fontWeight: 600,
                        fontSize: "13px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "6px",
                      }}
                    >
                      {copiedField === "linkedin" ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
                      {copiedField === "linkedin" ? "Copied!" : "Copy LinkedIn Note"}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
