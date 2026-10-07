import React, { useState } from "react";
import { useStore } from "../../store/useStore";
import {
  Search,
  Flame,
  Bell,
  RefreshCw,
  Sun,
  Moon,
} from "lucide-react";
import { api } from "../../lib/api";

export const Header: React.FC = () => {
  const {
    currentTab,
    setIsCommandPaletteOpen,
    setIsNotificationPanelOpen,
    isNotificationPanelOpen,
    theme,
    setTheme,
    toggleTheme,
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
        height: "56px",
        padding: "0 28px",
        backgroundColor: "var(--bg-header)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 10,
        flexShrink: 0,
      }}
    >
      {/* Title & View status */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <h1
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {getPageTitle()}
        </h1>
      </div>

      {/* Center / Right controls */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {/* Cmd+K Search trigger */}
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            backgroundColor: "var(--bg-input)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-secondary)",
            fontSize: "12.5px",
            cursor: "pointer",
            width: "240px",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--border-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-subtle)";
          }}
        >
          <Search size={14} color="var(--text-muted)" />
          <span style={{ flex: 1, textAlign: "left", fontSize: "12px" }}>Search jobs, commands...</span>
          <kbd
            style={{
              padding: "1px 5px",
              backgroundColor: "rgba(120, 100, 80, 0.08)",
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
          className="btn btn-secondary"
          onClick={handleQuickCrawl}
          disabled={isCrawling}
          style={{
            height: "32px",
            padding: "0 12px",
            fontSize: "12px",
          }}
        >
          {isCrawling ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <Flame size={13} color="var(--accent-amber)" />
          )}
          <span>{isCrawling ? "Discovering..." : "Run Discovery"}</span>
        </button>

        {crawlMessage && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--accent-emerald)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {crawlMessage}
          </span>
        )}

        {/* Theme Palette Selector */}
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
          style={{
            height: "32px",
            padding: "0 8px 0 10px",
            fontSize: "12px",
            fontWeight: 500,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
          title="Select Aesthetic Color Palette"
        >
          <option value="soft-sand">🏖️ Soft Sand (Default)</option>
          <option value="soft-peachy">🍑 Soft Peachy</option>
          <option value="pastel-bliss">🌸 Pastel Bliss</option>
          <option value="pastel-dreamland">✨ Pastel Dreamland</option>
          <option value="dark">🌑 Obsidian Dark</option>
        </select>

        {/* Notifications Button */}
        <button
          className="btn-icon btn-secondary"
          onClick={() => setIsNotificationPanelOpen(!isNotificationPanelOpen)}
          style={{ position: "relative", width: "32px", height: "32px" }}
          title="Notifications"
        >
          <Bell size={14} />
          <span
            style={{
              position: "absolute",
              top: "7px",
              right: "7px",
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "var(--accent-indigo)",
            }}
          />
        </button>
      </div>
    </header>
  );
};
