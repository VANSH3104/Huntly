import { create } from "zustand";
import type { NavTab, JobFilterState } from "../types";

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
};

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
}));
