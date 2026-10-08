import { create } from "zustand";
import type { NavTab, JobFilterState } from "../types";

export type ThemeId =
  | "soft-sand"
  | "soft-peachy"
  | "pastel-bliss"
  | "pastel-dreamland"
  | "dark"
  | "light";

interface AppState {
  currentTab: NavTab;
  setCurrentTab: (tab: NavTab) => void;

  filters: JobFilterState;
  setFilters: (filters: Partial<JobFilterState>) => void;
  resetFilters: () => void;

  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;

  isJobModalOpen: boolean;
  setIsJobModalOpen: (open: boolean) => void;

  isTailorModalOpen: boolean;
  setIsTailorModalOpen: (open: boolean) => void;

  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;

  isNotificationPanelOpen: boolean;
  setIsNotificationPanelOpen: (open: boolean) => void;

  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
}

const defaultFilters: JobFilterState = {
  search: "",
  role: "",
  location: "",
  remoteOnly: false,
  minScore: 0,
  ats: "",
  status: "active",
  sortBy: "matchScore",
  sortOrder: "desc",
  postedWithin: "all",
};

const getInitialTheme = (): ThemeId => {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("agentforge-theme") as ThemeId | null;
    if (saved && saved !== ("golden-summer" as any)) return saved;
  }
  return "soft-sand"; // Default to elegant Soft Sand linen aesthetic
};

const initialTheme = getInitialTheme();
if (typeof window !== "undefined") {
  document.documentElement.setAttribute("data-theme", initialTheme);
}

export const useStore = create<AppState>((set) => ({
  currentTab: "dashboard",
  setCurrentTab: (tab) => set({ currentTab: tab }),

  filters: defaultFilters,
  setFilters: (newFilters) =>
    set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  resetFilters: () => set({ filters: defaultFilters }),

  selectedJobId: null,
  setSelectedJobId: (id) =>
    set({ selectedJobId: id, isJobModalOpen: id !== null }),

  isJobModalOpen: false,
  setIsJobModalOpen: (open) =>
    set({ isJobModalOpen: open, ...(!open ? { selectedJobId: null } : {}) }),

  isTailorModalOpen: false,
  setIsTailorModalOpen: (open) => set({ isTailorModalOpen: open }),

  isCommandPaletteOpen: false,
  setIsCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),

  isNotificationPanelOpen: false,
  setIsNotificationPanelOpen: (open) =>
    set({ isNotificationPanelOpen: open }),

  theme: initialTheme,
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("agentforge-theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === "dark" ? "soft-sand" : "dark";
      if (typeof window !== "undefined") {
        localStorage.setItem("agentforge-theme", nextTheme);
        document.documentElement.setAttribute("data-theme", nextTheme);
      }
      return { theme: nextTheme };
    }),
}));
