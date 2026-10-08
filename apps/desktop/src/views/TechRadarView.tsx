import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
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
  HiOutlineArrowTopRightOnSquare,
  HiOutlineLightBulb,
  HiOutlineCodeBracket,
  HiOutlineArrowPath,
  HiOutlineMagnifyingGlass,
  HiOutlineChatBubbleLeftRight,
  HiOutlineClock,
  HiOutlineChevronLeft,
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

export const TechRadarView: React.FC = () => {
  const [feed, setFeed] = useState<IntelCard[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Horizontal Scroller Ref
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  const scrollLeft = () => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollBy({ left: -380, behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollBy({ left: 380, behavior: "smooth" });
    }
  };

  const getSourceIcon = (source: string) => {
    if (source.includes("Hacker") || source.includes("HN")) {
      return <SiYcombinator color="#ff6600" size={15} />;
    }
    if (source.includes("GitHub")) {
      return <SiGithub size={15} />;
    }
    if (source.includes("arXiv")) {
      return <SiArxiv color="#b31b1b" size={15} />;
    }
    return <SiHuggingface color="#ffd21e" size={15} />;
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

  // Featured top 6 stories for horizontal scroller
  const featuredStories = feed.slice(0, 6);

  return (
    <div
      style={{
        flex: 1,
        height: "100%",
        overflowY: "auto",
        padding: "28px 32px 60px 32px",
        width: "100%",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* Top Banner Header */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "16px",
            padding: "24px 28px",
            marginBottom: "28px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.02)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "18px" }}>
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
                    boxShadow: "0 4px 14px rgba(99, 102, 241, 0.3)",
                  }}
                >
                  <HiSparkles size={20} />
                </div>
                <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                  Tech & AI Intelligence Radar
                </h1>
                <span
                  style={{
                    background: "rgba(99, 102, 241, 0.1)",
                    color: "var(--accent-indigo)",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <HiBolt size={13} /> LIVE SOURCE STREAM
                </span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0, maxWidth: "700px", lineHeight: "1.5" }}>
                Real-time web crawler scanning Hacker News frontpage, arXiv releases, and AI engineering breakthroughs with direct source links.
              </p>
            </div>

            {/* Sync status & Refresh button */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                <HiOutlineArrowPath size={15} className={isRefreshing ? "spin" : ""} />
                {isRefreshing ? "Scanning Live..." : "Scrape Latest News"}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Featured Horizontal Card Scroller Section */}
        {featuredStories.length > 0 && (
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    background: "rgba(244, 63, 94, 0.12)",
                    color: "#e11d48",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  <HiFire size={15} /> BREAKING TECH STREAMS
                </div>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>
                  Top trending stories across HN & arXiv
                </span>
              </div>

              {/* Scroller Control Arrows */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={scrollLeft}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  title="Scroll Left"
                >
                  <HiOutlineChevronLeft size={16} />
                </button>
                <button
                  onClick={scrollRight}
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                  title="Scroll Right"
                >
                  <HiOutlineChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Horizontal Scroller Container */}
            <div
              ref={scrollerRef}
              style={{
                display: "flex",
                gap: "16px",
                overflowX: "auto",
                scrollSnapType: "x mandatory",
                paddingBottom: "8px",
                scrollbarWidth: "thin",
              }}
            >
              {featuredStories.map((story) => (
                <motion.div
                  key={story.id}
                  whileHover={{ y: -3, transition: { duration: 0.15 } }}
                  style={{
                    flex: "0 0 360px",
                    scrollSnapAlign: "start",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "14px",
                    padding: "18px 20px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "2px 7px",
                            borderRadius: "6px",
                            background: story.source.includes("Hacker") ? "rgba(255, 102, 0, 0.12)" : "rgba(99, 102, 241, 0.12)",
                            color: story.source.includes("Hacker") ? "#ea580c" : "#4f46e5",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {getSourceIcon(story.source)}
                          {story.source}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600 }}>
                        {story.score > 0 && (
                          <span style={{ color: "#e11d48" }}>{story.score} ▲</span>
                        )}
                        <span>⏱️ {story.readTime}</span>
                      </div>
                    </div>

                    <a
                      href={story.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        textDecoration: "none",
                        lineHeight: "1.4",
                        marginBottom: "8px",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {story.title}
                    </a>

                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        lineHeight: "1.5",
                        margin: "0 0 12px 0",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {story.executiveSummary}
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", paddingTop: "10px", borderTop: "1px solid var(--border-subtle)" }}>
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: "var(--bg-secondary)",
                        color: "var(--accent-indigo)",
                        fontSize: "12px",
                        fontWeight: 600,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      Open Source Link <HiOutlineArrowTopRightOnSquare size={13} />
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Control Bar: Categories & Search */}
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
                    padding: "7px 14px",
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
              placeholder="Search topics, models, tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: "8px 14px 8px 36px",
                borderRadius: "10px",
                border: "1px solid var(--border-subtle)",
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                fontSize: "13px",
                width: "260px",
                outline: "none",
              }}
            />
          </div>
        </div>

        {/* Main Intelligence Grid */}
        {isLoading && feed.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
            <HiOutlineArrowPath size={32} className="spin" style={{ color: "var(--accent-indigo)", marginBottom: "12px" }} />
            <p style={{ fontSize: "14px", fontWeight: 500 }}>Scanning Hacker News, arXiv, and web intelligence streams...</p>
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
              Click the button above to scrape fresh technical stories and direct source links.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
              gap: "20px",
            }}
          >
            {filteredFeed.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(idx * 0.03, 0.25) }}
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "14px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                <div>
                  {/* Card Top Meta */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
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
                          gap: "4px",
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

                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-secondary)", fontWeight: 500 }}>
                      {item.score > 0 && (
                        <span style={{ color: "#e11d48", fontWeight: 700 }}>{item.score} ▲</span>
                      )}
                      {item.commentsCount > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                          <HiOutlineChatBubbleLeftRight size={12} /> {item.commentsCount}
                        </span>
                      )}
                      <span>⏱️ {item.readTime}</span>
                    </div>
                  </div>

                  {/* Headline Link */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "16px",
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
                    <HiOutlineArrowTopRightOnSquare size={13} style={{ flexShrink: 0, marginTop: "4px", opacity: 0.5 }} />
                  </a>

                  {/* Executive Summary */}
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      lineHeight: "1.55",
                      margin: "0 0 14px 0",
                    }}
                  >
                    {item.executiveSummary}
                  </p>

                  {/* Technical Highlights Box */}
                  {item.technicalHighlights && item.technicalHighlights.length > 0 && (
                    <div
                      style={{
                        background: "var(--bg-secondary)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        marginBottom: "12px",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "var(--accent-indigo)",
                          marginBottom: "6px",
                          letterSpacing: "0.04em",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <HiBolt size={12} /> TECHNICAL HIGHLIGHTS & SPECS
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "14px", fontSize: "12px", color: "var(--text-primary)", lineHeight: "1.45" }}>
                        {item.technicalHighlights.map((hl, i) => (
                          <li key={i} style={{ marginBottom: i < item.technicalHighlights.length - 1 ? "3px" : "0" }}>
                            {hl}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Takeaway */}
                  {item.practicalImpact && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#16a34a",
                        fontWeight: 500,
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "5px",
                      }}
                    >
                      <HiOutlineLightBulb size={14} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <span>
                        <strong>Takeaway:</strong> {item.practicalImpact}
                      </span>
                    </div>
                  )}

                  {/* Concept Tags */}
                  {item.keyConcepts && (
                    <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "14px" }}>
                      {item.keyConcepts.map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "11px",
                            padding: "2px 7px",
                            borderRadius: "4px",
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
                    justifyContent: "flex-end",
                    alignItems: "center",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: "12px",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)",
                    }}
                  >
                    Open Source Discussion <HiOutlineArrowTopRightOnSquare size={13} />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
