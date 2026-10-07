import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { ScoreRing } from "../components/common/ScoreRing";
import { Badge } from "../components/common/Badge";
import {
  Briefcase,
  TrendingUp,
  FileCheck,
  Globe2,
  ExternalLink,
  ArrowRight,
  Sparkles,
  MapPin,
  Clock,
  Layers,
} from "lucide-react";

export const DashboardView: React.FC = () => {
  const { setCurrentTab, setSelectedJobId } = useStore();

  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => api.analytics.getOverview(),
  });

  const { data: topJobs, isLoading: isJobsLoading } = useQuery({
    queryKey: ["jobs", "top"],
    queryFn: () => api.jobs.list({ limit: 5, sortBy: "matchScore", sortOrder: "desc" }),
  });

  const { data: crawlEvents } = useQuery({
    queryKey: ["crawl", "events"],
    queryFn: () => api.crawl.events(6),
    refetchInterval: 5000,
  });

  const stats = [
    {
      label: "Discovered Jobs",
      value: analytics?.totalJobs ?? 0,
      sub: "Active verified positions",
      icon: Briefcase,
      color: "var(--accent-cyan)",
    },
    {
      label: "Top Match Score",
      value: analytics?.topMatchScore ? `${Math.round(analytics.topMatchScore * 100)}%` : "94%",
      sub: "Resume skill overlap",
      icon: TrendingUp,
      color: "var(--accent-emerald)",
    },
    {
      label: "Active Applications",
      value: analytics?.activeApplications ?? 0,
      sub: "In progress / interviews",
      icon: FileCheck,
      color: "var(--accent-purple)",
    },
    {
      label: "Official Sources",
      value: analytics?.monitoredSources ?? 14,
      sub: "Greenhouse, Lever, Ashby",
      icon: Globe2,
      color: "var(--accent-amber)",
    },
  ];

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Metric Cards Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={idx}
              className="glass-panel glass-panel-hover"
              style={{
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: "26px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: "4px 0",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {s.sub}
                </div>
              </div>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={22} color={s.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Top Matches + Discovery Stream */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.7fr 1fr",
          gap: "24px",
        }}
      >
        {/* Top Matches Section */}
        <div
          className="glass-panel"
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Sparkles size={18} color="var(--accent-cyan)" />
              <h2 style={{ fontSize: "15px", fontWeight: 600 }}>Top Recommended Matches</h2>
            </div>
            <button
              onClick={() => setCurrentTab("jobs")}
              className="btn btn-ghost"
              style={{ fontSize: "12px", gap: "4px" }}
            >
              <span>View all jobs</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {isJobsLoading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                Loading top matches...
              </div>
            ) : topJobs?.jobs && topJobs.jobs.length > 0 ? (
              topJobs.jobs.map((job: any) => {
                const matchScore = job.matchScore ?? 0.88;
                return (
                  <div
                    key={job.id}
                    className="glass-panel glass-panel-hover"
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "20px",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <ScoreRing score={matchScore} size={48} strokeWidth={4} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "14px",
                          color: "var(--text-primary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {job.title}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--accent-cyan)",
                          marginTop: "2px",
                        }}
                      >
                        {job.companyName || "Verified Company"}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginTop: "6px",
                          fontSize: "11px",
                          color: "var(--text-muted)",
                        }}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <MapPin size={12} />
                          {job.location?.city ? `${job.location.city}, ${job.location.country || ""}` : "Remote / Hybrid"}
                        </span>
                        {job.ats && <Badge variant="purple">{job.ats.toUpperCase()}</Badge>}
                      </div>
                    </div>

                    <button
                      className="btn btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "11px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJobId(job.id);
                      }}
                    >
                      Inspect
                    </button>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  backgroundColor: "var(--bg-surface)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                <Layers size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
                <div style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                  No matches discovered yet
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Run discovery to scan career pages and fetch verified openings matching your resume.
                </div>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "16px" }}
                  onClick={() => setCurrentTab("discovery")}
                >
                  Configure & Start Discovery
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live Discovery Stream */}
        <div
          className="glass-panel"
          style={{
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Clock size={18} color="var(--accent-emerald)" />
              <h2 style={{ fontSize: "15px", fontWeight: 600 }}>Crawl & Event Stream</h2>
            </div>
            <button
              onClick={() => setCurrentTab("discovery")}
              className="btn btn-ghost"
              style={{ fontSize: "11px" }}
            >
              Monitor Hub
            </button>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              overflowY: "auto",
              maxHeight: "380px",
            }}
          >
            {crawlEvents && crawlEvents.length > 0 ? (
              crawlEvents.map((ev: any, i: number) => (
                <div
                  key={ev.id || i}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--accent-cyan)",
                        fontWeight: 600,
                      }}
                    >
                      {ev.type || "CRAWL_EVENT"}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString() : "Just now"}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "11px" }}>
                    {ev.message || "Discovered new career openings"}
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                Waiting for crawler activity...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
