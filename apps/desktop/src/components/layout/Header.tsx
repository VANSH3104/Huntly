import React, { useState } from "react";
import { Bell, Check, Flame, Moon, Palette, RefreshCw, Search, Sun } from "lucide-react";
import { useStore, THEMES, isDarkTheme } from "../../store/useStore";
import { api } from "../../lib/api";
import { toast, errorMessage } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavTab } from "../../types";

const PAGE_TITLES: Record<NavTab, { title: string; hint: string }> = {
  dashboard: { title: "Overview", hint: "Your recruiting pulse at a glance" },
  jobs: { title: "Job Feed", hint: "Verified roles ranked against your profile" },
  radar: { title: "Tech Radar", hint: "What the market is hiring for right now" },
  discovery: { title: "Discovery", hint: "Career pages and ATS sources" },
  applications: { title: "Applications", hint: "Track every role through the funnel" },
  resume: { title: "Resume Studio", hint: "LaTeX resumes tailored per role" },
  analytics: { title: "Market Insights", hint: "Compensation and demand trends" },
  settings: { title: "Settings", hint: "Keys, sources and preferences" },
};

const ThemePicker: React.FC = () => {
  const { theme, setTheme, toggleTheme } = useStore();
  const [open, setOpen] = useState(false);
  const dark = isDarkTheme(theme);
  return (
    <>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
    </Tooltip>
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="Change theme">
              <Palette />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Theme</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-60 p-2">
        <div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">Appearance</div>
        {THEMES.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTheme(t.id);
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent"
          >
            <span
              className="flex h-6 w-10 shrink-0 overflow-hidden rounded-md border border-border"
              aria-hidden="true"
            >
              <span className="flex-[2]" style={{ background: t.swatch[0] }} />
              <span className="flex-1" style={{ background: t.swatch[1] }} />
              <span className="flex-1" style={{ background: t.swatch[2] }} />
            </span>
            <span className="flex-1">{t.label}</span>
            {theme === t.id && <Check className="size-3.5 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
    </>
  );
};

export const Header: React.FC = () => {
  const { currentTab, setIsCommandPaletteOpen, setIsNotificationPanelOpen } = useStore();
  const [isCrawling, setIsCrawling] = useState(false);
  const page = PAGE_TITLES[currentTab] ?? PAGE_TITLES.dashboard;

  const handleQuickCrawl = async () => {
    setIsCrawling(true);
    try {
      await api.crawl.start({ scope: "quick" });
      toast.success("Discovery started", { description: "The crawl worker is running in the background." });
    } catch (err) {
      toast.error("Could not start discovery", { description: errorMessage(err) });
    } finally {
      setIsCrawling(false);
    }
  };

  return (
    <header className="z-10 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-[var(--bg-header)] px-5 backdrop-blur-xl">
      <SidebarTrigger className="-ml-1 md:hidden" />
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 style={{ fontFamily: "var(--font-sans)" }} className="truncate text-[17px] font-semibold tracking-tight text-foreground">{page.title}</h1>
        <Separator orientation="vertical" className="hidden !h-4 self-center lg:block" />
        <p className="hidden truncate text-[12.5px] text-muted-foreground lg:block">{page.hint}</p>
      </div>

      <button
        onClick={() => setIsCommandPaletteOpen(true)}
        className="group hidden h-8 w-60 items-center gap-2 rounded-lg border border-border bg-[var(--bg-input)] px-3 text-left text-xs text-muted-foreground transition-colors hover:border-[var(--border-hover)] sm:flex"
      >
        <Search className="size-3.5" />
        <span className="flex-1">Search jobs, commands…</span>
        <kbd>⌘K</kbd>
      </button>

      <Button variant="outline" size="sm" onClick={handleQuickCrawl} disabled={isCrawling}>
        {isCrawling ? <RefreshCw className="animate-spin" /> : <Flame className="text-[var(--accent-amber)]" />}
        {isCrawling ? "Discovering…" : "Run discovery"}
      </Button>

      <ThemePicker />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Notifications" onClick={() => setIsNotificationPanelOpen(true)}>
            <Bell />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
    </header>
  );
};
