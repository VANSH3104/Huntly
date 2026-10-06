import React, { useState } from "react";
import { useStore } from "../../store/useStore";
import {
  Search,
  Flame,
  Bell,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle,
} from "lucide-react";
import { api } from "../../lib/api";

export const Header: React.FC = () => {
  const {
    currentTab,
    setIsCommandPaletteOpen,
    setIsNotificationPanelOpen,
    isNotificationPanelOpen,
  } = useStore();

  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlMessage, setCrawlMessage] = useState<string | null>(null);

  const getPageTitle = () => {
    switch (currentTab) {
      case "dashboard":
        return "Recruiting Intelligence Hub";
      case "jobs":
        return "Verified Job Feed & Match Explorer";
      case "discovery":
        return "Autonomous Career Page & ATS Discovery";
      case "applications":
        return "Application Funnel & Kanban";
      case "resume":
        return "Resume Studio & LaTeX Tailoring";
      case "analytics":
        return "Market & Compensation Analytics";
      case "settings":
        return "System Settings & Keys";
      default:
        return "AgentForge";
    }
  };

  const handleQuickCrawl = async () => {
    try {
      setIsCrawling(true);
      setCrawlMessage("Launching crawl...");
      await api.crawl.start({ scope: "quick" });
      setCrawlMessage("Crawl worker active!");
      setTimeout(() => setCrawlMessage(null), 3000);
    } catch (err: any) {
      setCrawlMessage(`Error: ${err.message}`);
      setTimeout(() => setCrawlMessage(null), 4000);
    } finally {
      setIsCrawling(false);
    }
  };

  return (
    <header
      style={{
        height: "64px",
        padding: "0 32px",
        backgroundColor: "rgba(15, 20, 32, 0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Title */}
      <div>
        <h1
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {getPageTitle()}
        </h1>
      </div>

      {/* Center / Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* Cmd+K Search trigger */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 16px",
            backgroundColor: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
            fontSize: "13px",
            cursor: "pointer",
            width: "260px",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--border-active)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          <Search size={15} color="var(--text-muted)" />
          <span style={{ flex: 1, textAlign: "left" }}>Search jobs, commands...</span>
          <kbd
            style={{
              padding: "2px 6px",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "4px",
              fontSize: "10px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            ⌘K
          </kbd>
        </button>

        {/* Trigger Crawl Button */}
        <button
          className="btn btn-primary"
          onClick={handleQuickCrawl}
          disabled={isCrawling}
          style={{
            height: "36px",
            padding: "0 14px",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {isCrawling ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <Flame size={14} />
          )}
          <span>{isCrawling ? "Discovering..." : "Run Discovery"}</span>
        </button>

        {crawlMessage && (
          <span
            style={{
              fontSize: "12px",
              color: "var(--accent-cyan)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {crawlMessage}
          </span>
        )}

        {/* Notifications Button */}
        <button
          className="btn-icon btn-secondary"
          onClick={() => setIsNotificationPanelOpen(!isNotificationPanelOpen)}
          style={{ position: "relative" }}
          title="Notifications"
        >
          <Bell size={16} />
          <span
            style={{
              position: "absolute",
              top: "6px",
              right: "6px",
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "var(--accent-cyan)",
            }}
          />
        </button>
      </div>
    </header>
  );
};
