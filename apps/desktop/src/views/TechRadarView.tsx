import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import {
  Sparkles,
  RefreshCw,
  Search,
  ExternalLink,
  BookOpen,
  Zap,
  TrendingUp,
  Cpu,
  Layers,
  MessageSquare,
  Flame,
  X,
  Code2,
  Check,
  Copy,
} from "lucide-react";

interface IntelCard {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string;
  score: number;
  commentsCount: number;
  readTime: string;
  publishedAt: string;
  executiveSummary: string;
  technicalHighlights: string[];
  practicalImpact: string;
  keyConcepts: string[];
}

interface DeepDiveData {
  title: string;
  architectureOverview: string;
  markdownContent: string;
  codeExample?: string;
  takeaways: string[];
}

export const TechRadarView: React.FC = () => {
  const [feed, setFeed] = useState<IntelCard[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Deep dive modal state
  const [selectedForDeepDive, setSelectedForDeepDive] = useState<IntelCard | null>(null);
  const [deepDiveData, setDeepDiveData] = useState<DeepDiveData | null>(null);
  const [isLoadingDeepDive, setIsLoadingDeepDive] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    loadFeed();
  }, [activeCategory]);

  const loadFeed = async (force = false) => {
    setIsLoading(true);
    try {
      const res = await api.intel.getFeed({
        category: activeCategory !== "all" ? activeCategory : undefined,
        q: searchQuery || undefined,
        force,
      });
      setFeed(res.feed || []);
      setLastUpdated(res.lastUpdated ? new Date(res.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");
    } catch (err) {
      console.error("Failed to load tech intel feed:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    loadFeed(true);
  };

  const handleOpenDeepDive = async (card: IntelCard) => {
    setSelectedForDeepDive(card);
    setIsLoadingDeepDive(true);
    setDeepDiveData(null);

    try {
      const res = await api.intel.deepDive({
        title: card.title,
        summary: card.executiveSummary,
        url: card.url,
      });
      setDeepDiveData(res);
    } catch (err) {
      console.error("Failed to fetch deep dive breakdown:", err);
    } finally {
      setIsLoadingDeepDive(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredFeed = feed.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.executiveSummary.toLowerCase().includes(q) ||
      item.keyConcepts.some((k) => k.toLowerCase().includes(q))
    );
  });

  const categories = [
    { id: "all", label: "⚡ All Intelligence" },
    { id: "AI & Models", label: "🤖 AI & Models" },
    { id: "Agentic Systems", label: "⚡ Agentic Systems" },
    { id: "Dev Tools & Infra", label: "🛠️ Dev Tools & Infra" },
    { id: "Architecture & Specs", label: "📐 Architecture & Specs" },
    { id: "Discussions", label: "💬 Top HN Discussions" },
  ];

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
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
                }}
              >
                <Cpu size={20} />
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Tech & AI Intelligence Radar
              </h1>
              <span
                style={{
                  background: "rgba(99, 102, 241, 0.12)",
                  color: "#4f46e5",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  fontSize: "11px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Sparkles size={13} /> AI-SYNTHESIZED DIGESTS
              </span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0, maxWidth: "720px" }}>
              Continuous web crawler monitoring Hacker News top stories, new AI models, agentic frameworks, and engineering architecture breakdowns—synthesized into actionable, readable material.
            </p>
          </div>

          {/* Refresh Action */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {lastUpdated && (
              <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                Synced: {lastUpdated}
              </span>
            )}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || isLoading}
              style={{
                padding: "9px 16px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 2px 10px rgba(99, 102, 241, 0.25)",
              }}
            >
              <RefreshCw size={14} className={isRefreshing ? "spin" : ""} />
              {isRefreshing ? "Scanning Web..." : "Scrape & Synthesize Live Intel"}
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
        {/* Category Tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", background: "var(--bg-secondary)", padding: "4px", borderRadius: "12px", border: "1px solid var(--border-subtle)" }}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                padding: "7px 14px",
                borderRadius: "8px",
                border: "none",
                background: activeCategory === cat.id ? "var(--bg-card)" : "transparent",
                color: activeCategory === cat.id ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: activeCategory === cat.id ? 600 : 500,
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: activeCategory === cat.id ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Filter */}
        <div style={{ position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: "12px", top: "11px", color: "var(--text-secondary)" }} />
          <input
            type="text"
            placeholder="Filter by keyword, model, concept..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "8px 14px 8px 34px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "13px",
              width: "280px",
            }}
          />
        </div>
      </div>

      {/* Intelligence Cards Grid */}
      {isLoading && feed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
          <RefreshCw size={32} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "14px" }} />
          <p style={{ fontSize: "15px", fontWeight: 500 }}>Scanning Hacker News, arXiv, and web intelligence streams...</p>
        </div>
      ) : filteredFeed.length === 0 ? (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "16px",
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <Cpu size={36} color="var(--accent-indigo)" style={{ marginBottom: "12px", opacity: 0.7 }} />
          <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 8px 0" }}>No intelligence items found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 16px 0" }}>
            Click the button above to scrape fresh technical stories and synthesize readable breakdowns.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: "22px" }}>
          {filteredFeed.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "16px",
                padding: "22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div>
                {/* Meta Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: item.source.includes("Hacker") ? "rgba(249, 115, 22, 0.15)" : "rgba(99, 102, 241, 0.15)",
                        color: item.source.includes("Hacker") ? "#ea580c" : "#4f46e5",
                      }}
                    >
                      {item.source}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {item.category}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {item.score > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "#e11d48", fontWeight: 600 }}>
                        <Flame size={13} /> {item.score}
                      </span>
                    )}
                    {item.commentsCount > 0 && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <MessageSquare size={13} /> {item.commentsCount}
                      </span>
                    )}
                    <span>⏱️ {item.readTime}</span>
                  </div>
                </div>

                {/* Title */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    lineHeight: "1.4",
                    marginBottom: "10px",
                    display: "inline-flex",
                    alignItems: "flex-start",
                    gap: "6px",
                  }}
                >
                  <span>{item.title}</span>
                  <ExternalLink size={14} style={{ flexShrink: 0, marginTop: "4px", opacity: 0.6 }} />
                </a>

                {/* Executive Summary */}
                <p
                  style={{
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    lineHeight: "1.6",
                    margin: "0 0 14px 0",
                  }}
                >
                  {item.executiveSummary}
                </p>

                {/* Technical Highlights & Specs Box */}
                {item.technicalHighlights && item.technicalHighlights.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-secondary)",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      marginBottom: "14px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent-indigo)", marginBottom: "8px", letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
                      <Zap size={12} /> TECHNICAL HIGHLIGHTS & SPECS
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.5" }}>
                      {item.technicalHighlights.map((hl, i) => (
                        <li key={i} style={{ marginBottom: i < item.technicalHighlights.length - 1 ? "4px" : "0" }}>
                          {hl}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Practical Impact for Engineers */}
                {item.practicalImpact && (
                  <div style={{ fontSize: "12px", color: "#16a34a", fontWeight: 500, marginBottom: "14px", display: "flex", alignItems: "flex-start", gap: "6px" }}>
                    <TrendingUp size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span><strong>Takeaway:</strong> {item.practicalImpact}</span>
                  </div>
                )}

                {/* Concept Tags */}
                {item.keyConcepts && (
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                    {item.keyConcepts.map((tag, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          fontWeight: 500,
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Bottom Bar */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingTop: "14px",
                  borderTop: "1px solid var(--border-subtle)",
                  gap: "10px",
                }}
              >
                <button
                  onClick={() => handleOpenDeepDive(item)}
                  style={{
                    flex: 1,
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-subtle)",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  <BookOpen size={14} color="var(--accent-indigo)" />
                  Deep-Dive Architecture
                </button>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: "rgba(99, 102, 241, 0.1)",
                    color: "var(--accent-indigo)",
                    fontWeight: 600,
                    fontSize: "12px",
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  Read Source <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deep Dive Breakdown Modal */}
      {selectedForDeepDive && (
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
          onClick={() => setSelectedForDeepDive(null)}
        >
          <div
            style={{
              background: "var(--bg-card)",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "760px",
              maxHeight: "88vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border-subtle)",
              padding: "28px 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ background: "rgba(99, 102, 241, 0.12)", color: "#4f46e5", padding: "6px", borderRadius: "8px" }}>
                    <BookOpen size={18} />
                  </div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent-indigo)", textTransform: "uppercase" }}>
                    Architectural Deep-Dive
                  </span>
                </div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "var(--text-primary)", lineHeight: "1.3" }}>
                  {selectedForDeepDive.title}
                </h2>
              </div>

              <button
                onClick={() => setSelectedForDeepDive(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
              >
                <X size={20} />
              </button>
            </div>

            {isLoadingDeepDive ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <RefreshCw size={28} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Synthesizing architectural specifications and practical lessons with Gemini...</p>
              </div>
            ) : deepDiveData ? (
              <div>
                {/* Architecture Overview Banner */}
                {deepDiveData.architectureOverview && (
                  <div
                    style={{
                      background: "rgba(99, 102, 241, 0.08)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      borderRadius: "12px",
                      padding: "14px 18px",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                      marginBottom: "20px",
                      lineHeight: "1.6",
                    }}
                  >
                    <strong style={{ color: "var(--accent-indigo)", display: "block", marginBottom: "4px" }}>
                      Executive Architecture Summary:
                    </strong>
                    {deepDiveData.architectureOverview}
                  </div>
                )}

                {/* Markdown Content Body */}
                <div
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.7",
                    color: "var(--text-primary)",
                    marginBottom: "24px",
                    whiteSpace: "pre-line",
                  }}
                >
                  {deepDiveData.markdownContent}
                </div>

                {/* Code Example if present */}
                {deepDiveData.codeExample && (
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em" }}>
                        IMPLEMENTATION / SCHEMA SNIPPET
                      </span>
                      <button
                        onClick={() => handleCopyCode(deepDiveData.codeExample!)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--accent-indigo)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {copiedCode ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                        {copiedCode ? "Copied" : "Copy Code"}
                      </button>
                    </div>
                    <pre
                      style={{
                        background: "var(--bg-secondary)",
                        padding: "14px 16px",
                        borderRadius: "10px",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "12px",
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-primary)",
                        overflowX: "auto",
                      }}
                    >
                      <code>{deepDiveData.codeExample}</code>
                    </pre>
                  </div>
                )}

                {/* Key Takeaways */}
                {deepDiveData.takeaways && deepDiveData.takeaways.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-secondary)",
                      borderRadius: "12px",
                      padding: "16px",
                      border: "1px solid var(--border-subtle)",
                      marginBottom: "20px",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      🎯 Key Engineering Takeaways:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                      {deepDiveData.takeaways.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <a
                    href={selectedForDeepDive.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "10px 18px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "13px",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    Open Original Source <ExternalLink size={14} />
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
