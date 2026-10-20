import React, { useRef, useState } from "react";
import { FileText, FileUp, Loader2, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { confirmDialog, errorMessage, toast } from "@/lib/notify";
import { cn } from "@/lib/utils";

interface ResumeFileCardProps {
  resume: { size: number; updatedAt: number } | null;
  onChange: () => void | Promise<void>;
  className?: string;
}

const formatSize = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const ResumeFileCard: React.FC<ResumeFileCardProps> = ({ resume, onChange, className }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(false);

  const upload = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("That is not a PDF", { description: "Choose your resume as a PDF file." });
      return;
    }
    setBusy(true);
    try {
      await api.autoApply.uploadResumePdf(file);
      await onChange();
      toast.success(resume ? "Resume replaced" : "Resume uploaded", { description: file.name });
    } catch (err) {
      toast.error("Could not upload the resume", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: "Remove your resume?",
      description: "Auto-apply needs a PDF to attach to forms. You can upload another one at any time.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.autoApply.deleteResumePdf();
      await onChange();
      toast.success("Resume removed");
    } catch (err) {
      toast.error("Could not remove the resume", { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border p-3",
          resume ? "border-border bg-muted/40" : "border-dashed border-[var(--border-hover)] bg-muted/30",
          className
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-primary">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{resume ? "Resume PDF" : "No resume uploaded"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {resume
              ? `${formatSize(resume.size)} · updated ${new Date(resume.updatedAt).toLocaleDateString()}`
              : "Forms need a PDF to attach. It stays on this computer."}
          </p>
        </div>
        {resume && (
          <Button variant="ghost" size="sm" onClick={() => setViewing(true)}>
            View
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileUp />}
          {resume ? "Replace" : "Upload PDF"}
        </Button>
        {resume && (
          <Button variant="ghost" size="icon-sm" aria-label="Remove resume" onClick={remove} disabled={busy}>
            <Trash2 />
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>

      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent className="flex h-[min(90vh,900px)] flex-col gap-3 sm:max-w-4xl">
          <DialogHeader className="text-left">
            <DialogTitle>Your resume</DialogTitle>
            <DialogDescription>This is the file auto-apply attaches to application forms.</DialogDescription>
          </DialogHeader>
          {viewing && resume && (
            <iframe title="Resume preview" src={api.autoApply.resumePdfUrl(resume.updatedAt)} className="min-h-0 flex-1 rounded-lg border border-border bg-card" />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
