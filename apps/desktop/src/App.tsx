import React from "react";
import { useStore } from "./store/useStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { CommandPalette } from "./components/common/CommandPalette";
import { JobDetailModal } from "./views/JobDetailModal";

// Views
import { DashboardView } from "./views/DashboardView";
import { JobsView } from "./views/JobsView";
import { DiscoveryView } from "./views/DiscoveryView";
import { ApplicationsView } from "./views/ApplicationsView";
import { ResumeStudioView } from "./views/ResumeStudioView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SettingsView } from "./views/SettingsView";

export const App: React.FC = () => {
  const { currentTab, isNotificationPanelOpen, setIsNotificationPanelOpen } = useStore();

  const renderActiveView = () => {
    switch (currentTab) {
      case "dashboard":
        return <DashboardView />;
      case "jobs":
        return <JobsView />;
      case "discovery":
        return <DiscoveryView />;
      case "applications":
        return <ApplicationsView />;
      case "resume":
        return <ResumeStudioView />;
      case "analytics":
        return <AnalyticsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="app-container">
      {/* Navigation Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="main-content">
        <Header />
        {renderActiveView()}
      </main>

      {/* Overlays & Modals */}
      <CommandPalette />
      <JobDetailModal />

      {/* Notifications Drawer */}
      {isNotificationPanelOpen && (
        <div
          style={{
            position: "fixed",
            top: "64px",
            right: 0,
            bottom: 0,
            width: "360px",
            backgroundColor: "rgba(15, 20, 32, 0.95)",
            backdropFilter: "blur(16px)",
            borderLeft: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-lg)",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <h3 style={{ fontSize: "14px", fontWeight: 600 }}>System Notifications</h3>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "12px" }}
              onClick={() => setIsNotificationPanelOpen(false)}
            >
              Close
            </button>
          </div>

          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                padding: "12px",
                borderRadius: "var(--radius-md)",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border-subtle)",
                fontSize: "12px",
              }}
            >
              <div style={{ color: "var(--accent-cyan)", fontWeight: 600 }}>Crawl Engine Initialized</div>
              <div style={{ color: "var(--text-secondary)", marginTop: "4px" }}>
                Connected to local SQLite database with 14 active ATS adapters and query generators ready.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
