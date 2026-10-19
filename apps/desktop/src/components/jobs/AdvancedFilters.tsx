import React from "react";
import { SlidersHorizontal, X, RotateCcw } from "lucide-react";
import type { AdvancedJobFilters, EmploymentType, JobFilterState } from "../../types";
import type { JobFacets } from "../../lib/api";
import { defaultAdvancedFilters } from "../../store/useStore";

const EMPLOYMENT_OPTIONS: Array<{ id: EmploymentType; label: string }> = [
  { id: "full-time", label: "Full-time" },
  { id: "part-time", label: "Part-time" },
  { id: "contract", label: "Contract" },
  { id: "internship", label: "Internship" },
  { id: "freelance", label: "Freelance" },
];

export interface FilterChip {
  key: string;
  label: string;
  clear: Partial<JobFilterState>;
}

// One table drives the chips, the badge count and the query params, so they cannot drift.
export function describeAdvancedChips(a: AdvancedJobFilters): FilterChip[] {
  const patch = (p: Partial<AdvancedJobFilters>): Partial<JobFilterState> => ({ advanced: { ...a, ...p } });
  const chips: FilterChip[] = [];
  if (a.excludeKeywords) chips.push({ key: "excludeKeywords", label: `Exclude: ${a.excludeKeywords}`, clear: patch({ excludeKeywords: "" }) });
  if (a.includeCompanies) chips.push({ key: "includeCompanies", label: `Only: ${a.includeCompanies}`, clear: patch({ includeCompanies: "" }) });
  if (a.excludeCompanies) chips.push({ key: "excludeCompanies", label: `Not: ${a.excludeCompanies}`, clear: patch({ excludeCompanies: "" }) });
  if (a.titleOnly) chips.push({ key: "titleOnly", label: "Title only", clear: patch({ titleOnly: false }) });
  if (a.includeDescription) chips.push({ key: "includeDescription", label: "Role in description", clear: patch({ includeDescription: false }) });
  if (a.searchMode === "all") chips.push({ key: "searchMode", label: "All terms", clear: patch({ searchMode: "any" }) });
  if (a.exactWord) chips.push({ key: "exactWord", label: "Whole words", clear: patch({ exactWord: false }) });
  if (a.skillsMode === "all") chips.push({ key: "skillsMode", label: "All skills", clear: patch({ skillsMode: "any" }) });
  for (const t of a.employmentType) {
    const label = EMPLOYMENT_OPTIONS.find((o) => o.id === t)?.label ?? t;
    chips.push({ key: `employmentType:${t}`, label, clear: patch({ employmentType: a.employmentType.filter((x) => x !== t) }) });
  }
  if (a.experienceMin !== null || a.experienceMax !== null) {
    chips.push({
      key: "experience",
      label: `${a.experienceMin ?? 0}–${a.experienceMax ?? "15+"} yrs exp`,
      clear: patch({ experienceMin: null, experienceMax: null }),
    });
  }
  if (a.salaryMin !== null) chips.push({ key: "salaryMin", label: `Salary ≥ ${a.salaryMin.toLocaleString()}`, clear: patch({ salaryMin: null }) });
  if (a.hasSalary) chips.push({ key: "hasSalary", label: "Has salary", clear: patch({ hasSalary: false }) });
  if (a.country) chips.push({ key: "country", label: `Country: ${a.country}`, clear: patch({ country: "" }) });
  if (a.visaSponsorship) chips.push({ key: "visaSponsorship", label: "Visa / relocation", clear: patch({ visaSponsorship: false }) });
  if (a.postedAfter) chips.push({ key: "postedAfter", label: `After ${a.postedAfter}`, clear: patch({ postedAfter: "" }) });
  return chips;
}

export function advancedToParams(a: AdvancedJobFilters): Record<string, string | number | undefined> {
  return {
    excludeKeywords: a.excludeKeywords || undefined,
    includeCompanies: a.includeCompanies || undefined,
    excludeCompanies: a.excludeCompanies || undefined,
    titleOnly: a.titleOnly ? 1 : undefined,
    includeDescription: a.includeDescription ? 1 : undefined,
    searchMode: a.searchMode === "all" ? "all" : undefined,
    exactWord: a.exactWord ? 1 : undefined,
    skillsMode: a.skillsMode === "all" ? "all" : undefined,
    employmentType: a.employmentType.length ? a.employmentType.join(",") : undefined,
    experienceMin: a.experienceMin ?? undefined,
    experienceMax: a.experienceMax ?? undefined,
    salaryMin: a.salaryMin ?? undefined,
    hasSalary: a.hasSalary ? 1 : undefined,
    country: a.country || undefined,
    visaSponsorship: a.visaSponsorship ? 1 : undefined,
    postedAfter: a.postedAfter || undefined,
  };
}

export const AdvancedFiltersToggle: React.FC<{ open: boolean; activeCount: number; onToggle: () => void }> = ({
  open,
  activeCount,
  onToggle,
}) => (
  <button
    type="button"
    className={open ? "btn btn-primary" : "btn btn-secondary"}
    onClick={onToggle}
    aria-expanded={open}
    aria-controls="advanced-job-filters"
    style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "6px" }}
  >
    <SlidersHorizontal size={14} />
    <span>Advanced filters</span>
    {activeCount > 0 && (
      <span
        aria-label={`${activeCount} active`}
        style={{
          fontSize: "10px",
          minWidth: "18px",
          padding: "1px 6px",
          borderRadius: "var(--radius-full)",
          background: "var(--accent-indigo)",
          color: "var(--text-inverse)",
          fontWeight: 700,
        }}
      >
        {activeCount}
      </span>
    )}
  </button>
);

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
};

const checkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "12px",
  color: "var(--text-secondary)",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "var(--text-primary)",
  marginBottom: "10px",
};

function parseNumber(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export const AdvancedFiltersPanel: React.FC<{
  value: AdvancedJobFilters;
  onChange: (next: AdvancedJobFilters) => void;
  facets?: JobFacets;
}> = ({ value, onChange, facets }) => {
  const set = (p: Partial<AdvancedJobFilters>) => onChange({ ...value, ...p });
  const activeCount = describeAdvancedChips(value).length;
  const employmentCount = (id: EmploymentType) =>
    facets?.employmentType.find((b) => b.value.replace(/\s+/g, "-") === id)?.count;

  const toggleEmployment = (id: EmploymentType) =>
    set({
      employmentType: value.employmentType.includes(id)
        ? value.employmentType.filter((t) => t !== id)
        : [...value.employmentType, id],
    });

  return (
    <section
      id="advanced-job-filters"
      aria-label="Advanced filters"
      className="glass-panel"
      style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "18px" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "18px 24px",
        }}
      >
        <div>
          <div style={sectionTitle}>Keyword matching</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={labelStyle}>
              Exclude keywords
              <input
                type="text"
                placeholder="senior, staff, clearance"
                value={value.excludeKeywords}
                onChange={(e) => set({ excludeKeywords: e.target.value })}
              />
            </label>
            <label style={checkStyle}>
              <input type="checkbox" checked={value.titleOnly} onChange={(e) => set({ titleOnly: e.target.checked })} />
              <span>Match search & role in title only</span>
            </label>
            <label style={checkStyle}>
              <input
                type="checkbox"
                checked={value.searchMode === "all"}
                onChange={(e) => set({ searchMode: e.target.checked ? "all" : "any" })}
              />
              <span>Match ALL comma-separated terms</span>
            </label>
            <label style={checkStyle}>
              <input type="checkbox" checked={value.exactWord} onChange={(e) => set({ exactWord: e.target.checked })} />
              <span>Whole words only ("intern" ≠ "internal")</span>
            </label>
            <label style={checkStyle}>
              <input
                type="checkbox"
                checked={value.includeDescription}
                onChange={(e) => set({ includeDescription: e.target.checked })}
              />
              <span>Let role match job descriptions</span>
            </label>
            <label style={labelStyle}>
              Skills match
              <select
                value={value.skillsMode}
                onChange={(e) => set({ skillsMode: e.target.value as "any" | "all" })}
              >
                <option value="any">Any listed skill</option>
                <option value="all">All listed skills</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div style={sectionTitle}>Companies & location</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <label style={labelStyle}>
              Only these companies
              <input
                type="text"
                placeholder="stripe, notion"
                value={value.includeCompanies}
                onChange={(e) => set({ includeCompanies: e.target.value })}
              />
            </label>
            <label style={labelStyle}>
              Exclude companies
              <input
                type="text"
                placeholder="acme, contoso"
                value={value.excludeCompanies}
                onChange={(e) => set({ excludeCompanies: e.target.value })}
              />
            </label>
            <label style={labelStyle}>
              Country / city
              <input
                type="text"
                placeholder="India, Singapore"
                value={value.country}
                onChange={(e) => set({ country: e.target.value })}
                list="advanced-country-options"
              />
              {facets?.country.length ? (
                <datalist id="advanced-country-options">
                  {facets.country.map((c) => (
                    <option key={c.value} value={c.value}>{`${c.value} (${c.count})`}</option>
                  ))}
                </datalist>
              ) : null}
            </label>
            <label style={checkStyle}>
              <input
                type="checkbox"
                checked={value.visaSponsorship}
                onChange={(e) => set({ visaSponsorship: e.target.checked })}
              />
              <span>Mentions visa sponsorship / relocation</span>
            </label>
          </div>
        </div>

        <div>
          <div style={sectionTitle}>Role details</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div role="group" aria-label="Employment type" style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {EMPLOYMENT_OPTIONS.map((o) => {
                const active = value.employmentType.includes(o.id);
                const count = employmentCount(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    className={`forge-job-pill${active ? " active" : ""}`}
                    aria-pressed={active}
                    onClick={() => toggleEmployment(o.id)}
                    style={{ padding: "4px 11px", fontSize: "11.5px" }}
                  >
                    {o.label}
                    {count !== undefined && <span style={{ opacity: 0.7 }}>{count}</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                Min years
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={value.experienceMin ?? ""}
                  onChange={(e) => set({ experienceMin: parseNumber(e.target.value) })}
                />
              </label>
              <label style={{ ...labelStyle, flex: 1 }}>
                Max years
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={value.experienceMax ?? ""}
                  onChange={(e) => set({ experienceMax: parseNumber(e.target.value) })}
                />
              </label>
            </div>
            <label style={labelStyle}>
              Minimum salary (posted amount)
              <input
                type="number"
                min={0}
                step={1000}
                placeholder="e.g. 100000"
                value={value.salaryMin ?? ""}
                onChange={(e) => set({ salaryMin: parseNumber(e.target.value) })}
              />
            </label>
            <label style={checkStyle}>
              <input type="checkbox" checked={value.hasSalary} onChange={(e) => set({ hasSalary: e.target.checked })} />
              <span>Only jobs that list a salary</span>
            </label>
            <label style={labelStyle}>
              Posted after
              <input type="date" value={value.postedAfter} onChange={(e) => set({ postedAfter: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {activeCount > 0 ? `${activeCount} advanced filter${activeCount === 1 ? "" : "s"} active` : "No advanced filters active"}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onChange(defaultAdvancedFilters)}
          disabled={activeCount === 0}
          style={{ fontSize: "12px", padding: "5px 10px", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <RotateCcw size={13} />
          Reset advanced
        </button>
      </div>
    </section>
  );
};

export const ActiveFilterChips: React.FC<{ chips: FilterChip[]; onClear: (chip: FilterChip) => void }> = ({ chips, onClear }) => {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" style={{ display: "flex", flexWrap: "wrap", gap: "6px", listStyle: "none", margin: 0, padding: 0 }}>
      {chips.map((chip) => (
        <li key={chip.key} className="forge-job-tag-removable">
          <span>{chip.label}</span>
          <button type="button" aria-label={`Remove filter ${chip.label}`} onClick={() => onClear(chip)}>
            <X size={11} />
          </button>
        </li>
      ))}
    </ul>
  );
};
