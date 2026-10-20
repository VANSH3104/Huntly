import React from "react";
import { Badge as UIBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type BadgeTone = "cyan" | "emerald" | "purple" | "amber" | "rose" | "muted";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeTone;
  className?: string;
}

// Tinted status badges. Every tone resolves to theme tokens, so it follows all five themes.
const TONES: Record<BadgeTone, string> = {
  cyan: "border-[color-mix(in_srgb,var(--accent-cyan)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-cyan)_11%,transparent)] text-[var(--accent-cyan)]",
  emerald:
    "border-[color-mix(in_srgb,var(--accent-emerald)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-emerald)_11%,transparent)] text-[var(--accent-emerald)]",
  purple: "border-[var(--brand-line)] bg-[var(--brand-soft)] text-primary",
  amber:
    "border-[color-mix(in_srgb,var(--accent-amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] text-[var(--accent-amber)]",
  rose: "border-[color-mix(in_srgb,var(--accent-rose)_28%,transparent)] bg-[color-mix(in_srgb,var(--accent-rose)_11%,transparent)] text-[var(--accent-rose)]",
  muted: "border-border bg-muted text-muted-foreground",
};

export const Badge: React.FC<BadgeProps> = ({ children, variant = "muted", className }) => (
  <UIBadge
    variant="outline"
    className={cn("text-[11px] font-medium", TONES[variant], className)}
  >
    {children}
  </UIBadge>
);
