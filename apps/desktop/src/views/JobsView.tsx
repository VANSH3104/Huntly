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
  Globe,
  Radio,
  Zap,
  Plus,
  Layers,
  Check,
  Flame,
  Rocket,
  X,
  RefreshCw,
} from "lucide-react";

export const JobsView: React.FC = () => {
  const { filters, setFilters, setSelectedJobId } = useStore();
  const [isDiscovering, setIsDiscovering] = React.useState(false);
  const [discoverStatus, setDiscoverStatus] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  // Continuous auto-discovery state
  const [isAutoHunting, setIsAutoHunting] = React.useState(false);

  // Custom career URL crawl state
  const [showCustomBar, setShowCustomBar] = React.useState(false);
  const [customCareerUrl, setCustomCareerUrl] = React.useState("");
  const [isCrawlingCustom, setIsCrawlingCustom] = React.useState(false);

  // AI Filter Combinations state
  const [showAiCombinations, setShowAiCombinations] = React.useState(false);
  const [isGeneratingCombinations, setIsGeneratingCombinations] = React.useState(false);
  const [isCrawlingCombinations, setIsCrawlingCombinations] = React.useState(false);
  const [combinations, setCombinations] = React.useState<
    Array<{ query: string; category: string; description: string; selected: boolean }>
  >([]);
  const [categoryFilter, setCategoryFilter] = React.useState<string>("all");

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

  const handleDiscoverLive = async (silent = false) => {
    try {
      if (!silent) setIsDiscovering(true);
      setDiscoverStatus("Searching live public postings from LinkedIn, YC Startups & Career Pages...");
      const res = await api.crawl.discover({
        keywords: filters.search || filters.role || "Software Engineer",
        role: filters.role,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
      });

      const totalFound = res?.discovered?.total ?? 0;
      setDiscoverStatus(
        `Discovered & added ${totalFound} live positions (${res?.discovered?.linkedin ?? 0} LinkedIn, ${res?.discovered?.careerPages ?? 0} ATS/YC Career Pages) to your board!`
      );
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 6000);
    } catch (err: any) {
      setDiscoverStatus(`Discovery error: ${err.message || "Failed to scrape"}`);
      setTimeout(() => setDiscoverStatus(null), 4000);
    } finally {
      setIsDiscovering(false);
    }
  };

  // Continuous background auto-hunting effect
  React.useEffect(() => {
    if (!isAutoHunting) return;

    // Run first discovery immediately
    handleDiscoverLive(true);

    const interval = setInterval(() => {
      handleDiscoverLive(true);
    }, 45000);

    return () => clearInterval(interval);
  }, [isAutoHunting, filters.search, filters.role, filters.location, filters.remoteOnly]);

  const handleCrawlCustomCareer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!customCareerUrl.trim()) return;

    try {
      setIsCrawlingCustom(true);
      setDiscoverStatus(`Extracting verified jobs from ${customCareerUrl}...`);
      const res = await api.crawl.crawlCareerPage({ url: customCareerUrl.trim() });
      setDiscoverStatus(`Added ${res.addedJobs} verified jobs from ${res.company || "career page"} to the board!`);
      setCustomCareerUrl("");
      setShowCustomBar(false);
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 6000);
    } catch (err: any) {
      setDiscoverStatus(`Failed to crawl career page: ${err.message}`);
      setTimeout(() => setDiscoverStatus(null), 5000);
    } finally {
      setIsCrawlingCustom(false);
    }
  };

  const handleGenerateCombinations = async () => {
    try {
      setIsGeneratingCombinations(true);
      setShowAiCombinations(true);
      const res = await api.ai.expandFilters({
        role: filters.role,
        keywords: filters.search,
        location: filters.location || "India, Remote",
      });
      const items = (res.combinations || []).map((c) => ({
        ...c,
        selected: true,
      }));
      setCombinations(items);
    } catch (err: any) {
      alert(`AI expansion error: ${err.message || "Failed to generate combinations"}`);
    } finally {
      setIsGeneratingCombinations(false);
    }
  };

  const handleCrawlSelectedCombinations = async () => {
    const selectedQueries = combinations.filter((c) => c.selected).map((c) => c.query);
    if (selectedQueries.length === 0) {
      alert("Please select at least one search combination.");
      return;
    }

    try {
      setIsCrawlingCombinations(true);
      setDiscoverStatus(`AI is deep-crawling ${selectedQueries.length} combinations across LinkedIn, YC & ATS portals...`);
      const res = await api.crawl.deepSearch({
        queries: selectedQueries,
        location: filters.location || "India",
        remoteOnly: filters.remoteOnly,
        limitPerQuery: 15,
      });

      setDiscoverStatus(`Discovered & added ${res.totalAdded} positions across ${selectedQueries.length} combinations to the board!`);
      await refetch();
      setTimeout(() => setDiscoverStatus(null), 8000);
    } catch (err: any) {
      setDiscoverStatus(`Deep search error: ${err.message || "Failed to complete search"}`);
      setTimeout(() => setDiscoverStatus(null), 5000);
    } finally {
      setIsCrawlingCombinations(false);
    }
  };

  const toggleCombination = (index: number) => {
    setCombinations((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAllCombinations = (select: boolean) => {
    setCombinations((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleApplySingleCombination = (query: string) => {
    setFilters({ search: query });
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
      {/* Prominent Search & Filter Bar */}
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
        {/* Main Search Input */}
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
            style={{ width: "100%", paddingLeft: "36px", paddingRight: filters.search ? "32px" : "12px" }}
          />
          {filters.search && (
            <button
              onClick={() => setFilters({ search: "" })}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                padding: "2px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              <X size={13} />
            </button>
          )}
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
          <option value="yc">YC Startups</option>
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
            color: filters.remoteOnly ? "var(--text-primary)" : "var(--text-secondary)",
            cursor: "pointer",
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          <input
            type="checkbox"
            checked={filters.remoteOnly}
            onChange={(e) => setFilters({ remoteOnly: e.target.checked })}
          />
          <span>Remote only</span>
        </label>

        {/* Match Score Slider */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Min Match: {filters.minScore}%
          </span>
          <input
            type="range"
            min="0"
            max="95"
            step="5"
            value={filters.minScore}
            onChange={(e) => setFilters({ minScore: parseInt(e.target.value, 10) })}
            style={{ width: "85px", cursor: "pointer" }}
          />
        </div>

        {/* Actions Cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginLeft: "auto" }}>
          {/* AI Combinations Toggle */}
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (!showAiCombinations && combinations.length === 0) {
                handleGenerateCombinations();
              } else {
                setShowAiCombinations(!showAiCombinations);
              }
            }}
            style={{
              fontSize: "12px",
              padding: "7px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderColor: showAiCombinations ? "rgba(168, 85, 247, 0.5)" : undefined,
              color: showAiCombinations ? "#c084fc" : "var(--text-secondary)",
            }}
            title="AI generates all permutations and combinations of your filters"
          >
            <Sparkles size={14} color="#a855f7" />
            <span>AI Combinations</span>
            {combinations.length > 0 && (
              <span
                style={{
                  fontSize: "10px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  backgroundColor: "rgba(168, 85, 247, 0.3)",
                  color: "#d8b4fe",
                }}
              >
                {combinations.filter((c) => c.selected).length}/{combinations.length}
              </span>
            )}
          </button>

          {/* Add Career URL Toggle */}
          <button
            className="btn btn-secondary"
            onClick={() => setShowCustomBar(!showCustomBar)}
            style={{
              fontSize: "12px",
              padding: "7px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
            title="Crawl any specific company career page or YC link"
          >
            <Globe size={14} />
            <span>+ Career URL</span>
          </button>

          {/* Continuous Auto-Hunt Toggle */}
          <button
            className={isAutoHunting ? "btn btn-primary" : "btn btn-secondary"}
            onClick={() => setIsAutoHunting(!isAutoHunting)}
            style={{
              fontSize: "12px",
              padding: "7px 12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              border: isAutoHunting ? "1px solid rgba(34, 197, 94, 0.5)" : undefined,
              backgroundColor: isAutoHunting ? "rgba(34, 197, 94, 0.15)" : undefined,
              color: isAutoHunting ? "#4ade80" : "var(--text-secondary)",
            }}
            title="Automatically keeps finding real jobs matching your filters and adds them live to the board"
          >
            <Radio size={14} style={{ color: isAutoHunting ? "#22c55e" : "currentColor" }} />
            <span>{isAutoHunting ? "Auto-Hunt: ON" : "Auto-Hunt"}</span>
          </button>

          {/* Live Scrape Now Button */}
          <button
            className="btn btn-primary"
            onClick={() => handleDiscoverLive(false)}
            disabled={isDiscovering}
            style={{
              fontSize: "12px",
              padding: "7px 16px",
              whiteSpace: "nowrap",
            }}
          >
            <RefreshCw size={13} className={isDiscovering ? "animate-spin" : ""} />
            <span>{isDiscovering ? "Searching..." : "Find & Add Jobs"}</span>
          </button>

          {/* Clear Filters Reset */}
          {(filters.search || filters.role || filters.location || filters.ats || filters.remoteOnly || filters.minScore > 0) && (
            <button
              onClick={() =>
                setFilters({
                  search: "",
                  role: "",
                  location: "",
                  ats: "",
                  remoteOnly: false,
                  minScore: 0,
                })
              }
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                textDecoration: "underline",
                cursor: "pointer",
                background: "transparent",
                border: "none",
                padding: "4px",
              }}
              title="Reset all filters to default"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Expandable AI Search Expansion & Combinations Panel */}
      {showAiCombinations && (
        <div
          className="glass-panel"
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(99, 102, 241, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent-indigo)",
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    AI Search Angles & Keyword Permutations
                  </h3>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      backgroundColor: "rgba(99, 102, 241, 0.1)",
                      color: "var(--accent-indigo)",
                      fontWeight: 600,
                    }}
                  >
                    {combinations.length} Angles
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)" }}>
                  AI expands your keywords into role titles, tech stacks, YC startups, and direct ATS boards to discover hidden jobs.
                </p>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                className="btn btn-secondary"
                onClick={handleGenerateCombinations}
                disabled={isGeneratingCombinations}
                style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={13} className={isGeneratingCombinations ? "spin-animation" : ""} />
                <span>{isGeneratingCombinations ? "Generating..." : "Regenerate Angles"}</span>
              </button>

              {combinations.length > 0 && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={() => toggleAllCombinations(combinations.some((c) => !c.selected))}
                    style={{ fontSize: "12px", padding: "6px 10px" }}
                  >
                    {combinations.every((c) => c.selected) ? "Deselect All" : "Select All"}
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={handleCrawlSelectedCombinations}
                    disabled={isCrawlingCombinations || combinations.filter((c) => c.selected).length === 0}
                    style={{
                      fontSize: "12px",
                      padding: "6px 14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)",
                      border: "none",
                      color: "#fff",
                      fontWeight: 600,
                    }}
                  >
                    <Zap size={14} className={isCrawlingCombinations ? "spin-animation" : ""} />
                    <span>
                      {isCrawlingCombinations
                        ? "Deep-Crawling All Angles..."
                        : `Crawl Selected (${combinations.filter((c) => c.selected).length})`}
                    </span>
                  </button>
                </>
              )}

              <button
                className="btn btn-secondary"
                onClick={() => setShowAiCombinations(false)}
                style={{ padding: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          {combinations.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", marginRight: "4px" }}>Filter:</span>
              {[
                { id: "all", label: "All Angles" },
                { id: "role", label: "🎯 Role Synonyms" },
                { id: "stack", label: "⚡ Tech Stack" },
                { id: "startup_yc", label: "🚀 YC & Startups" },
                { id: "ats_portal", label: "🏢 ATS Portals" },
                { id: "intent", label: "🔥 High Intent" },
              ].map((tab) => {
                const count =
                  tab.id === "all"
                    ? combinations.length
                    : combinations.filter((c) => c.category === tab.id).length;
                if (tab.id !== "all" && count === 0) return null;
                const isActive = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setCategoryFilter(tab.id)}
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "14px",
                      border: isActive ? "1px solid rgba(168, 85, 247, 0.6)" : "1px solid rgba(255, 255, 255, 0.08)",
                      backgroundColor: isActive ? "rgba(168, 85, 247, 0.2)" : "rgba(255, 255, 255, 0.03)",
                      color: isActive ? "#c084fc" : "var(--text-secondary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{ opacity: 0.7, fontSize: "10px" }}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Combinations List / Grid */}
          {isGeneratingCombinations ? (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
                color: "var(--text-muted)",
              }}
            >
              <Sparkles size={24} className="spin-animation" color="#a855f7" />
              <span>Analyzing resume skills, role synonyms, and ATS targets to generate high-yield search angles...</span>
            </div>
          ) : combinations.length === 0 ? (
            <div
              style={{
                padding: "24px",
                textAlign: "center",
                border: "1px dashed rgba(255, 255, 255, 0.1)",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: "0 0 12px 0", color: "var(--text-muted)", fontSize: "13px" }}>
                Click "Generate Angles" to create tailored permutations based on your search keywords, role, and active resume skills.
              </p>
              <button
                className="btn btn-primary"
                onClick={handleGenerateCombinations}
                style={{ fontSize: "12px", padding: "6px 14px", background: "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)" }}
              >
                <Sparkles size={14} />
                <span>Generate Combinations</span>
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "10px",
                maxHeight: "340px",
                overflowY: "auto",
                paddingRight: "4px",
              }}
            >
              {combinations
                .filter((c) => categoryFilter === "all" || c.category === categoryFilter)
                .map((combo, idx) => {
                  const globalIdx = combinations.indexOf(combo);
                  const categoryBadgeColor =
                    combo.category === "startup_yc"
                      ? { bg: "rgba(217, 119, 6, 0.12)", text: "var(--accent-amber)", label: "YC Startup" }
                      : combo.category === "ats_portal"
                      ? { bg: "rgba(5, 150, 105, 0.12)", text: "var(--accent-emerald)", label: "ATS Board" }
                      : combo.category === "stack"
                      ? { bg: "rgba(37, 99, 235, 0.12)", text: "var(--accent-blue)", label: "Tech Stack" }
                      : combo.category === "intent"
                      ? { bg: "rgba(225, 29, 72, 0.12)", text: "var(--accent-rose)", label: "High Intent" }
                      : { bg: "rgba(124, 58, 237, 0.12)", text: "var(--accent-purple)", label: "Role Synonym" };

                  return (
                    <div
                      key={combo.query + idx}
                      onClick={() => toggleCombination(globalIdx)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: combo.selected
                          ? "1.5px solid var(--accent-indigo)"
                          : "1px solid var(--border-subtle)",
                        backgroundColor: combo.selected ? "rgba(79, 70, 229, 0.08)" : "var(--bg-card)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                          <input
                            type="checkbox"
                            checked={combo.selected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleCombination(globalIdx);
                            }}
                            style={{ cursor: "pointer" }}
                          />
                          <span
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              fontFamily: "var(--font-mono)",
                              color: "var(--text-primary)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={combo.query}
                          >
                            {combo.query}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            backgroundColor: categoryBadgeColor.bg,
                            color: categoryBadgeColor.text,
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          {categoryBadgeColor.label}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", flex: 1 }}>
                          {combo.description}
                        </span>
                        <div style={{ display: "flex", gap: "4px" }} onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleApplySingleCombination(combo.query)}
                            style={{ fontSize: "10px", padding: "2px 6px", height: "auto" }}
                            title="Filter board view using this exact query"
                          >
                            Filter Board
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Expandable Custom Career Page Crawler Bar */}
      {showCustomBar && (
        <form
          onSubmit={handleCrawlCustomCareer}
          className="glass-panel"
          style={{
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Globe size={18} color="var(--accent-indigo)" />
          <input
            type="url"
            placeholder="Paste any company career page (e.g. https://t.me/careers, https://boards.greenhouse.io/stripe, or YC company link)"
            value={customCareerUrl}
            onChange={(e) => setCustomCareerUrl(e.target.value)}
            style={{ flex: 1, padding: "8px 14px", fontSize: "13px" }}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={isCrawlingCustom || !customCareerUrl.trim()}
            style={{ fontSize: "13px", padding: "8px 16px" }}
          >
            <Zap size={14} />
            <span>{isCrawlingCustom ? "Extracting & Scoring..." : "Crawl & Add to Board"}</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowCustomBar(false)}
            style={{ fontSize: "12px", padding: "8px 12px" }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Auto-Hunting Active Pulse Indicator */}
      {isAutoHunting && (
        <div
          className="glass-panel"
          style={{
            padding: "10px 18px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--accent-emerald)", boxShadow: "0 0 8px var(--accent-emerald)" }} />
          <span>
            <strong>Continuous Filter-Hunting Active:</strong> Auto-scanning LinkedIn, YC Startups, and ATS career pages every 45s for{" "}
            <em>"{filters.role || filters.search || "Software Engineer"}" in "{filters.location || "India"}"</em> and streaming new jobs directly onto your board.
          </span>
        </div>
      )}

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
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            backgroundColor: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <Sparkles size={16} color="var(--accent-indigo)" />
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
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: "18px",
                  cursor: "pointer",
                  borderRadius: "var(--radius-lg)",
                }}
                onClick={() => setSelectedJobId(job.id)}
              >
                {/* Score Ring */}
                <ScoreRing score={matchScore} size={46} strokeWidth={4} />

                {/* Company Logo Avatar */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "10px",
                    backgroundColor: "rgba(79, 70, 229, 0.08)",
                    border: "1px solid rgba(79, 70, 229, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                    color: "var(--accent-indigo)",
                    flexShrink: 0,
                  }}
                >
                  {(job.company?.name || job.companyName || "C").charAt(0).toUpperCase()}
                </div>

                {/* Main Information */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h3
                      style={{
                        fontSize: "14.5px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {job.title}
                    </h3>

                    {job.ats && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontFamily: "var(--font-mono)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          backgroundColor: "var(--bg-surface)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {job.ats.toUpperCase()}
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: "10px",
                        padding: "1px 7px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(79, 70, 229, 0.08)",
                        color: "var(--accent-indigo)",
                        border: "1px solid rgba(79, 70, 229, 0.18)",
                        fontWeight: 600,
                        letterSpacing: "0.02em",
                      }}
                    >
                      VERIFIED
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "14px",
                      marginTop: "5px",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                      {job.company?.name || job.companyName || "Verified Tech Company"}
                    </span>

                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
                      <MapPin size={13} />
                      {job.location?.city
                        ? `${job.location.city}${job.location.country ? `, ${job.location.country}` : ""}`
                        : (job.location?.remote ? "Remote" : "India / Hybrid")}
                    </span>

                    {salary && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "var(--accent-indigo)", fontWeight: 600 }}>
                        <DollarSign size={13} />
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
                        gap: "5px",
                        marginTop: "8px",
                      }}
                    >
                      {job.skills.slice(0, 6).map((skill: string, i: number) => (
                        <span
                          key={i}
                          style={{
                            fontSize: "10.5px",
                            fontFamily: "var(--font-mono)",
                            padding: "2px 7px",
                            backgroundColor: "var(--bg-surface)",
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
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-secondary"
                    onClick={(e) => handleSaveToKanban(job, e)}
                    style={{ height: "30px", padding: "0 10px", fontSize: "11.5px" }}
                    title="Save to Applications Tracker"
                  >
                    <PlusCircle size={13} />
                    <span>Track</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    onClick={(e) => handleApplyQuick(job, e)}
                    style={{ height: "30px", padding: "0 12px", fontSize: "11.5px" }}
                  >
                    <span>Apply</span>
                    <ExternalLink size={12} />
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
              onClick={() => handleDiscoverLive(false)}
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
