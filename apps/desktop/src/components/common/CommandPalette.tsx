import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Briefcase,
  CheckSquare,
  Compass,
  Cpu,
  FileText,
  Flame,
  Loader2,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "../../store/useStore";
import { api } from "../../lib/api";
import { toast, errorMessage } from "@/lib/notify";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { NavTab } from "../../types";

const NAV_ITEMS: { tab: NavTab; label: string; hint: string; icon: LucideIcon; keywords: string[] }[] = [
  { tab: "dashboard", label: "Overview", hint: "Dashboard", icon: Cpu, keywords: ["home", "dashboard", "stats"] },
  { tab: "jobs", label: "Job Feed", hint: "Verified roles", icon: Briefcase, keywords: ["jobs", "matches", "browse"] },
  { tab: "radar", label: "Tech Radar", hint: "News and research", icon: Sparkles, keywords: ["news", "hn", "arxiv"] },
  { tab: "discovery", label: "Discovery", hint: "Career pages and ATS", icon: Compass, keywords: ["sources", "probe", "crawl"] },
  { tab: "applications", label: "Applications", hint: "Pipeline board", icon: CheckSquare, keywords: ["kanban", "pipeline"] },
  { tab: "resume", label: "Resume Studio", hint: "LaTeX resume", icon: FileText, keywords: ["latex", "cv", "resume"] },
  { tab: "analytics", label: "Market Insights", hint: "Demand trends", icon: BarChart3, keywords: ["analytics", "charts", "skills"] },
  { tab: "settings", label: "Settings", hint: "Keys and preferences", icon: Settings, keywords: ["api", "keys", "config"] },
];

export const CommandPalette: React.FC = () => {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, setCurrentTab } = useStore();
  const [isStartingCrawl, setIsStartingCrawl] = useState(false);

  // Toggle with Cmd+K / Ctrl+K. Reads the store directly so the listener never goes stale.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const { isCommandPaletteOpen: open, setIsCommandPaletteOpen: setOpen } = useStore.getState();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigateTo = (tab: NavTab) => {
    setCurrentTab(tab);
    setIsCommandPaletteOpen(false);
  };

  const triggerCrawlNow = async () => {
    setIsStartingCrawl(true);
    try {
      await api.crawl.start({ scope: "quick" });
      toast.success("Discovery started", { description: "The crawl worker is scanning sources in the background." });
      setIsCommandPaletteOpen(false);
      setCurrentTab("discovery");
    } catch (err) {
      toast.error("Could not start discovery", { description: errorMessage(err) });
    } finally {
      setIsStartingCrawl(false);
    }
  };

  return (
    <CommandDialog
      open={isCommandPaletteOpen}
      onOpenChange={setIsCommandPaletteOpen}
      title="Command palette"
      description="Search for a page or run an action"
      className="top-[18vh] translate-y-0 sm:max-w-xl"
    >
      <CommandInput
        placeholder="Search pages and actions…"
        aria-label="Search pages and actions"
        className="rounded-none border-0 bg-transparent px-0 shadow-none focus:shadow-none"
      />
      <CommandList className="max-h-[min(420px,60vh)] pb-1">
        <CommandEmpty>No matching commands.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem
            value="run discovery crawl ats web"
            onSelect={triggerCrawlNow}
            disabled={isStartingCrawl}
          >
            {isStartingCrawl ? <Loader2 className="animate-spin" /> : <Flame className="text-primary" />}
            <span>{isStartingCrawl ? "Starting discovery…" : "Run discovery now"}</span>
            <CommandShortcut className="tracking-normal">Quick crawl</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.tab}
                value={`${item.label} ${item.keywords.join(" ")}`}
                onSelect={() => navigateTo(item.tab)}
              >
                <Icon />
                <span>{item.label}</span>
                <CommandShortcut className="tracking-normal">{item.hint}</CommandShortcut>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd>↑</kbd>
          <kbd>↓</kbd> to move <kbd>↵</kbd> to select
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>Esc</kbd> to close
        </span>
      </div>
    </CommandDialog>
  );
};
