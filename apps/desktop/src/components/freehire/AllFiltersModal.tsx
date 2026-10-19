import React, { useState } from "react";
import {
  X,
  Search,
  Sparkles,
  Info,
  Check,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import { JobFilterState } from "../../types";

interface AllFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: JobFilterState;
  onApplyFilters: (newFilters: Partial<JobFilterState>) => void;
  onResetFilters: () => void;
  totalPositions: number;
}

type FilterTab =
  | "role"
  | "experience"
  | "posted"
  | "location"
  | "work"
  | "skills"
  | "industry"
  | "company"
  | "source"
  | "salary"
  | "language"
  | "relocation"
  | "saved";

export const AllFiltersModal: React.FC<AllFiltersModalProps> = ({
  isOpen,
  onClose,
  filters,
  onApplyFilters,
  onResetFilters,
  totalPositions,
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>("role");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");
  const [sourceSearch, setSourceSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");

  // Local draft state
  const [draftSpecializations, setDraftSpecializations] = useState<string[]>(
    filters.specializations || (filters.specialization ? [filters.specialization] : ["Software Engineering"])
  );
  const [draftSeniorities, setDraftSeniorities] = useState<string[]>(
    filters.seniorities || []
  );
  const [draftWorkFormats, setDraftWorkFormats] = useState<string[]>(
    filters.workFormats || []
  );
  const [draftRegions, setDraftRegions] = useState<string[]>(
    filters.regions || []
  );
  const [draftSources, setDraftSources] = useState<string[]>(
    filters.sourceList || []
  );
  const [draftSkills, setDraftSkills] = useState<string[]>(
    filters.skillList || []
  );
  const [draftIndustries, setDraftIndustries] = useState<string[]>(
    filters.industries || []
  );
  const [draftCollections, setDraftCollections] = useState<string[]>(
    filters.collections || []
  );
  const [draftPostedWithin, setDraftPostedWithin] = useState<string>(
    filters.postedWithin || "all"
  );

  if (!isOpen) return null;

  const toggleItem = (list: string[], item: string, setter: (val: string[]) => void) => {
    if (list.includes(item)) {
      setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  };

  const handleApplyProfile = () => {
    // Automatically apply Vansh Kabra's resume strengths:
    setDraftSpecializations(["Software Engineering", "Backend", "Full-Stack"]);
    setDraftSkills(["TypeScript", "React", "Node.js", "Go", "Rust", "Kafka", "PostgreSQL", "Docker", "Linux"]);
    setDraftWorkFormats(["Remote", "Hybrid"]);
    setDraftRegions(["Worldwide", "India", "North America", "Europe"]);
    setDraftSeniorities(["Junior", "Middle", "Lead"]);
  };

  const handleAiDescribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsAiProcessing(true);
    const pLower = aiPrompt.toLowerCase();

    // Natural language extraction
    const newRoles: string[] = [...draftSpecializations];
    if (pLower.includes("backend") && !newRoles.includes("Backend")) newRoles.push("Backend");
    if (pLower.includes("frontend") && !newRoles.includes("Frontend")) newRoles.push("Frontend");
    if (pLower.includes("full") && !newRoles.includes("Full-Stack")) newRoles.push("Full-Stack");
    if (pLower.includes("ai") || pLower.includes("agent") || pLower.includes("llm")) {
      if (!newRoles.includes("AI Engineering")) newRoles.push("AI Engineering");
    }

    const newWf: string[] = [...draftWorkFormats];
    if (pLower.includes("remote") && !newWf.includes("Remote")) newWf.push("Remote");
    if (pLower.includes("hybrid") && !newWf.includes("Hybrid")) newWf.push("Hybrid");

    const newSkills: string[] = [...draftSkills];
    ["go", "golang", "rust", "typescript", "react", "python", "kafka", "docker", "kubernetes"].forEach((sk) => {
      if (pLower.includes(sk)) {
        const cap = sk === "go" || sk === "golang" ? "Go" : sk.charAt(0).toUpperCase() + sk.slice(1);
        if (!newSkills.includes(cap)) newSkills.push(cap);
      }
    });

    const newCols: string[] = [...draftCollections];
    if (pLower.includes("yc") || pLower.includes("y combinator") || pLower.includes("startup")) {
      if (!newCols.includes("Y Combinator")) newCols.push("Y Combinator");
      if (!newCols.includes("Startup")) newCols.push("Startup");
    }

    setDraftSpecializations(newRoles);
    setDraftWorkFormats(newWf);
    setDraftSkills(newSkills);
    setDraftCollections(newCols);

    setTimeout(() => {
      setIsAiProcessing(false);
      setAiPrompt("");
    }, 400);
  };

  const handleSaveAndClose = () => {
    onApplyFilters({
      specializations: draftSpecializations,
      specialization: draftSpecializations.join(", "),
      seniorities: draftSeniorities,
      seniority: draftSeniorities.join(", "),
      workFormats: draftWorkFormats,
      workFormat: draftWorkFormats.join(", "),
      regions: draftRegions,
      region: draftRegions.join(", "),
      sourceList: draftSources,
      sources: draftSources.join(", "),
      skillList: draftSkills,
      skills: draftSkills.join(", "),
      industries: draftIndustries,
      industry: draftIndustries.join(", "),
      collections: draftCollections,
      collection: draftCollections.join(", "),
      postedWithin: draftPostedWithin,
    });
    onClose();
  };

  const handleClearAll = () => {
    setDraftSpecializations([]);
    setDraftSeniorities([]);
    setDraftWorkFormats([]);
    setDraftRegions([]);
    setDraftSources([]);
    setDraftSkills([]);
    setDraftIndustries([]);
    setDraftCollections([]);
    setDraftPostedWithin("all");
    onResetFilters();
  };

  // 100+ Freehire Sources
  const FREEHIRE_SOURCES = [
    { name: "Workday", count: "21,717" },
    { name: "Greenhouse", count: "9,206" },
    { name: "Oracle", count: "8,325" },
    { name: "SmartRecruiters", count: "6,948" },
    { name: "Ashby", count: "5,561" },
    { name: "Adzuna", count: "5,559" },
    { name: "SAP SuccessFactors", count: "3,327" },
    { name: "Eures", count: "3,030" },
    { name: "Manatal", count: "2,597" },
    { name: "Trudvsem", count: "2,578" },
    { name: "Lever", count: "2,158" },
    { name: "Whatjobs Uk", count: "2,089" },
    { name: "Workable", count: "1,963" },
    { name: "Jobstreet", count: "1,731" },
    { name: "Eightfold", count: "1,714" },
    { name: "Phenom", count: "1,537" },
    { name: "Icims", count: "1,342" },
    { name: "Energyjobline", count: "1,333" },
    { name: "UKG", count: "1,270" },
    { name: "Teamtailor", count: "1,266" },
    { name: "Whatjobs Pl", count: "1,217" },
    { name: "Jobleads", count: "1,161" },
    { name: "Hh", count: "1,150" },
    { name: "BambooHR", count: "1,132" },
    { name: "JazzHR", count: "1,103" },
    { name: "My Careers Future", count: "1,091" },
    { name: "Zoho Recruit", count: "1,091" },
    { name: "WhatJobs", count: "1,075" },
    { name: "Whatjobs It", count: "1,031" },
    { name: "Telegram", count: "1,023" },
    { name: "startup.jobs", count: "997" },
    { name: "4 Day Week", count: "995" },
    { name: "Whatjobs Ca", count: "932" },
    { name: "JobStash", count: "886" },
    { name: "Whatjobs Sg", count: "823" },
    { name: "Seek", count: "798" },
    { name: "Whatjobs Es", count: "753" },
    { name: "Paylocity", count: "728" },
    { name: "Recruitee", count: "709" },
    { name: "Rippling", count: "698" },
    { name: "Work at a Startup", count: "684" },
    { name: "Breezy", count: "649" },
    { name: "Whatjobs Nl", count: "646" },
    { name: "Personio", count: "624" },
    { name: "Amazon", count: "601" },
    { name: "Whatjobs Za", count: "589" },
    { name: "Reed", count: "575" },
    { name: "Adp", count: "573" },
    { name: "Apple", count: "557" },
    { name: "Whatjobs De", count: "554" },
    { name: "Whatjobs Ph", count: "554" },
    { name: "Himalayas", count: "525" },
    { name: "Google", count: "502" },
    { name: "Dayforce", count: "465" },
    { name: "Radancy", count: "463" },
    { name: "Join", count: "451" },
    { name: "Welcome to the Jungle", count: "407" },
    { name: "Gem", count: "379" },
    { name: "Paycor", count: "371" },
    { name: "Arbeitnow", count: "370" },
    { name: "Taleo", count: "364" },
    { name: "CATS", count: "360" },
    { name: "Paycom", count: "336" },
    { name: "Djinni", count: "328" },
    { name: "Comeet", count: "326" },
    { name: "Jobvite", count: "323" },
    { name: "No Fluff Jobs", count: "307" },
    { name: "Trakstar", count: "307" },
    { name: "Pinpoint", count: "294" },
    { name: "Avature", count: "293" },
    { name: "Wellfound", count: "238" },
    { name: "ApplicantPro", count: "226" },
    { name: "Traffit", count: "222" },
    { name: "isolved Hire", count: "220" },
    { name: "PowerToFly", count: "186" },
    { name: "Freshteam", count: "182" },
    { name: "Potok", count: "181" },
    { name: "Hibob", count: "138" },
    { name: "Gulftalent", count: "132" },
    { name: "Yandex", count: "132" },
    { name: "Epam", count: "125" },
    { name: "IBM", count: "119" },
    { name: "AI Jobs", count: "118" },
    { name: "Inhire", count: "97" },
    { name: "Factorial", count: "89" },
    { name: "Thehub", count: "84" },
    { name: "Remote.com", count: "80" },
    { name: "Meta", count: "77" },
    { name: "Hacker News", count: "37" },
    { name: "Talentlyft", count: "37" },
    { name: "Uber", count: "31" },
    { name: "Deel", count: "31" },
    { name: "We Work Remotely", count: "27" },
    { name: "RemoteOK", count: "10" },
  ];

  const filteredSources = FREEHIRE_SOURCES.filter((s) =>
    s.name.toLowerCase().includes(sourceSearch.toLowerCase())
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "880px",
          height: "88vh",
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.35)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#111827", margin: 0 }}>
              All filters
            </h2>
            <Info size={15} color="#9ca3af" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={handleApplyProfile}
              className="freehire-btn-olive"
              style={{
                padding: "8px 16px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <UserCheck size={15} />
              <span>Apply my profile</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "4px",
                color: "#6b7280",
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Top prompt bar: Describe with AI BETA */}
        <div style={{ padding: "14px 24px 0 24px" }}>
          <form
            onSubmit={handleAiDescribe}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 16px",
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              backgroundColor: "#f9fafb",
            }}
          >
            <Sparkles size={16} color="#5b7b12" />
            <input
              type="text"
              placeholder="Describe with AI BETA (e.g. Remote Golang backend roles at YC startups with competitive pay)"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                fontSize: "13px",
                color: "#111827",
              }}
            />
            {aiPrompt && (
              <button
                type="submit"
                disabled={isAiProcessing}
                style={{
                  background: "#5b7b12",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {isAiProcessing ? "Parsing..." : "Apply"}
              </button>
            )}
          </form>
        </div>

        {/* Two Column Layout: Left Category Nav + Right Content */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", marginTop: "12px" }}>
          {/* Left Category Nav */}
          <div
            style={{
              width: "210px",
              borderRight: "1px solid #e5e7eb",
              overflowY: "auto",
              padding: "12px 0",
              backgroundColor: "#ffffff",
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "0 18px 6px 18px", fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>
              SAVED
            </div>
            <button
              onClick={() => setActiveTab("saved")}
              style={{
                width: "100%",
                padding: "8px 18px",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: activeTab === "saved" ? 600 : 500,
                color: activeTab === "saved" ? "#111827" : "#4b5563",
                backgroundColor: activeTab === "saved" ? "#f3f4f6" : "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>My filters</span>
            </button>

            <div style={{ padding: "16px 18px 6px 18px", fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>
              ROLE
            </div>
            {[
              { id: "role", label: "Role", count: draftSpecializations.length },
              { id: "experience", label: "Experience", count: draftSeniorities.length },
              { id: "posted", label: "Posted", count: draftPostedWithin !== "all" ? 1 : 0 },
              { id: "location", label: "Location", count: draftRegions.length },
              { id: "work", label: "Work & employment", count: draftWorkFormats.length },
              { id: "skills", label: "Skills", count: draftSkills.length },
              { id: "industry", label: "Industry & collection", count: draftIndustries.length + draftCollections.length },
              { id: "source", label: "Source", count: draftSources.length },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as FilterTab)}
                style={{
                  width: "100%",
                  padding: "8px 18px",
                  textAlign: "left",
                  fontSize: "13px",
                  fontWeight: activeTab === item.id ? 600 : 500,
                  color: activeTab === item.id ? "#111827" : "#4b5563",
                  backgroundColor: activeTab === item.id ? "#f3f4f6" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{item.label}</span>
                {item.count > 0 && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      backgroundColor: "#5b7b12",
                      color: "#ffffff",
                      borderRadius: "9999px",
                      padding: "1px 6px",
                    }}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            ))}

            <div style={{ padding: "16px 18px 6px 18px", fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>
              PAY & BENEFITS
            </div>
            <button
              onClick={() => setActiveTab("salary")}
              style={{
                width: "100%",
                padding: "8px 18px",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: activeTab === "salary" ? 600 : 500,
                color: activeTab === "salary" ? "#111827" : "#4b5563",
                backgroundColor: activeTab === "salary" ? "#f3f4f6" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Salary
            </button>

            <div style={{ padding: "16px 18px 6px 18px", fontSize: "10px", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em" }}>
              REQUIREMENTS & ELIGIBILITY
            </div>
            <button
              onClick={() => setActiveTab("language")}
              style={{
                width: "100%",
                padding: "8px 18px",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: activeTab === "language" ? 600 : 500,
                color: activeTab === "language" ? "#111827" : "#4b5563",
                backgroundColor: activeTab === "language" ? "#f3f4f6" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Language
            </button>
            <button
              onClick={() => setActiveTab("relocation")}
              style={{
                width: "100%",
                padding: "8px 18px",
                textAlign: "left",
                fontSize: "13px",
                fontWeight: activeTab === "relocation" ? 600 : 500,
                color: activeTab === "relocation" ? "#111827" : "#4b5563",
                backgroundColor: activeTab === "relocation" ? "#f3f4f6" : "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Relocation
            </button>
          </div>

          {/* Right Pane Content */}
          <div style={{ flex: 1, padding: "20px 24px", overflowY: "auto", backgroundColor: "#ffffff" }}>
            {/* TAB: ROLE (Screenshot 4) */}
            {activeTab === "role" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    Specialization
                  </div>
                  <div style={{ position: "relative", marginBottom: "16px" }}>
                    <Search size={15} color="#9ca3af" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      type="text"
                      placeholder="Search specializations..."
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 12px 7px 32px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        fontSize: "13px",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                {/* Subcategory: Engineering */}
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px" }}>
                    ⌵ Engineering
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "Software Engineering", count: "1,29,848" },
                      { name: "Backend", count: "28,231" },
                      { name: "Frontend", count: "11,536" },
                      { name: "Full-Stack", count: "45,342" },
                      { name: "Mobile", count: "8,017" },
                      { name: "DevOps", count: "66,177" },
                      { name: "SRE", count: "4,797" },
                      { name: "Network Engineering", count: "7,895" },
                      { name: "Hardware", count: "11,306" },
                      { name: "Embedded", count: "8,608" },
                      { name: "Blockchain", count: "510" },
                      { name: "Architecture", count: "38,475" },
                      { name: "Industrial Engineering", count: "1,23,249" },
                      { name: "Science & Lab", count: "12,156" },
                    ]
                      .filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                      .map((role) => {
                        const isSelected = draftSpecializations.includes(role.name);
                        return (
                          <button
                            key={role.name}
                            onClick={() => toggleItem(draftSpecializations, role.name, setDraftSpecializations)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "5px 12px",
                              borderRadius: "9999px",
                              fontSize: "12.5px",
                              fontWeight: 500,
                              backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                              color: isSelected ? "#ffffff" : "#374151",
                              border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                              cursor: "pointer",
                            }}
                          >
                            <span>{role.name}</span>
                            <span style={{ fontSize: "11px", opacity: 0.8 }}>{role.count}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Subcategory: Data & AI */}
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px" }}>
                    ⌵ Data & AI
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "Data Engineering", count: "45,815" },
                      { name: "Data Science", count: "13,659" },
                      { name: "Data Analytics", count: "17,424" },
                      { name: "ML / AI", count: "10,815" },
                      { name: "AI Engineering", count: "14,578" },
                    ]
                      .filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                      .map((role) => {
                        const isSelected = draftSpecializations.includes(role.name);
                        return (
                          <button
                            key={role.name}
                            onClick={() => toggleItem(draftSpecializations, role.name, setDraftSpecializations)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "5px 12px",
                              borderRadius: "9999px",
                              fontSize: "12.5px",
                              fontWeight: 500,
                              backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                              color: isSelected ? "#ffffff" : "#374151",
                              border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                              cursor: "pointer",
                            }}
                          >
                            <span>{role.name}</span>
                            <span style={{ fontSize: "11px", opacity: 0.8 }}>{role.count}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Subcategory: Quality & Security */}
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6b7280", marginBottom: "8px" }}>
                    ⌵ Quality & Security
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "QA", count: "36,532" },
                      { name: "Security", count: "39,589" },
                      { name: "Health & Safety (HSE)", count: "21,586" },
                    ]
                      .filter((r) => r.name.toLowerCase().includes(roleSearch.toLowerCase()))
                      .map((role) => {
                        const isSelected = draftSpecializations.includes(role.name);
                        return (
                          <button
                            key={role.name}
                            onClick={() => toggleItem(draftSpecializations, role.name, setDraftSpecializations)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "5px 12px",
                              borderRadius: "9999px",
                              fontSize: "12.5px",
                              fontWeight: 500,
                              backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                              color: isSelected ? "#ffffff" : "#374151",
                              border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                              cursor: "pointer",
                            }}
                          >
                            <span>{role.name}</span>
                            <span style={{ fontSize: "11px", opacity: 0.8 }}>{role.count}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: INDUSTRY & COLLECTION (Screenshot 5) */}
            {activeTab === "industry" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                {/* Industry */}
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
                    Industry
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "FinTech", count: "8,600" },
                      { name: "Crypto", count: "483" },
                      { name: "E-commerce", count: "1,491" },
                      { name: "Gambling", count: "225" },
                      { name: "GameDev", count: "771" },
                      { name: "Media", count: "1,011" },
                      { name: "Travel", count: "450" },
                      { name: "Healthcare", count: "3,105" },
                      { name: "EdTech", count: "581" },
                      { name: "GovTech", count: "4,354" },
                      { name: "DevTools", count: "4,298" },
                      { name: "Cybersecurity", count: "1,767" },
                      { name: "AI", count: "3,968" },
                      { name: "HRTech", count: "884" },
                      { name: "AdTech", count: "650" },
                      { name: "PropTech", count: "439" },
                      { name: "Logistics", count: "1,062" },
                      { name: "Mobility", count: "1,784" },
                      { name: "ClimateTech", count: "1,182" },
                      { name: "Other", count: "11,457" },
                    ].map((ind) => {
                      const isSelected = draftIndustries.includes(ind.name);
                      return (
                        <button
                          key={ind.name}
                          onClick={() => toggleItem(draftIndustries, ind.name, setDraftIndustries)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "5px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                            color: isSelected ? "#ffffff" : "#374151",
                            border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                            cursor: "pointer",
                          }}
                        >
                          <span>{ind.name}</span>
                          <span style={{ fontSize: "11px", opacity: 0.8 }}>{ind.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Company Type */}
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
                    Company type
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "Product", count: "25,529" },
                      { name: "Startup", count: "3,333" },
                      { name: "Outsource", count: "6,173" },
                      { name: "Outstaff", count: "2,355" },
                      { name: "Agency", count: "366" },
                      { name: "In-house", count: "5,399" },
                      { name: "Government", count: "1,235" },
                    ].map((ct) => {
                      const isSelected = draftCollections.includes(ct.name);
                      return (
                        <button
                          key={ct.name}
                          onClick={() => toggleItem(draftCollections, ct.name, setDraftCollections)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "5px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                            color: isSelected ? "#ffffff" : "#374151",
                            border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                            cursor: "pointer",
                          }}
                        >
                          <span>{ct.name}</span>
                          <span style={{ fontSize: "11px", opacity: 0.8 }}>{ct.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Collection */}
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#111827", marginBottom: "10px" }}>
                    Collection
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      { name: "Y Combinator", count: "2,018", icon: "🟠" },
                      { name: "Techstars", count: "236", icon: "🟢" },
                      { name: "a16z", count: "763", icon: "🟣" },
                      { name: "a16z Speedrun", count: "24", icon: "⚡" },
                      { name: "European Startups", count: "731", icon: "🇪🇺" },
                      { name: "AI Companies", count: "459", icon: "🤖" },
                      { name: "Magnificent Seven", count: "1,220", icon: "🏛️" },
                      { name: "Big Tech", count: "2,036", icon: "🏢" },
                      { name: "Unicorns", count: "2,158", icon: "🦄" },
                      { name: "Fortune 500", count: "4,790", icon: "💼" },
                      { name: "Eastern Roots", count: "630", icon: "🌏" },
                      { name: "Indian Roots", count: "213", icon: "🇮🇳" },
                      { name: "AI-Native", count: "89", icon: "✨" },
                    ].map((col) => {
                      const isSelected = draftCollections.includes(col.name);
                      return (
                        <button
                          key={col.name}
                          onClick={() => toggleItem(draftCollections, col.name, setDraftCollections)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "5px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                            color: isSelected ? "#ffffff" : "#374151",
                            border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                            cursor: "pointer",
                          }}
                        >
                          <span>{col.icon}</span>
                          <span>{col.name}</span>
                          <span style={{ fontSize: "11px", opacity: 0.8 }}>{col.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SOURCE (100+ platforms) */}
            {activeTab === "source" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>
                    Job Sources & ATS Portals
                  </div>
                  <div style={{ position: "relative", marginBottom: "12px" }}>
                    <Search size={15} color="#9ca3af" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      type="text"
                      placeholder="Search 100+ job sources (Workday, Greenhouse, Ashby, Adzuna...)"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "7px 12px 7px 32px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        fontSize: "13px",
                        outline: "none",
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", maxHeight: "400px", overflowY: "auto" }}>
                  {filteredSources.map((src) => {
                    const isSelected = draftSources.includes(src.name);
                    return (
                      <button
                        key={src.name}
                        onClick={() => toggleItem(draftSources, src.name, setDraftSources)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "5px 12px",
                          borderRadius: "9999px",
                          fontSize: "12px",
                          fontWeight: 500,
                          backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                          color: isSelected ? "#ffffff" : "#374151",
                          border: `1px solid ${isSelected ? "#5b7b12" : "transparent"}`,
                          cursor: "pointer",
                        }}
                      >
                        <span>{src.name}</span>
                        <span style={{ fontSize: "11px", opacity: 0.8 }}>{src.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: EXPERIENCE */}
            {activeTab === "experience" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Seniority Level</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["Intern", "Junior", "Middle", "Senior", "Lead", "Staff", "Principal", "C-level"].map((sen) => {
                    const isSelected = draftSeniorities.includes(sen);
                    return (
                      <button
                        key={sen}
                        onClick={() => toggleItem(draftSeniorities, sen, setDraftSeniorities)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "9999px",
                          fontSize: "13px",
                          fontWeight: 500,
                          backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                          color: isSelected ? "#ffffff" : "#374151",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {sen}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: POSTED */}
            {activeTab === "posted" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Date Posted</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[
                    { id: "today", label: "Today" },
                    { id: "3d", label: "3 days" },
                    { id: "1w", label: "1 week" },
                    { id: "2w", label: "2 weeks" },
                    { id: "1m", label: "1 month" },
                    { id: "3m", label: "3 months" },
                    { id: "all", label: "Any" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setDraftPostedWithin(p.id)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: "9999px",
                        fontSize: "13px",
                        fontWeight: 500,
                        backgroundColor: draftPostedWithin === p.id ? "#5b7b12" : "#f3f4f6",
                        color: draftPostedWithin === p.id ? "#ffffff" : "#374151",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: WORK & EMPLOYMENT */}
            {activeTab === "work" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Work format</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {["Remote", "Hybrid", "On-site"].map((wf) => {
                      const isSelected = draftWorkFormats.includes(wf);
                      return (
                        <button
                          key={wf}
                          onClick={() => toggleItem(draftWorkFormats, wf, setDraftWorkFormats)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "9999px",
                            fontSize: "13px",
                            fontWeight: 500,
                            backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                            color: isSelected ? "#ffffff" : "#374151",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {wf}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: LOCATION */}
            {activeTab === "location" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Region & Countries</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["Worldwide", "North America", "LATAM", "Europe", "UK", "MENA", "Africa", "APAC", "CIS", "India", "United States", "Singapore", "Australia", "Germany"].map((reg) => {
                    const isSelected = draftRegions.includes(reg);
                    return (
                      <button
                        key={reg}
                        onClick={() => toggleItem(draftRegions, reg, setDraftRegions)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "9999px",
                          fontSize: "13px",
                          fontWeight: 500,
                          backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                          color: isSelected ? "#ffffff" : "#374151",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {reg}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB: SKILLS */}
            {activeTab === "skills" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "8px" }}>Required Skills</div>
                  <input
                    type="text"
                    placeholder="Search technical skills..."
                    value={skillSearch}
                    onChange={(e) => setSkillSearch(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "7px 12px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      fontSize: "13px",
                      outline: "none",
                      marginBottom: "12px",
                    }}
                  />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[
                    "TypeScript", "React", "Node.js", "Next.js", "Go", "Rust", "Python",
                    "Kafka", "PostgreSQL", "Docker", "Kubernetes", "Linux", "Git", "AWS",
                    "Redis", "MongoDB", "FastAPI", "C++", "Java", "GraphQL", "Solana", "AI",
                    "Agentic AI", "Distributed Systems", "Microservices", "REST", "CI/CD"
                  ]
                    .filter((s) => s.toLowerCase().includes(skillSearch.toLowerCase()))
                    .map((sk) => {
                      const isSelected = draftSkills.includes(sk);
                      return (
                        <button
                          key={sk}
                          onClick={() => toggleItem(draftSkills, sk, setDraftSkills)}
                          style={{
                            padding: "5px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: isSelected ? "#5b7b12" : "#f3f4f6",
                            color: isSelected ? "#ffffff" : "#374151",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          {sk}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* TAB: SALARY */}
            {activeTab === "salary" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Minimum Annual Compensation</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["Any", "> $80k", "> $120k", "> $150k", "> $200k", "> ₹20 LPA", "> ₹35 LPA"].map((sal) => (
                    <button
                      key={sal}
                      className="freehire-pill"
                      style={{ padding: "6px 14px", fontSize: "13px" }}
                    >
                      {sal}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: LANGUAGE */}
            {activeTab === "language" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Working Language</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["English (Fluent)", "English (B2)", "English (B1)", "Spanish", "German", "French"].map((lang) => (
                    <button
                      key={lang}
                      className="freehire-pill"
                      style={{ padding: "6px 14px", fontSize: "13px" }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: RELOCATION */}
            {activeTab === "relocation" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Relocation & Sponsorship</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {["Visa sponsorship supported", "Relocation assistance provided", "Remote worldwide (no relocation)"].map((rel) => (
                    <button
                      key={rel}
                      className="freehire-pill"
                      style={{ padding: "6px 14px", fontSize: "13px" }}
                    >
                      {rel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: SAVED */}
            {activeTab === "saved" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>Saved Searches & Presets</div>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  Save your favorite searches and receive notifications when new matching jobs are discovered.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ padding: "12px", border: "1px solid #e5e7eb", borderRadius: "8px", display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>Golang & Systems Engineering</div>
                      <div style={{ fontSize: "11px", color: "#6b7280" }}>Remote, Worldwide · Go, Kafka, Distributed Systems</div>
                    </div>
                    <button onClick={handleApplyProfile} className="btn btn-ghost" style={{ fontSize: "12px" }}>Load</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Bar: Clear all + Show X jobs */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#ffffff",
          }}
        >
          <button
            onClick={handleClearAll}
            style={{
              background: "transparent",
              border: "none",
              color: "#6b7280",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Clear all
          </button>

          <button
            onClick={handleSaveAndClose}
            className="freehire-btn-olive"
            style={{
              padding: "9px 22px",
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Show {totalPositions.toLocaleString()} jobs</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
