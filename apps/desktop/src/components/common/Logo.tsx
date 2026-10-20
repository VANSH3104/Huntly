import React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 32, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="af-logo-g" x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F08040" />
        <stop offset="0.55" stopColor="#C8481A" />
        <stop offset="1" stopColor="#8F2E0C" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill="url(#af-logo-g)" />
    <path d="M14 22h30a8 8 0 0 1 0 16H34l-4 6H20l4-6h-2a8 8 0 0 1-8-8v-8Z" fill="#FFF7EE" />
    <path d="M46 14l1.8 4.2L52 20l-4.2 1.8L46 26l-1.8-4.2L40 20l4.2-1.8L46 14Z" fill="#FFF7EE" />
    <rect x="18" y="46" width="22" height="4" rx="2" fill="#FFF7EE" fillOpacity=".55" />
  </svg>
);
