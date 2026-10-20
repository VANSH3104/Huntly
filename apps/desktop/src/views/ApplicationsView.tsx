import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { Badge } from "../components/common/Badge";
import {
  CheckSquare,
  Clock,
  Building,
  MapPin,
  ExternalLink,
  Trash2,
  MoveRight,
  Plus,
  Zap,
} from "lucide-react";

interface Column {
  id: string;
  title: string;
  badgeVariant: "muted" | "cyan" | "purple" | "amber" | "emerald" | "rose";
}

const COLUMNS: Column[] = [
  { id: "saved", title: "Saved", badgeVariant: "muted" },
  { id: "applied", title: "Applied", badgeVariant: "cyan" },
  { id: "oa", title: "Assessment", badgeVariant: "purple" },
  { id: "interview", title: "Interview", badgeVariant: "amber" },
  { id: "offer", title: "Offer", badgeVariant: "emerald" },
  { id: "rejected", title: "Archived / Rejected", badgeVariant: "rose" },
];

export const ApplicationsView: React.FC = () => {
  const queryClient = useQueryClient();
  const { setSelectedJobId } = useStore();

  const { data: applications, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.applications.list(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.applications.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.applications.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applications"] }),
  });

  const moveNext = (app: any) => {
    const currentIndex = COLUMNS.findIndex((c) => c.id === app.status);
    if (currentIndex >= 0 && currentIndex < COLUMNS.length - 2) {
      updateMutation.mutate({ id: app.id, status: COLUMNS[currentIndex + 1].id });
    }
  };

  return (
    <div
      className="page-container"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        height: "100%",
        overflowX: "auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>Application Pipeline</h2>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Track every submission directly tied to official job postings and ATS records.
          </div>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          minWidth: "1200px",
          height: "calc(100vh - 160px)",
          paddingBottom: "16px",
        }}
      >
        {COLUMNS.map((col) => {
          const colApps = applications?.filter((a: any) => (a.status || "saved") === col.id) ?? [];

          return (
            <div
              key={col.id}
              className="glass-panel"
              style={{
                flex: 1,
                minWidth: "200px",
                display: "flex",
                flexDirection: "column",
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>{col.title}</span>
                <Badge variant={col.badgeVariant}>{colApps.length}</Badge>
              </div>

              {/* Column Cards */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {isLoading ? (
                  <div style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: "12px" }}>
                    Loading...
                  </div>
                ) : colApps.length === 0 ? (
                  <div
                    style={{
                      padding: "24px 12px",
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      border: "1px dashed var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    No applications
                  </div>
                ) : (
                  colApps.map((app: any) => (
                    <div
                      key={app.id}
                      className="glass-panel glass-panel-hover"
                      style={{
                        padding: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        cursor: "pointer",
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-md)",
                      }}
                      onClick={() => app.jobId && setSelectedJobId(app.jobId)}
                    >
                      <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>
                        {app.jobTitle || "Software Engineer"}
                      </div>
                      {typeof app.notes === "string" && app.notes.startsWith("Auto-applied") && (
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--accent-emerald)", display: "flex", alignItems: "center", gap: "4px" }}>
                          <Zap size={10} /> Applied by Auto-Apply
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--accent-indigo)",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Building size={12} />
                        {app.companyName || "Tech Company"}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: "6px",
                          paddingTop: "6px",
                          borderTop: "1px solid var(--border-subtle)",
                        }}
                      >
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {app.updatedAt ? new Date(app.updatedAt).toLocaleDateString() : "Active"}
                        </span>

                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {col.id !== "offer" && col.id !== "rejected" && (
                            <button
                              className="btn-icon btn-ghost"
                              style={{ width: "24px", height: "24px" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                moveNext(app);
                              }}
                              title="Advance stage"
                            >
                              <MoveRight size={13} color="var(--accent-cyan)" />
                            </button>
                          )}
                          <button
                            className="btn-icon btn-ghost"
                            style={{ width: "24px", height: "24px" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(app.id);
                            }}
                            title="Remove application"
                          >
                            <Trash2 size={13} color="var(--text-muted)" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
