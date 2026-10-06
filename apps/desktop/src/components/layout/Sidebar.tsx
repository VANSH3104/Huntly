import React from "react";
import { useStore } from "../../store/useStore";
import type { NavTab } from "../../types";
import {
  Cpu,
  Briefcase,
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
          padding: "24px 20px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "var(--gradient-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px rgba(6, 182, 212, 0.4)",
          }}
        >
          <Sparkles size={20} color="#ffffff" />
        </div>
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: "16px",
              letterSpacing: "-0.02em",
              background: "linear-gradient(90deg, #f8fafc, #94a3b8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AgentForge
          </div>
          <div
            style={{
              fontSize: "11px",
              color: "var(--accent-cyan)",
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
            }}
          >
            JOB INTELLIGENCE OS
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav
        style={{
          flex: 1,
          padding: "16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
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
                gap: "12px",
                width: "100%",
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#ffffff" : "var(--text-secondary)",
                backgroundColor: isActive
                  ? "rgba(6, 182, 212, 0.12)"
                  : "transparent",
                border: isActive
                  ? "1px solid rgba(6, 182, 212, 0.25)"
                  : "1px solid transparent",
                transition: "all 0.15s ease",
                textAlign: "left",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.04)";
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
                size={18}
                color={isActive ? "var(--accent-cyan)" : "currentColor"}
              />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 6px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    color: "var(--accent-blue)",
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
          backgroundColor: "rgba(10, 13, 20, 0.5)",
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
