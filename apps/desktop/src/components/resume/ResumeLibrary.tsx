import React, { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FilePlus2,
  FileText,
  FileUp,
  History,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import type { ResumeRecord } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatResumeDate, parseResume } from "./resume-utils";

interface ResumeLibraryProps {
  resumes: ResumeRecord[];
  loading: boolean;
  selectedId: string | null;
  draftName: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onUpload: (file: File) => void;
  onActivate: (r: ResumeRecord) => void;
  onDuplicate: (r: ResumeRecord) => void;
  onRename: (r: ResumeRecord) => void;
  onDelete: (r: ResumeRecord) => void;
}

export const ResumeLibrary: React.FC<ResumeLibraryProps> = ({
  resumes,
  loading,
  selectedId,
  draftName,
  onSelect,
  onNew,
  onUpload,
  onActivate,
  onDuplicate,
  onRename,
  onDelete,
}) => {
  const [showPrevious, setShowPrevious] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const empty = !loading && resumes.length === 0 && draftName === null;

  // The main resume is the active one, or the first/latest resume
  const mainResume = resumes.find((r) => r.isActive) ?? resumes[0] ?? null;
  // All other resumes are previous versions
  const previousResumes = mainResume ? resumes.filter((r) => r.id !== mainResume.id) : [];

  const renderResumeItem = (r: ResumeRecord, isMain: boolean = false) => {
    const selected = r.id === selectedId;
    const skills = parseResume(r.parsedJson).skills.length;
    return (
      <motion.li
        key={r.id}
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="group/item relative"
      >
        <button
          type="button"
          onClick={() => onSelect(r.id)}
          aria-current={selected ? "true" : undefined}
          className={cn(
            "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 pr-10 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
            selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
            isMain && !selected && "bg-surface/50 border border-border/40"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {isMain && <Star className="size-3 text-amber-500 fill-amber-500 shrink-0" />}
            <span className="truncate text-[13px] font-medium text-foreground">{r.name}</span>
            {r.isActive && (
              <Badge variant="secondary" className="shrink-0 text-[10px] h-4.5 px-1.5">
                Active
              </Badge>
            )}
          </span>
          <span className="truncate text-[12px] text-muted-foreground">
            {formatResumeDate(r.createdAt)} · {skills} {skills === 1 ? "skill" : "skills"}
          </span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${r.name}`}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={r.isActive} onSelect={() => onActivate(r)}>
                <CheckCircle2 />
                Set as active
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onRename(r)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onDuplicate(r)}>
                <Copy />
                Duplicate
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(r)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold tracking-tight text-foreground">Resumes</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Upload .tex file" title="Upload .tex file" onClick={() => fileRef.current?.click()}>
            <FileUp />
          </Button>
          <Button variant="outline" size="sm" onClick={onNew}>
            <FilePlus2 data-icon="inline-start" />
            New
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".tex,text/x-tex,application/x-tex"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onUpload(f);
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="flex flex-col gap-1 px-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5 py-2.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : empty ? (
          <Empty className="p-4 md:p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No resumes yet</EmptyTitle>
              <EmptyDescription>Start from a template or upload a .tex file you already have.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={onNew}>
                <FilePlus2 data-icon="inline-start" />
                Start from template
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                <FileUp data-icon="inline-start" />
                Upload .tex
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Main Resume Section */}
            <div>
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Main Resume
              </div>
              <ul className="flex flex-col gap-0.5" aria-label="Main resume">
                <AnimatePresence initial={false}>
                  {draftName !== null && (
                    <motion.li key="draft" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <div aria-current="true" className="flex flex-col gap-0.5 rounded-lg bg-accent px-3 py-2.5 text-accent-foreground">
                        <span className="truncate text-[13px] font-medium">{draftName}</span>
                        <span className="text-[12px] text-muted-foreground">Not saved yet</span>
                      </div>
                    </motion.li>
                  )}
                  {mainResume && renderResumeItem(mainResume, true)}
                </AnimatePresence>
              </ul>
            </div>

            {/* Previous Versions Toggle & List */}
            {previousResumes.length > 0 && (
              <div className="flex flex-col border-t border-border/50 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrevious((prev) => !prev)}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/70"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <History className="size-3.5 text-muted-foreground" />
                    <span>Previous resumes ({previousResumes.length})</span>
                  </span>
                  {showPrevious ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </Button>

                {showPrevious && (
                  <ul className="flex flex-col gap-0.5 pt-1.5" aria-label="Previous resumes">
                    <AnimatePresence initial={false}>
                      {previousResumes.map((r) => renderResumeItem(r, false))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
