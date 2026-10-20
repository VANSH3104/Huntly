import { create } from "zustand";
import type { NavTab, JobFilterState, AdvancedJobFilters } from "../types";

export const THEMES = [
  { id: "soft-sand", label: "Sand", dark: false, swatch: ["#f6f4ee", "#c8481a", "#231d16"] },
  { id: "ocean", label: "Ocean", dark: false, swatch: ["#f2f5f9", "#2563eb", "#131f2e"] },
  { id: "forest", label: "Forest", dark: false, swatch: ["#f2f5ee", "#2c7a4b", "#18221a"] },
  { id: "pastel-dreamland", label: "Dream", dark: false, swatch: ["#f8f3fc", "#7a4fc2", "#231a2e"] },
  { id: "dark", label: "Graphite", dark: true, swatch: ["#100e0c", "#ff7f4d", "#f3ede4"] },
  { id: "midnight", label: "Midnight", dark: true, swatch: ["#0b0f1a", "#7c9cff", "#e8edf8"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const DEFAULT_THEME: ThemeId = "soft-sand";
const THEME_KEY = "huntly-theme";

export const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export const isDarkTheme = (id: ThemeId) => THEMES.find((t) => t.id === id)?.dark ?? false;

const LAST_KEY = (dark: boolean) => `${THEME_KEY}-last-${dark ? "dark" : "light"}`;

function lastTheme(dark: boolean): ThemeId {
  try {
    const saved = localStorage.getItem(LAST_KEY(dark));
    if (isThemeId(saved) && isDarkTheme(saved) === dark) return saved;
  } catch {
    // fall through to defaults
  }
  return dark ? "dark" : DEFAULT_THEME;
}

function applyTheme(theme: ThemeId): void {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(LAST_KEY(isDarkTheme(theme)), theme);
  } catch {
    // storage blocked; theme still applies for this session
  }
  window.setTimeout(() => root.classList.remove("theme-switching"), 250);
}

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

const FILTERS_STORAGE_KEY = "huntly-job-filters";

// Merges over defaults so filters saved by an older build still get new fields.
function loadFilters(): JobFilterState {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY) ?? localStorage.getItem("agentforge-job-filters");
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
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (isThemeId(saved)) return saved;
  } catch {
    // fall through to default
  }
  return DEFAULT_THEME;
};

const initialTheme = getInitialTheme();
document.documentElement.setAttribute("data-theme", initialTheme);

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
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next = lastTheme(!isDarkTheme(state.theme));
      applyTheme(next);
      return { theme: next };
    }),
}));
