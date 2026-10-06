import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Badge } from "../components/common/Badge";
import {
  Compass,
  Globe,
  Flame,
  Search,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Layers,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";

export const DiscoveryView: React.FC = () => {
  const queryClient = useQueryClient();
  const [probeUrl, setProbeUrl] = useState("");
  const [probeResult, setProbeResult] = useState<any>(null);
  const [isProbing, setIsProbing] = useState(false);

  const { data: sources, isLoading: isSourcesLoading } = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.sources.list(),
  });

  const { data: events } = useQuery({
    queryKey: ["crawl", "events"],
    queryFn: () => api.crawl.events(30),
    refetchInterval: 4000,
  });

  const handleProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probeUrl.trim()) return;

    setIsProbing(true);
    setProbeResult(null);
    try {
      const res = await api.crawl.probeUrl(probeUrl.trim());
      setProbeResult(res);
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    } catch (err: any) {
      setProbeResult({ error: err.message || "Failed to probe domain" });
    } finally {
      setIsProbing(false);
    }
  };

  const handleCrawlSource = async (sourceId: string) => {
    try {
      await api.sources.triggerCrawl(sourceId);
      alert("Triggered source crawl!");
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    } catch (err: any) {
      alert(`Error triggering crawl: ${err.message}`);
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Banner / Probe Tool */}
      <div
        className="glass-panel"
        style={{
          padding: "24px",
          background: "linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <Compass size={20} color="var(--accent-cyan)" />
          <h2 style={{ fontSize: "16px", fontWeight: 700 }}>Career Page & ATS Discovery Probe</h2>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px", maxWidth: "680px" }}>
          Enter any company website or ATS link (e.g. <code>stripe.com</code>, <code>figma.com</code>, or Greenhouse/Lever/Ashby URLs).
          The engine scans robots.txt, common career endpoints, detects the ATS API, and extracts verified jobs.
        </p>

        <form onSubmit={handleProbe} style={{ display: "flex", gap: "10px", maxWidth: "600px" }}>
          <input
            type="text"
            placeholder="https://company.com or career link"
            value={probeUrl}
            onChange={(e) => setProbeUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isProbing}
            style={{ whiteSpace: "nowrap" }}
          >
            {isProbing ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            <span>{isProbing ? "Probing..." : "Discover & Crawl"}</span>
          </button>
        </form>

        {probeResult && (
          <div
            style={{
              marginTop: "16px",
              padding: "14px 18px",
              borderRadius: "var(--radius-md)",
              backgroundColor: probeResult.error ? "rgba(244, 63, 94, 0.1)" : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${probeResult.error ? "rgba(244, 63, 94, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
              fontSize: "13px",
            }}
          >
            {probeResult.error ? (
              <span style={{ color: "var(--accent-rose)" }}>Probe failed: {probeResult.error}</span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--accent-emerald)", fontWeight: 600 }}>
                  ✓ Discovered: {probeResult.companyName || "Company"} ({probeResult.jobsFound ?? 0} jobs extracted)
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
                  ATS: {probeResult.ats || "Direct Web Parser"} • Career URL: {probeResult.careerUrl || probeUrl}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid: Sources Table + Live Event Logs */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "24px" }}>
        {/* Monitored Sources */}
        <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Globe size={18} color="var(--accent-cyan)" />
              <h3 style={{ fontSize: "15px", fontWeight: 600 }}>Monitored ATS & Career Sources</h3>
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {sources?.length ?? 0} endpoints active
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)", textAlign: "left", color: "var(--text-muted)", fontSize: "11px" }}>
                  <th style={{ padding: "8px 12px" }}>COMPANY / DOMAIN</th>
                  <th style={{ padding: "8px 12px" }}>ATS SYSTEM</th>
                  <th style={{ padding: "8px 12px" }}>JOBS DISCOVERED</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {isSourcesLoading ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
                      Loading sources...
                    </td>
                  </tr>
                ) : sources && sources.length > 0 ? (
                  sources.map((s: any) => (
                    <tr
                      key={s.id}
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        transition: "background 0.15s ease",
                      }}
                    >
                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.companyName || s.name || "Target"}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {s.url}
                        </div>
                      </td>
                      <td style={{ padding: "12px" }}>
                        <Badge variant="cyan">{s.ats?.toUpperCase() || "DIRECT"}</Badge>
                      </td>
                      <td style={{ padding: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)" }}>
                        {s.lastJobCount ?? 0}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => handleCrawlSource(s.id)}
                        >
                          Crawl Now
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
                      No sources added yet. Use the probe above to add official company career pages.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Crawl Event Stream */}
        <div className="glass-panel" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={18} color="var(--accent-emerald)" />
            <h3 style={{ fontSize: "15px", fontWeight: 600 }}>Crawl Worker Activity</h3>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              maxHeight: "420px",
              overflowY: "auto",
            }}
          >
            {events && events.length > 0 ? (
              events.map((ev: any, idx: number) => (
                <div
                  key={ev.id || idx}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: ev.severity === "error" ? "var(--accent-rose)" : "var(--accent-cyan)",
                        fontWeight: 600,
                      }}
                    >
                      {ev.type || "CRAWL_INFO"}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {ev.createdAt ? new Date(ev.createdAt).toLocaleTimeString() : "Just now"}
                    </span>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontSize: "11px", wordBreak: "break-word" }}>
                    {ev.message}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                Worker idle. Logs appear when queries or probes run.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
