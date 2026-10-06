import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { ScoreRing } from "../components/common/ScoreRing";
import { Badge } from "../components/common/Badge";
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Building,
  ExternalLink,
  Sparkles,
  CheckCircle,
  PlusCircle,
  Briefcase,
  DollarSign,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const JobsView: React.FC = () => {
  const { filters, setFilters, setSelectedJobId } = useStore();
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [discoverStatus, setDiscoverStatus] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [filters.search, filters.role, filters.location, filters.remoteOnly, filters.minScore, filters.ats, filters.status, filters.sortBy]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["jobs", filters, currentPage, pageSize],
    queryFn: () =>
      api.jobs.list({
        search: filters.search,
        role: filters.role,
        location: filters.location,
        remoteOnly: filters.remoteOnly,
        minScore: filters.minScore > 0 ? filters.minScore : undefined,
        ats: filters.ats,
        status: filters.status,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page: currentPage,
        limit: pageSize,
      }),
  });

  const jobsList: any[] = data?.jobs || [];
  const totalPositions = data?.pagination?.total ?? data?.total ?? jobsList.length ?? 0;
  const totalPages = data?.pagination?.pages ?? Math.max(1, Math.ceil(totalPositions / pageSize));

  const handleDiscoverLive = async () => {
    try {
      setIsDiscovering(true);
      setDiscoverStatus("Scraping live public postings from LinkedIn & official career pages...");
      const res = await api.crawl.discover({
        keywords: filters.search || filters.role || "Software Engineer",
        role: filters.role,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
      });

      const totalFound = res?.discovered?.total ?? 0;
      setDiscoverStatus(`Discovered ${totalFound} live positions (${res?.discovered?.linkedin ?? 0} LinkedIn, ${res?.discovered?.careerPages ?? 0} Career Pages)!`);
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 5000);
    } catch (err: any) {
      setDiscoverStatus(`Discovery error: ${err.message || "Failed to scrape"}`);
      setTimeout(() => setDiscoverStatus(null), 4000);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleApplyQuick = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.applications.create({
        jobId: job.id,
        status: "applied",
        notes: "Quick applied from feed",
      });
      // Open official URL in new window
      if (job.applyUrl || job.sourceUrl) {
        window.open(job.applyUrl || job.sourceUrl, "_blank");
      }
    } catch {
      if (job.applyUrl || job.sourceUrl) {
        window.open(job.applyUrl || job.sourceUrl, "_blank");
      }
    }
  };

  const handleSaveToKanban = async (job: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.applications.create({
        jobId: job.id,
        status: "saved",
      });
      alert("Job saved to Applications Kanban!");
    } catch (err: any) {
      alert(err.message || "Already in applications");
    }
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Search & Filter Bar */}
      <div
        className="glass-panel"
        style={{
          padding: "16px 20px",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            placeholder="Search keywords, tech stack, titles..."
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            style={{ width: "100%", paddingLeft: "36px" }}
          />
        </div>

        {/* Role input */}
        <input
          type="text"
          placeholder="Role (e.g. Backend, Frontend, ML)"
          value={filters.role}
          onChange={(e) => setFilters({ role: e.target.value })}
          style={{ width: "180px" }}
        />

        {/* Location input */}
        <input
          type="text"
          placeholder="Location (e.g. Bengaluru, Remote)"
          value={filters.location}
          onChange={(e) => setFilters({ location: e.target.value })}
          style={{ width: "160px" }}
        />

        {/* ATS Filter */}
        <select
          value={filters.ats}
          onChange={(e) => setFilters({ ats: e.target.value })}
          style={{ width: "140px" }}
        >
          <option value="">All ATS Platforms</option>
          <option value="greenhouse">Greenhouse</option>
          <option value="lever">Lever</option>
          <option value="ashby">Ashby</option>
          <option value="workday">Workday</option>
        </select>

        {/* Remote toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={filters.remoteOnly}
            onChange={(e) => setFilters({ remoteOnly: e.target.checked })}
          />
          Remote only
        </label>

        {/* Match Score Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Min Match: {filters.minScore}%
          </span>
          <input
            type="range"
            min="0"
            max="95"
            step="5"
            value={filters.minScore}
            onChange={(e) => setFilters({ minScore: parseInt(e.target.value, 10) })}
            style={{ width: "90px" }}
          />
        </div>

        {/* Live Scrape Button */}
        <button
          className="btn btn-primary"
          onClick={handleDiscoverLive}
          disabled={isDiscovering}
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
            color: "#ffffff",
            fontWeight: 600,
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            boxShadow: "0 2px 10px rgba(6, 182, 212, 0.25)",
            cursor: isDiscovering ? "not-allowed" : "pointer",
          }}
        >
          <Sparkles size={15} className={isDiscovering ? "spin-animation" : ""} />
          <span>{isDiscovering ? "Scraping Live Web..." : "Scrape Live (LinkedIn & Web)"}</span>
        </button>
      </div>

      {/* Discovery Status Banner */}
      {discoverStatus && (
        <div
          className="glass-panel"
          style={{
            padding: "12px 18px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--accent-cyan)",
            border: "1px solid rgba(6, 182, 212, 0.3)",
            backgroundColor: "rgba(6, 182, 212, 0.08)",
          }}
        >
          <Sparkles size={16} />
          <span>{discoverStatus}</span>
        </div>
      )}

      {/* Results Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
          Found{" "}
          <span style={{ color: "var(--accent-cyan)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
            {data?.pagination?.total ?? data?.total ?? jobsList.length ?? 0}
          </span>{" "}
          verified positions
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Sort by:</span>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ sortBy: e.target.value as any })}
            style={{ padding: "4px 8px", fontSize: "12px" }}
          >
            <option value="matchScore">Highest Match Score</option>
            <option value="postedAt">Most Recent</option>
            <option value="salary">Highest Salary</option>
          </select>
        </div>
      </div>

      {/* Jobs List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {isLoading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
            Scanning and matching verified jobs...
          </div>
        ) : jobsList.length > 0 ? (
          jobsList.map((job: any) => {
            const rawScore = job.match?.overall ?? job.matchScore ?? 85;
            const matchScore = rawScore > 1 ? rawScore / 100 : rawScore;
            const salary = job.salary?.min
              ? `$${(job.salary.min / 1000).toFixed(0)}k - $${(job.salary.max / 1000).toFixed(0)}k`
              : (job.salaryMin ? `$${(job.salaryMin / 1000).toFixed(0)}k` : null);

            return (
              <div
                key={job.id}
                className="glass-panel glass-panel-hover"
                style={{
                  padding: "20px 24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "24px",
                  cursor: "pointer",
                }}
                onClick={() => setSelectedJobId(job.id)}
              >
                {/* Score */}
                <ScoreRing score={matchScore} size={54} strokeWidth={4.5} />

                {/* Main Information */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h3
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      {job.title}
                    </h3>
                    {job.ats && <Badge variant="cyan">{job.ats.toUpperCase()}</Badge>}
                    <Badge variant={job.status === "active" ? "emerald" : "rose"}>
                      {job.status?.toUpperCase() || "ACTIVE"}
                    </Badge>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      marginTop: "6px",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--accent-cyan)" }}>
                      <Building size={14} />
                      {job.company?.name || job.companyName || "Verified Tech Company"}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <MapPin size={14} />
                      {job.location?.city
                        ? `${job.location.city}${job.location.country ? `, ${job.location.country}` : ""}`
                        : (job.location?.remote ? "Remote" : "India / Hybrid")}
                    </span>
                    {salary && (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--accent-emerald)" }}>
                        <DollarSign size={14} />
                        {salary}
                      </span>
                    )}
                  </div>

                  {/* Skills tags preview */}
                  {job.skills && job.skills.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginTop: "10px",
                      }}
                    >
                      {job.skills.slice(0, 6).map((skill: string, i: number) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "11px",
                            fontFamily: "var(--font-mono)",
                            padding: "2px 8px",
                            backgroundColor: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "4px",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={(e) => handleSaveToKanban(job, e)}
                    title="Save to Applications Tracker"
                  >
                    <PlusCircle size={15} />
                    <span>Track</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={(e) => handleApplyQuick(job, e)}
                  >
                    <span>Apply</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div
            className="glass-panel"
            style={{
              padding: "64px 32px",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <Briefcase size={40} color="var(--accent-cyan)" />
            <div style={{ fontSize: "16px", fontWeight: 600 }}>No jobs found for these criteria</div>
            <div style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "460px", lineHeight: "1.5" }}>
              Would you like to search the public web and scrape live LinkedIn postings for{" "}
              <strong style={{ color: "var(--accent-cyan)" }}>
                "{filters.search || filters.role || "these criteria"}"
              </strong>
              ?
            </div>
            <button
              className="btn btn-primary"
              onClick={handleDiscoverLive}
              disabled={isDiscovering}
              style={{
                marginTop: "8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 22px",
                fontSize: "14px",
                fontWeight: 600,
                borderRadius: "8px",
                background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
              }}
            >
              <Sparkles size={16} className={isDiscovering ? "spin-animation" : ""} />
              <span>
                {isDiscovering
                  ? "Scraping LinkedIn & Web..."
                  : `Scrape Live Web for "${filters.search || filters.role || "Jobs"}"`}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Pagination Bar */}
      {totalPositions > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "8px",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
            Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, totalPositions)} of {totalPositions} jobs
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="btn"
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage <= 1}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                fontSize: "12px",
                opacity: currentPage <= 1 ? 0.4 : 1,
                cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <div
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--accent-cyan)",
                padding: "4px 12px",
                borderRadius: "6px",
                background: "rgba(6, 182, 212, 0.1)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Page {currentPage} of {totalPages}
            </div>

            <button
              className="btn"
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage >= totalPages}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 12px",
                fontSize: "12px",
                opacity: currentPage >= totalPages ? 0.4 : 1,
                cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: "4px 8px", fontSize: "12px" }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
