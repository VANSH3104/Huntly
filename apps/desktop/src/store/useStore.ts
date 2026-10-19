import { create } from "zustand";
import type { NavTab, JobFilterState, AdvancedJobFilters } from "../types";

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
  isAutoApplyDockOpen: boolean;
  setIsAutoApplyDockOpen: (open: boolean) => void;
  setIsNotificationPanelOpen: (open: boolean) => void;

  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  toggleTheme: () => void;
}

export const defaultAdvancedFilters: AdvancedJobFilters = {
  excludeKeywords: "",
  includeCompanies: "",
  excludeCompanies: "",
  titleOnly: false,
  includeDescription: false,
  searchMode: "any",
  exactWord: false,
  skillsMode: "any",
  employmentType: [],
  experienceMin: null,
  experienceMax: null,
  salaryMin: null,
  hasSalary: false,
  country: "",
  visaSponsorship: false,
  postedAfter: "",
};

const defaultFilters: JobFilterState = {
  search: "",
  role: "",
  specialization: "",
  specializations: [],
  location: "",
  region: "",
  regions: [],
  remoteOnly: false,
  workFormat: "",
  workFormats: [],
  seniority: "",
  seniorities: [],
  sources: "",
  sourceList: [],
  skills: "",
  skillList: [],
  industry: "",
  industries: [],
  collection: "",
  collections: [],
  minScore: 0,
  ats: "",
  status: "active",
  sortBy: "matchScore",
  sortOrder: "desc",
  postedWithin: "all",
  hideApplied: true,
  advanced: defaultAdvancedFilters,
};

const FILTERS_STORAGE_KEY = "agentforge-job-filters";

// Merges over defaults so filters saved by an older build still get new fields.
function loadFilters(): JobFilterState {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return defaultFilters;
    const saved = JSON.parse(raw) as Partial<JobFilterState>;
    return { ...defaultFilters, ...saved, advanced: { ...defaultAdvancedFilters, ...saved.advanced } };
  } catch {
    return defaultFilters;
  }
}

function saveFilters(filters: JobFilterState): void {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // storage blocked or full; filters still work for this session
  }
}

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

  filters: loadFilters(),
  setFilters: (newFilters) =>
    set((state) => {
      const filters = { ...state.filters, ...newFilters };
      saveFilters(filters);
      return { filters };
    }),
  resetFilters: () => {
    saveFilters(defaultFilters);
    set({ filters: defaultFilters });
  },

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
  isAutoApplyDockOpen: false,
  setIsAutoApplyDockOpen: (open) => set({ isAutoApplyDockOpen: open }),
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
