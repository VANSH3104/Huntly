import React from "react";

interface ScoreRingProps {
  score: number; // 0 to 1 or 0 to 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 56,
  strokeWidth = 5,
  label,
  showPercentage = true,
}) => {
  // Normalize score to 0 - 100
  const normalized = Math.min(100, Math.max(0, score <= 1 ? Math.round(score * 100) : Math.round(score)));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (normalized / 100) * circumference;

  // Curated color based on score
  let strokeColor = "#64748b"; // muted
  let glowColor = "rgba(100, 116, 139, 0.2)";
  let textColor = "#94a3b8";

  if (normalized >= 85) {
    strokeColor = "#10b981"; // emerald
    glowColor = "rgba(16, 185, 129, 0.4)";
    textColor = "#34d399";
  } else if (normalized >= 70) {
    strokeColor = "#06b6d4"; // cyan
    glowColor = "rgba(6, 182, 212, 0.4)";
    textColor = "#38bdf8";
  } else if (normalized >= 50) {
    strokeColor = "#3b82f6"; // blue
    glowColor = "rgba(59, 130, 246, 0.4)";
    textColor = "#60a5fa";
  } else if (normalized >= 30) {
    strokeColor = "#f59e0b"; // amber
    glowColor = "rgba(245, 158, 11, 0.4)";
    textColor = "#fbbf24";
  } else {
    strokeColor = "#f43f5e"; // rose
    glowColor = "rgba(244, 63, 94, 0.4)";
    textColor = "#fb7185";
  }

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: "rotate(-90deg)",
          filter: `drop-shadow(0 0 6px ${glowColor})`,
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{
            transition: "stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      </svg>
      {showPercentage && (
        <span
          style={{
            position: "absolute",
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: size * 0.28,
            color: textColor,
          }}
        >
          {normalized}%
        </span>
      )}
      {label && (
        <span
          style={{
            fontSize: "11px",
            color: "var(--text-secondary)",
            marginTop: "4px",
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};
