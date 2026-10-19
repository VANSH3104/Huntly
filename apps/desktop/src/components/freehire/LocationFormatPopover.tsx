import React, { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown } from "lucide-react";

interface LocationFormatPopoverProps {
  workFormats: string[];
  regions: string[];
  onToggleWorkFormat: (format: string) => void;
  onToggleRegion: (region: string) => void;
}

const ALL_WORK_FORMATS = ["Remote", "Hybrid", "On-site"];
const ALL_REGIONS = [
  "Worldwide",
  "North America",
  "LATAM",
  "Europe",
  "UK",
  "MENA",
  "Africa",
  "APAC",
  "CIS",
  "India",
];

export const LocationFormatPopover: React.FC<LocationFormatPopoverProps> = ({
  workFormats,
  regions,
  onToggleWorkFormat,
  onToggleRegion,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const activeCount = workFormats.length + regions.length;
  let labelText = "Location";
  if (regions.length === 1 && workFormats.length === 0) {
    labelText = regions[0];
  } else if (workFormats.length === 1 && regions.length === 0) {
    labelText = workFormats[0];
  } else if (activeCount > 1) {
    const first = regions[0] || workFormats[0];
    labelText = `${first} +${activeCount - 1}`;
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 500,
          backgroundColor: activeCount > 0 ? "rgba(91, 123, 18, 0.12)" : "var(--bg-card)",
          color: activeCount > 0 ? "#5b7b12" : "var(--text-primary)",
          border: `1px solid ${activeCount > 0 ? "#5b7b12" : "var(--border-subtle)"}`,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s ease",
        }}
      >
        <Globe size={15} color={activeCount > 0 ? "#5b7b12" : "var(--text-muted)"} />
        <span>{labelText}</span>
        <ChevronDown size={14} color="var(--text-muted)" />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: "320px",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.15)",
            padding: "16px",
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
            Location & format
          </div>

          {/* Work format */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
              Work format
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {ALL_WORK_FORMATS.map((wf) => {
                const isActive = workFormats.includes(wf);
                return (
                  <button
                    key={wf}
                    onClick={() => onToggleWorkFormat(wf)}
                    className={`forge-job-pill ${isActive ? "active" : ""}`}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      borderRadius: "9999px",
                    }}
                  >
                    {wf}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Region */}
          <div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
              Region
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {ALL_REGIONS.map((reg) => {
                const isActive = regions.includes(reg);
                return (
                  <button
                    key={reg}
                    onClick={() => onToggleRegion(reg)}
                    className={`forge-job-pill ${isActive ? "active" : ""}`}
                    style={{
                      padding: "4px 10px",
                      fontSize: "12px",
                      borderRadius: "9999px",
                    }}
                  >
                    {reg}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
