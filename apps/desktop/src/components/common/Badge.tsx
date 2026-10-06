import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "cyan" | "emerald" | "purple" | "amber" | "rose" | "muted";
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "muted",
  className = "",
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {children}
    </span>
  );
};
