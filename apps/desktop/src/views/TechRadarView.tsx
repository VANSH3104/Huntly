import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../lib/api";
import {
  SiYcombinator,
  SiGithub,
  SiHuggingface,
  SiArxiv,
} from "react-icons/si";
import {
  HiSparkles,
  HiFire,
  HiBolt,
  HiOutlineBookOpen,
  HiOutlineArrowTopRightOnSquare,
  HiOutlineLightBulb,
  HiOutlineCodeBracket,
  HiOutlineArrowPath,
  HiOutlineMagnifyingGlass,
  HiOutlineCheck,
  HiOutlineClipboardDocument,
  HiXMark,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
  HiOutlineChevronRight,
  HiOutlineQueueList,
} from "react-icons/hi2";

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
      setLastUpdated(
        res.lastUpdated
          ? new Date(res.lastUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : ""
      );
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

  const getSourceIcon = (source: string) => {
    if (source.includes("Hacker") || source.includes("HN")) {
      return <SiYcombinator color="#ff6600" size={16} />;
    }
    if (source.includes("GitHub")) {
      return <SiGithub size={16} />;
    }
    if (source.includes("arXiv")) {
      return <SiArxiv color="#b31b1b" size={16} />;
    }
    return <SiHuggingface color="#ffd21e" size={16} />;
  };

  const categories = [
    { id: "all", label: "All Streams", icon: HiOutlineQueueList },
    { id: "AI & Models", label: "AI Models & LLMs", icon: HiSparkles },
    { id: "Agentic Systems", label: "Agentic Systems", icon: HiBolt },
    { id: "Dev Tools & Infra", label: "Tools & Infra", icon: HiOutlineCodeBracket },
    { id: "Architecture & Specs", label: "Architecture", icon: HiOutlineLightBulb },
    { id: "Discussions", label: "Top Discussions", icon: HiOutlineChatBubbleLeftRight },
  ];

  const filteredFeed = feed.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.executiveSummary.toLowerCase().includes(q) ||
      item.keyConcepts.some((k) => k.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Live Breaking News Ticker Scroller */}
      {feed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: "linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, rgba(236, 72, 153, 0.08) 100%)",
            border: "1px solid rgba(99, 102, 241, 0.2)",
            borderRadius: "12px",
            padding: "10px 16px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontWeight: 700,
              fontSize: "12px",
              color: "#e11d48",
              background: "rgba(244, 63, 94, 0.12)",
              padding: "4px 10px",
              borderRadius: "8px",
              flexShrink: 0,
            }}
          >
            <HiFire size={14} /> LIVE TICKER
          </div>

          <div
            style={{
              overflow: "hidden",
              position: "relative",
              flex: 1,
              maskImage: "linear-gradient(to right, transparent, black 3%, black 97%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 3%, black 97%, transparent)",
            }}
          >
            <div className="animate-marquee-track" style={{ display: "flex", gap: "36px", alignItems: "center" }}>
              {[...feed.slice(0, 10), ...feed.slice(0, 10)].map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    color: "var(--text-primary)",
                    textDecoration: "none",
                    fontWeight: 500,
                    flexShrink: 0,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--accent-indigo)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                >
                  {getSourceIcon(item.source)}
                  <span style={{ maxWidth: "340px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </span>
                  {item.score > 0 && (
                    <span style={{ fontSize: "11px", color: "var(--accent-indigo)", fontWeight: 600, background: "rgba(99, 102, 241, 0.1)", padding: "1px 6px", borderRadius: "4px" }}>
                      {item.score} ▲
                    </span>
                  )}
                  <HiOutlineChevronRight size={12} style={{ opacity: 0.4 }} />
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Main Header Banner */}
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "18px",
          padding: "26px 30px",
          marginBottom: "28px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.02)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  boxShadow: "0 4px 16px rgba(99, 102, 241, 0.35)",
                }}
              >
                <HiSparkles size={20} />
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
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
                <HiBolt size={13} /> CURATED INTELLIGENCE
              </span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0, maxWidth: "740px", lineHeight: "1.5" }}>
              Live web crawler monitoring Hacker News top stories, new AI models, open-source repositories, and engineering architecture breakdowns—distilled into actionable, readable material.
            </p>
          </div>

          {/* Refresh Action */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {lastUpdated && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                <HiOutlineClock size={14} /> Synced at {lastUpdated}
              </div>
            )}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleManualRefresh}
              disabled={isRefreshing || isLoading}
              style={{
                padding: "10px 18px",
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
                boxShadow: "0 2px 12px rgba(99, 102, 241, 0.3)",
              }}
            >
              <HiOutlineArrowPath size={16} className={isRefreshing ? "spin" : ""} />
              {isRefreshing ? "Crawling & Synthesizing..." : "Scrape & Synthesize Live Intel"}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Control Bar: Categories & Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "14px",
          marginBottom: "26px",
        }}
      >
        {/* Animated Category Pills */}
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            background: "var(--bg-secondary)",
            padding: "4px",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: isSelected ? "var(--bg-card)" : "transparent",
                  color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                  fontWeight: isSelected ? 600 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  boxShadow: isSelected ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                }}
              >
                <Icon size={15} color={isSelected ? "var(--accent-indigo)" : "currentColor"} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Box */}
        <div style={{ position: "relative" }}>
          <HiOutlineMagnifyingGlass
            size={16}
            style={{ position: "absolute", left: "12px", top: "11px", color: "var(--text-secondary)" }}
          />
          <input
            type="text"
            placeholder="Search keywords, models, tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "9px 14px 9px 36px",
              borderRadius: "10px",
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              fontSize: "13px",
              width: "280px",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Intelligence Feed Grid */}
      {isLoading && feed.length === 0 ? (
        <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
          <HiOutlineArrowPath size={36} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "14px" }} />
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
          <HiSparkles size={36} color="var(--accent-indigo)" style={{ marginBottom: "12px", opacity: 0.7 }} />
          <h3 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 8px 0" }}>No intelligence digests found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "13px", margin: "0 0 16px 0" }}>
            Click the button above to scrape fresh technical stories and synthesize readable breakdowns.
          </p>
        </div>
      ) : (
        <motion.div
          layout
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
            gap: "24px",
          }}
        >
          <AnimatePresence>
            {filteredFeed.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.3) }}
                whileHover={{ y: -3, transition: { duration: 0.15 } }}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "16px",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.02)",
                  position: "relative",
                }}
              >
                <div>
                  {/* Top Meta Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          background: item.source.includes("Hacker") ? "rgba(255, 102, 0, 0.12)" : "rgba(99, 102, 241, 0.12)",
                          color: item.source.includes("Hacker") ? "#ea580c" : "#4f46e5",
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                        }}
                      >
                        {getSourceIcon(item.source)}
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
                        <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "#e11d48", fontWeight: 700 }}>
                          <HiFire size={14} /> {item.score}
                        </span>
                      )}
                      {item.commentsCount > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                          <HiOutlineChatBubbleLeftRight size={13} /> {item.commentsCount}
                        </span>
                      )}
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }}>
                        <HiOutlineClock size={13} /> {item.readTime}
                      </span>
                    </div>
                  </div>

                  {/* Headline */}
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
                    <HiOutlineArrowTopRightOnSquare size={14} style={{ flexShrink: 0, marginTop: "4px", opacity: 0.6 }} />
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

                  {/* Technical Highlights & Specs Glass Box */}
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
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--accent-indigo)",
                          marginBottom: "8px",
                          letterSpacing: "0.04em",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <HiBolt size={13} /> TECHNICAL HIGHLIGHTS & SPECS
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

                  {/* Practical Takeaway Callout */}
                  {item.practicalImpact && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#16a34a",
                        fontWeight: 500,
                        marginBottom: "14px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "6px",
                      }}
                    >
                      <HiOutlineLightBulb size={15} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span>
                        <strong>Takeaway:</strong> {item.practicalImpact}
                      </span>
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

                {/* Bottom Action Bar */}
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
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleOpenDeepDive(item)}
                    style={{
                      flex: 1,
                      padding: "9px 14px",
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
                    <HiOutlineBookOpen size={15} color="var(--accent-indigo)" />
                    Deep-Dive Architecture
                  </motion.button>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "9px 14px",
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
                    Source <HiOutlineArrowTopRightOnSquare size={13} />
                  </a>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Deep-Dive Architectural Breakdown Modal */}
      {selectedForDeepDive && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={() => setSelectedForDeepDive(null)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            style={{
              background: "var(--bg-card)",
              borderRadius: "18px",
              width: "100%",
              maxWidth: "780px",
              maxHeight: "88vh",
              overflowY: "auto",
              boxShadow: "0 24px 48px rgba(0,0,0,0.25)",
              border: "1px solid var(--border-subtle)",
              padding: "30px 34px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <div style={{ background: "rgba(99, 102, 241, 0.12)", color: "#4f46e5", padding: "6px", borderRadius: "8px" }}>
                    <HiOutlineBookOpen size={18} />
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
                <HiXMark size={22} />
              </button>
            </div>

            {isLoadingDeepDive ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <HiOutlineArrowPath size={30} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "12px" }} />
                <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Synthesizing architectural specifications with Gemini...</p>
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

                {/* Code Snippet Box */}
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
                        {copiedCode ? <HiOutlineCheck size={14} color="#16a34a" /> : <HiOutlineClipboardDocument size={14} />}
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
                      marginBottom: "22px",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                      🎯 Key Engineering Lessons:
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
                      padding: "10px 20px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "13px",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 2px 10px rgba(99, 102, 241, 0.3)",
                    }}
                  >
                    Open Original Source <HiOutlineArrowTopRightOnSquare size={14} />
                  </a>
                </div>
              </div>
            ) : null}
          </motion.div>
        </div>
      )}
    </div>
  );
};
