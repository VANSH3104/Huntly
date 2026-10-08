import React from "react";
import { useStore } from "../../store/useStore";
import type { NavTab } from "../../types";
import {
  Cpu,
  Briefcase,
  Radio,
  Compass,
  FileText,
  CheckSquare,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
}

export const Sidebar: React.FC = () => {
  const { currentTab, setCurrentTab } = useStore();

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Intelligence", icon: Cpu },
    { id: "jobs", label: "Job Feed", icon: Briefcase },
    { id: "radar", label: "Tech & AI Radar", icon: Sparkles, badge: "LIVE" },
    { id: "discovery", label: "Discovery Engine", icon: Compass },
    { id: "applications", label: "Applications", icon: CheckSquare },
    { id: "resume", label: "Resume Studio", icon: FileText },
    { id: "analytics", label: "Market Insights", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside
      style={{
        width: "240px",
        height: "100%",
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Brand Header */}
      <div
        style={{
          padding: "20px 18px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 10px rgba(99, 102, 241, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }}
        >
          <Sparkles size={17} color="#ffffff" />
        </div>
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: "14px",
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            AgentForge
          </div>
          <div
            style={{
              fontSize: "10px",
              color: "var(--accent-indigo)",
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            INTELLIGENCE OS
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav
        style={{
          flex: 1,
          padding: "14px 10px",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          overflowY: "auto",
        }}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                fontSize: "12.5px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                backgroundColor: isActive
                  ? "var(--bg-card)"
                  : "transparent",
                border: isActive
                  ? "1px solid var(--border-subtle)"
                  : "1px solid transparent",
                boxShadow: isActive ? "var(--shadow-sm)" : "none",
                transition: "all 0.12s ease",
                textAlign: "left",
                cursor: "pointer",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--bg-card-hover)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              <Icon
                size={16}
                color={isActive ? "var(--accent-indigo)" : "var(--text-muted)"}
              />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "1px 6px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(99, 102, 241, 0.12)",
                    color: "var(--accent-indigo)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Status Panel */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid var(--border-subtle)",
          backgroundColor: "var(--bg-surface)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "11px",
            color: "var(--text-secondary)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: "var(--accent-emerald)",
              boxShadow: "0 0 8px var(--accent-emerald)",
            }}
          />
          <span>Crawl Engine Active</span>
        </div>
        <div
          style={{
            fontSize: "10px",
            color: "var(--text-muted)",
            marginTop: "4px",
            fontFamily: "var(--font-mono)",
          }}
        >
          Greenhouse • Lever • Ashby
        </div>
      </div>
    </aside>
  );
};
