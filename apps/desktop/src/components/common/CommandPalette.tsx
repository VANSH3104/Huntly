import React, { useEffect } from "react";
import { Command } from "cmdk";
import { useStore } from "../../store/useStore";
import {
  Search,
  Briefcase,
  Cpu,
  Compass,
  FileText,
  BarChart3,
  Settings,
  Flame,
  CheckCircle2,
} from "lucide-react";
import { api } from "../../lib/api";
import type { NavTab } from "../../types";

export const CommandPalette: React.FC = () => {
  const {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    setCurrentTab,
    setSelectedJobId,
  } = useStore();

  const [search, setSearch] = React.useState("");
  const [crawlStatus, setCrawlStatus] = React.useState<string | null>(null);

  // Toggle with Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsCommandPaletteOpen(!isCommandPaletteOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isCommandPaletteOpen, setIsCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const navigateTo = (tab: NavTab) => {
    setCurrentTab(tab);
    setIsCommandPaletteOpen(false);
  };

  const triggerCrawlNow = async () => {
    setCrawlStatus("Starting crawl...");
    try {
      await api.crawl.start({ scope: "quick" });
      setCrawlStatus("Crawl launched!");
      setTimeout(() => {
        setIsCommandPaletteOpen(false);
        setCurrentTab("discovery");
      }, 700);
    } catch (err: any) {
      setCrawlStatus(`Failed: ${err.message}`);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsCommandPaletteOpen(false);
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "600px",
          overflow: "hidden",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        <Command
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "16px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <Search size={18} color="var(--accent-cyan)" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search commands, navigate, or trigger discovery..."
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                fontSize: "15px",
                color: "var(--text-primary)",
                padding: 0,
              }}
              autoFocus
            />
            <kbd
              style={{
                background: "var(--bg-surface)",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "11px",
                color: "var(--text-muted)",
              }}
            >
              ESC
            </kbd>
          </div>

          {crawlStatus && (
            <div
              style={{
                padding: "8px 20px",
                background: "rgba(6, 182, 212, 0.1)",
                color: "var(--accent-cyan)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <CheckCircle2 size={14} /> {crawlStatus}
            </div>
          )}

          <Command.List
            style={{
              maxHeight: "360px",
              overflowY: "auto",
              padding: "8px",
            }}
          >
            <Command.Empty
              style={{
                padding: "24px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              No matching results found.
            </Command.Empty>

            <Command.Group
              heading="Actions"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                padding: "8px 12px 4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <Command.Item
                onSelect={triggerCrawlNow}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <Flame size={16} color="var(--accent-amber)" />
                <span style={{ flex: 1 }}>Trigger Instant Web & ATS Crawl</span>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  Execute query generation
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Navigation"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "var(--text-muted)",
                padding: "8px 12px 4px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <Command.Item
                onSelect={() => navigateTo("dashboard")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <Cpu size={16} color="var(--accent-cyan)" />
                <span>Go to Intelligence Dashboard</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("jobs")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <Briefcase size={16} color="var(--accent-blue)" />
                <span>Browse Verified Jobs & Matches</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("discovery")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <Compass size={16} color="var(--accent-emerald)" />
                <span>Career Page Discovery & ATS Monitor</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("applications")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <CheckCircle2 size={16} color="var(--accent-purple)" />
                <span>Applications Kanban Board</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("resume")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <FileText size={16} color="var(--accent-cyan)" />
                <span>Resume Studio & LaTeX Tailoring</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("analytics")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <BarChart3 size={16} color="var(--accent-amber)" />
                <span>Analytics & Market Insights</span>
              </Command.Item>

              <Command.Item
                onSelect={() => navigateTo("settings")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <Settings size={16} color="var(--text-secondary)" />
                <span>Settings & API Configuration</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
