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
  let strokeColor = "#64748b";
  let textColor = "#475569";

  if (normalized >= 85) {
    strokeColor = "#2563eb"; // sapphire blue
    textColor = "#1d4ed8";
  } else if (normalized >= 70) {
    strokeColor = "#4f46e5"; // indigo
    textColor = "#4338ca";
  } else if (normalized >= 50) {
    strokeColor = "#0284c7"; // sky
    textColor = "#0369a1";
  } else if (normalized >= 30) {
    strokeColor = "#d97706"; // amber
    textColor = "#b45309";
  } else {
    strokeColor = "#e11d48"; // rose
    textColor = "#be123c";
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
        }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border-subtle)"
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
