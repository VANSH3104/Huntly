import React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface ScoreRingProps {
  score: number; // 0 to 1 or 0 to 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  showPercentage?: boolean;
}

function toneFor(score: number): string {
  if (score >= 80) return "var(--success)";
  if (score >= 60) return "var(--brand)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 56,
  strokeWidth = 5,
  label,
  showPercentage = true,
}) => {
  const reduce = useReducedMotion();
  const normalized = Math.min(100, Math.max(0, score <= 1 ? Math.round(score * 100) : Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const tone = toneFor(normalized);

  return (
    <div
      className="inline-flex shrink-0 flex-col items-center justify-center"
      role="img"
      aria-label={`${label ? `${label}: ` : "Match score "}${normalized}%`}
    >
      <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border-subtle)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tone}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="transparent"
          initial={{ pathLength: reduce ? normalized / 100 : 0 }}
          animate={{ pathLength: normalized / 100 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.08 }}
        />
      </svg>
      {showPercentage && (
        <span
          className="absolute inset-x-0 text-center font-semibold tabular-nums text-foreground"
          style={{ fontSize: Math.max(10, size * 0.26), top: "50%", transform: "translateY(-50%)", lineHeight: 1 }}
        >
          {normalized}
          <span className="text-muted-foreground" style={{ fontSize: "0.7em" }}>
            %
          </span>
        </span>
      )}
      </div>
      {label && <span className="mt-1 text-[11px] font-medium text-muted-foreground">{label}</span>}
    </div>
  );
};
