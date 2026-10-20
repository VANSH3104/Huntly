import React from "react";
import {
  BarChart3,
  Briefcase,
  CheckSquare,
  Compass,
  Cpu,
  FileText,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  Sidebar as ShellSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Logo } from "../common/Logo";
import { useStore } from "../../store/useStore";
import type { NavTab } from "../../types";

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Overview", icon: Cpu },
      { id: "jobs", label: "Job Feed", icon: Briefcase },
      { id: "radar", label: "Tech Radar", icon: Sparkles },
      { id: "discovery", label: "Discovery", icon: Compass },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { id: "applications", label: "Applications", icon: CheckSquare },
      { id: "resume", label: "Resume Studio", icon: FileText },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "analytics", label: "Market Insights", icon: BarChart3 },
    ],
  },
];

export const Sidebar: React.FC = () => {
  const { currentTab, setCurrentTab } = useStore();

  return (
    <ShellSidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="gap-0 p-3">
        <div className="flex items-center gap-2.5">
          <Logo size={30} className="shrink-0 drop-shadow-sm" />
          <div className="flex min-w-0 flex-1 flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-semibold tracking-tight text-foreground">AgentForge</span>
          </div>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] font-medium text-muted-foreground">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={currentTab === item.id}
                      tooltip={item.label}
                      onClick={() => setCurrentTab(item.id)}
                      className="h-9 gap-2.5 text-[13px] data-[active=true]:font-medium data-[active=true]:shadow-sm data-[active=true]:ring-1 data-[active=true]:ring-border"
                    >
                      <item.icon className={currentTab === item.id ? "text-primary" : "text-muted-foreground"} />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-2">
        <SidebarSeparator className="mx-0 mb-1" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={currentTab === "settings"}
              tooltip="Settings"
              onClick={() => setCurrentTab("settings")}
              className="h-9 gap-2.5 text-[13px]"
            >
              <Settings className="text-muted-foreground" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </ShellSidebar>
  );
};
