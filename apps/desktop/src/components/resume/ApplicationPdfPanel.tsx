import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileOutput, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResumeFileCard } from "@/components/autoapply/ResumeFileCard";

export const READINESS_KEY = ["auto-apply", "readiness"] as const;

/** The PDF auto-apply attaches to forms, read from the readiness endpoint. */
export function useAutoApplyResumePdf() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: READINESS_KEY, queryFn: () => api.autoApply.readiness() });
  return {
    resumePdf: query.data?.resumePdf ?? null,
    loading: query.isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: READINESS_KEY }),
  };
}

export const ApplicationPdfPanel: React.FC<{ onExport: () => void; exporting: boolean }> = ({ onExport, exporting }) => {
  const { resumePdf, loading, refresh } = useAutoApplyResumePdf();
  return (
    <div className="flex min-w-0 flex-col gap-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-[14px] font-semibold tracking-tight text-foreground">Application PDF</h2>
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            The file auto-apply uploads to application forms. It does not change when you edit LaTeX.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={onExport} disabled={exporting}>
          {exporting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <FileOutput data-icon="inline-start" />}
          {exporting ? "Compiling…" : "Use as auto-apply PDF"}
        </Button>
      </div>
      {loading ? <Skeleton className="h-16 w-full rounded-xl" /> : <ResumeFileCard resume={resumePdf} onChange={refresh} />}
    </div>
  );
};
