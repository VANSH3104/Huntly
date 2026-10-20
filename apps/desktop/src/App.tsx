import { MotionConfig } from "framer-motion";
import { Bell, Database } from "lucide-react";
import { useStore } from "./store/useStore";
import { Sidebar } from "./components/layout/Sidebar";
import { Header } from "./components/layout/Header";
import { CommandPalette } from "./components/common/CommandPalette";
import { ConfirmHost } from "./components/common/ConfirmHost";
import { JobDetailModal } from "./views/JobDetailModal";
import { AutoApplyDock } from "./components/autoapply/AutoApplyDock";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import type { NavTab } from "./types";

import { DashboardView } from "./views/DashboardView";
import { JobsView } from "./views/JobsView";
import { TechRadarView } from "./views/TechRadarView";
import { DiscoveryView } from "./views/DiscoveryView";
import { ApplicationsView } from "./views/ApplicationsView";
import { ResumeStudioView } from "./views/ResumeStudioView";
import { AnalyticsView } from "./views/AnalyticsView";
import { SettingsView } from "./views/SettingsView";

const VIEWS: Record<NavTab, React.ComponentType> = {
  dashboard: DashboardView,
  jobs: JobsView,
  radar: TechRadarView,
  discovery: DiscoveryView,
  applications: ApplicationsView,
  resume: ResumeStudioView,
  analytics: AnalyticsView,
  settings: SettingsView,
};

export const App: React.FC = () => {
  const { currentTab, isNotificationPanelOpen, setIsNotificationPanelOpen } = useStore();
  const View = VIEWS[currentTab] ?? DashboardView;

  return (
    <MotionConfig reducedMotion="user">
      <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties} className="app-container">
        <Sidebar />
        <SidebarInset className="main-content">
          <Header />
          <div key={currentTab} className="page-view animate-in fade-in-50 duration-150">
            <View />
          </div>
        </SidebarInset>

        <CommandPalette />
        <JobDetailModal />
        <AutoApplyDock />
        <ConfirmHost />
        <Toaster position="bottom-right" />

        <Sheet open={isNotificationPanelOpen} onOpenChange={setIsNotificationPanelOpen}>
          <SheetContent className="w-[380px] sm:max-w-[380px]">
            <SheetHeader>
              <SheetTitle>Notifications</SheetTitle>
              <SheetDescription>Events from your crawl engine and agents.</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2.5 px-4">
              <div className="flex gap-3 rounded-lg border border-border bg-card p-3 text-[12.5px]">
                <Database className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <div className="font-medium text-foreground">Crawl engine initialized</div>
                  <div className="mt-0.5 text-muted-foreground">
                    Connected to the local SQLite database with ATS adapters and query generators ready.
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <Bell className="size-3.5" /> You are all caught up.
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </SidebarProvider>
    </MotionConfig>
  );
};
