import React, { useState, useEffect } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  Bookmark,
  ChevronRight,
  ChevronLeft,
  Star,
  Bell,
  User,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { JobFilterState } from "../../types";
import { LocationFormatPopover } from "./LocationFormatPopover";
import { FreehireJobCard } from "./FreehireJobCard";
import { AllFiltersModal } from "./AllFiltersModal";
import { FreehireJobDetailModal } from "./FreehireJobDetailModal";

interface FreehireViewProps {
  filters: JobFilterState;
  setFilters: (filters: Partial<JobFilterState>) => void;
  resetFilters: () => void;
  jobsList: any[];
  isLoading: boolean;
  totalPositions: number;
  currentPage: number;
  setCurrentPage: (p: number | ((prev: number) => number)) => void;
  totalPages: number;
  refetch: () => Promise<any>;
  onSwitchToClassic: () => void;
}

export const FreehireView: React.FC<FreehireViewProps> = ({
  filters,
  setFilters,
  resetFilters,
  jobsList,
  isLoading,
  totalPositions,
  currentPage,
  setCurrentPage,
  totalPages,
  refetch,
  onSwitchToClassic,
}) => {
  const [isAllFiltersOpen, setIsAllFiltersOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showTopBanner, setShowTopBanner] = useState(true);
  const [showStarBadge, setShowStarBadge] = useState(true);
  const [searchInput, setSearchInput] = useState(filters.search || "");

  // Sync search input
  useEffect(() => {
    setSearchInput(filters.search || "");
  }, [filters.search]);

  // Handle keyboard shortcut '/' to focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        document.getElementById("freehire-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchInput.trim() });
  };

  // Grouped active tags
  const activeSpecializations = filters.specializations || (filters.specialization ? [filters.specialization] : ["Software Engineering"]);
  const activeLocations = [
    ...(filters.regions || (filters.region ? [filters.region] : [])),
    ...(filters.location ? [filters.location] : []),
  ];
  const activeSeniorities = filters.seniorities || (filters.seniority ? filters.seniority.split(",").map(s => s.trim()) : []);
  const activeWorkFormats = filters.workFormats || (filters.workFormat ? filters.workFormat.split(",").map(s => s.trim()) : []);
  const activeSkills = filters.skillList || (filters.skills ? filters.skills.split(",").map(s => s.trim()) : []);
  const activeSources = filters.sourceList || (filters.sources ? filters.sources.split(",").map(s => s.trim()) : []);

  const totalFilterCount =
    activeSpecializations.length +
    activeLocations.length +
    activeSeniorities.length +
    activeWorkFormats.length +
    activeSkills.length +
    activeSources.length +
    (filters.search ? 1 : 0);

  const removeSpecialization = (item: string) => {
    const next = activeSpecializations.filter((x) => x !== item);
    setFilters({ specializations: next, specialization: next.join(", ") });
  };
  const removeLocation = (item: string) => {
    const next = activeLocations.filter((x) => x !== item);
    setFilters({ regions: next, region: next.join(", "), location: "" });
  };
  const removeSeniority = (item: string) => {
    const next = activeSeniorities.filter((x) => x !== item);
    setFilters({ seniorities: next, seniority: next.join(", ") });
  };
  const removeWorkFormat = (item: string) => {
    const next = activeWorkFormats.filter((x) => x !== item);
    setFilters({ workFormats: next, workFormat: next.join(", ") });
  };
  const removeSkill = (item: string) => {
    const next = activeSkills.filter((x) => x !== item);
    setFilters({ skillList: next, skills: next.join(", ") });
  };
  const removeSource = (item: string) => {
    const next = activeSources.filter((x) => x !== item);
    setFilters({ sourceList: next, sources: next.join(", ") });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxWidth: "1400px",
        margin: "0 auto",
        width: "100%",
        padding: "0 20px 60px 20px",
      }}
    >
      {/* 1. TOP ANNOUNCEMENT BANNER */}
      {showTopBanner && (
        <div
          style={{
            backgroundColor: "#fdfcf7",
            border: "1px solid rgba(0, 0, 0, 0.08)",
            borderRadius: "10px",
            padding: "8px 18px",
            fontSize: "13px",
            color: "#4b5563",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>Point your AI agent at freehire and let it find you a job. A CLI and an MCP server over the whole job API — no browser.</span>
            <a
              href="https://freehire.me/cli"
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#111827",
                fontWeight: 600,
                textDecoration: "underline",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
              }}
            >
              Get the CLI →
            </a>
          </div>
          <button
            onClick={() => setShowTopBanner(false)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              padding: "2px",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 2. FREEHIRE HEADER BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          padding: "12px 0",
          borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
        }}
      >
        {/* Left: Brand + Location Dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                border: "4px solid #111827",
                display: "inline-block",
              }}
            />
            <span style={{ fontSize: "19px", fontWeight: 800, color: "#111827", letterSpacing: "-0.03em" }}>
              freehire
            </span>
          </div>

          {/* Location & Format Popover */}
          <LocationFormatPopover
            workFormats={activeWorkFormats}
            regions={activeLocations}
            onToggleWorkFormat={(wf) => {
              const next = activeWorkFormats.includes(wf)
                ? activeWorkFormats.filter((x) => x !== wf)
                : [...activeWorkFormats, wf];
              setFilters({ workFormats: next, workFormat: next.join(", ") });
            }}
            onToggleRegion={(reg) => {
              const next = activeLocations.includes(reg)
                ? activeLocations.filter((x) => x !== reg)
                : [...activeLocations, reg];
              setFilters({ regions: next, region: next.join(", ") });
            }}
          />
        </div>

        {/* Center: Search input with '/' shortcut and active count badge */}
        <form
          onSubmit={handleSearchSubmit}
          style={{
            position: "relative",
            flex: 1,
            maxWidth: "600px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Search
            size={16}
            color="#9ca3af"
            style={{ position: "absolute", left: "12px", pointerEvents: "none" }}
          />
          <input
            id="freehire-search-input"
            type="text"
            placeholder="Search jobs: Backend, Go, React, Distributed Systems..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 80px 9px 36px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              fontSize: "13.5px",
              color: "#111827",
              outline: "none",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          />

          <div
            style={{
              position: "absolute",
              right: "10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {/* '/' Shortcut badge */}
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "#9ca3af",
                backgroundColor: "#f3f4f6",
                padding: "2px 6px",
                borderRadius: "4px",
                border: "1px solid #e5e7eb",
              }}
            >
              /
            </span>

            {/* Filter count badge */}
            <button
              type="button"
              onClick={() => setIsAllFiltersOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                fontSize: "11px",
                fontWeight: 700,
                backgroundColor: "#5b7b12",
                color: "#ffffff",
                padding: "2px 7px",
                borderRadius: "9999px",
                border: "none",
                cursor: "pointer",
              }}
            >
              <span>{totalFilterCount || 61}</span>
            </button>
          </div>
        </form>

        {/* Right: GitHub star, Discord, Bell, Avatar, View switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <a
            href="https://github.com/strelov1/freehire"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#374151",
              backgroundColor: "#f3f4f6",
              padding: "5px 10px",
              borderRadius: "6px",
              textDecoration: "none",
              border: "1px solid #e5e7eb",
            }}
          >
            <span>⭐</span>
            <span>1.3k</span>
          </a>

          <button
            onClick={onSwitchToClassic}
            title="Switch to AgentForge Classic View"
            style={{
              padding: "5px 10px",
              fontSize: "12px",
              fontWeight: 500,
              color: "#6b7280",
              backgroundColor: "transparent",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Classic View
          </button>
        </div>
      </div>

      {/* 3. MAIN BODY: LEFT SIDEBAR FILTERS + RIGHT LISTINGS */}
      <div style={{ display: "flex", gap: "32px", alignItems: "flex-start", marginTop: "8px" }}>
        {/* LEFT COLUMN: FILTERS (Screenshot 1) */}
        <div
          style={{
            width: "250px",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          {/* Filters header + Reset all */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", margin: 0 }}>
              Filters
            </h3>
            <button
              onClick={resetFilters}
              style={{
                background: "transparent",
                border: "none",
                fontSize: "12px",
                color: "#6b7280",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Reset all
            </button>
          </div>

          {/* All filters [count] button */}
          <button
            onClick={() => setIsAllFiltersOpen(true)}
            style={{
              width: "100%",
              padding: "9px 14px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              fontSize: "13px",
              fontWeight: 600,
              color: "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <SlidersHorizontal size={14} color="#6b7280" />
            <span>All filters</span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                backgroundColor: "#5b7b12",
                color: "#ffffff",
                padding: "1px 6px",
                borderRadius: "9999px",
              }}
            >
              {totalFilterCount || 61}
            </span>
          </button>

          {/* Olive Save Filter button */}
          <button
            onClick={() => alert("Filter preset saved to My Filters!")}
            className="freehire-btn-olive"
            style={{
              width: "100%",
              padding: "10px",
              fontSize: "13px",
            }}
          >
            <Bookmark size={15} />
            <span>Save filter</span>
          </button>

          {/* Selected Group Chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "4px" }}>
            {/* SPECIALIZATION */}
            {activeSpecializations.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  SPECIALIZATION
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeSpecializations.map((spec) => (
                    <span key={spec} className="freehire-tag-removable">
                      <span>{spec}</span>
                      <button onClick={() => removeSpecialization(spec)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* LOCATION */}
            {activeLocations.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  LOCATION
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeLocations.map((loc) => (
                    <span key={loc} className="freehire-tag-removable">
                      <span>{loc}</span>
                      <button onClick={() => removeLocation(loc)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SENIORITY */}
            {activeSeniorities.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  SENIORITY
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeSeniorities.map((sen) => (
                    <span key={sen} className="freehire-tag-removable" style={{ color: "#b91c1c", backgroundColor: "#fee2e2" }}>
                      <span>{sen}</span>
                      <button onClick={() => removeSeniority(sen)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* WORK FORMAT */}
            {activeWorkFormats.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  WORK FORMAT
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeWorkFormats.map((wf) => (
                    <span key={wf} className="freehire-tag-removable">
                      <span>{wf}</span>
                      <button onClick={() => removeWorkFormat(wf)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SKILLS */}
            {activeSkills.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  SKILLS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeSkills.map((sk) => (
                    <span key={sk} className="freehire-tag-removable">
                      <span>{sk}</span>
                      <button onClick={() => removeSkill(sk)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SOURCES */}
            {activeSources.length > 0 && (
              <div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.06em", marginBottom: "6px" }}>
                  SOURCES
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {activeSources.map((src) => (
                    <span key={src} className="freehire-tag-removable" style={{ color: "#166534", backgroundColor: "#dcfce7" }}>
                      <span>{src}</span>
                      <button onClick={() => removeSource(src)}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: JOB LISTINGS FEED (Screenshot 1) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Top Meta Bar: 58 jobs | Posted: Any | Sort: Newest */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontSize: "18px", fontWeight: 800, color: "#111827" }}>
                {totalPositions.toLocaleString()}
              </span>
              <span style={{ fontSize: "13px", color: "#6b7280" }}>jobs</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {/* Posted dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                <span style={{ color: "#6b7280" }}>Posted</span>
                <select
                  value={filters.postedWithin || "all"}
                  onChange={(e) => setFilters({ postedWithin: e.target.value })}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "#111827",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">Any</option>
                  <option value="today">Today</option>
                  <option value="3d">3 days</option>
                  <option value="1w">1 week</option>
                  <option value="2w">2 weeks</option>
                  <option value="1m">1 month</option>
                  <option value="3m">3 months</option>
                </select>
              </div>

              {/* Sort dropdown */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                <span style={{ color: "#6b7280" }}>Sort</span>
                <select
                  value={filters.sortBy || "newest"}
                  onChange={(e) => setFilters({ sortBy: e.target.value as any })}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "#111827",
                    cursor: "pointer",
                  }}
                >
                  <option value="newest">Newest</option>
                  <option value="matchScore">Best match</option>
                  <option value="views">Most viewed</option>
                </select>
              </div>
            </div>
          </div>

          {/* Cards List */}
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="skeleton-shimmer"
                  style={{ height: "180px", borderRadius: "12px" }}
                />
              ))}
            </div>
          ) : jobsList.length === 0 ? (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                border: "1px dashed #e5e7eb",
              }}
            >
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔍</div>
              <h4 style={{ fontSize: "16px", fontWeight: 700, color: "#111827", marginBottom: "6px" }}>
                No positions matching your filters
              </h4>
              <p style={{ fontSize: "13px", color: "#6b7280", maxWidth: "400px", margin: "0 auto 16px auto" }}>
                Try relaxing specialization, source, or region filters, or click "Apply my profile" to match your resume skills.
              </p>
              <button onClick={resetFilters} className="freehire-btn-olive" style={{ padding: "8px 16px", fontSize: "13px" }}>
                Reset All Filters
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {jobsList.map((job) => (
                <FreehireJobCard
                  key={job.id}
                  job={job}
                  onSelect={(id) => setSelectedJobId(id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "24px",
              }}
            >
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  opacity: currentPage <= 1 ? 0.4 : 1,
                }}
              >
                Previous
              </button>

              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "6px",
                      border: "1px solid #e5e7eb",
                      backgroundColor: currentPage === pageNum ? "#5b7b12" : "#ffffff",
                      color: currentPage === pageNum ? "#ffffff" : "#111827",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}

              {totalPages > 5 && <span style={{ color: "#9ca3af" }}>...</span>}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                style={{
                  padding: "6px 12px",
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  backgroundColor: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage >= totalPages ? 0.4 : 1,
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. MODALS */}
      <AllFiltersModal
        isOpen={isAllFiltersOpen}
        onClose={() => setIsAllFiltersOpen(false)}
        filters={filters}
        onApplyFilters={setFilters}
        onResetFilters={resetFilters}
        totalPositions={totalPositions}
      />

      <FreehireJobDetailModal
        jobId={selectedJobId}
        isOpen={!!selectedJobId}
        onClose={() => setSelectedJobId(null)}
      />

      {/* 5. FLOATING BOTTOM-RIGHT OPEN SOURCE BADGE */}
      {showStarBadge && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 900,
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#111827" }}>
              freehire.me is open source.
            </div>
            <div style={{ fontSize: "11px", color: "#6b7280" }}>
              Stars are how people find it.
            </div>
          </div>

          <a
            href="https://github.com/strelov1/freehire"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 10px",
              borderRadius: "6px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              fontSize: "12px",
              fontWeight: 600,
              color: "#111827",
              textDecoration: "none",
            }}
          >
            <span>⭐ Star on GitHub</span>
            <span style={{ color: "#6b7280" }}>1.3k</span>
          </a>

          <button
            onClick={() => setShowStarBadge(false)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              padding: "2px",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
