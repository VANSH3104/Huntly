import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Download, FilePlus2, FileText, Loader2, Play, Save } from "lucide-react";
import { api, type ResumeRecord } from "../lib/api";
import { PageContainer, PageIntro, Panel } from "../components/common/PagePrimitives";
import { confirmDialog, errorMessage, toast } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ResumeLibrary } from "../components/resume/ResumeLibrary";
import { LatexEditor } from "../components/resume/LatexEditor";
import { PdfPreview, type PreviewState } from "../components/resume/PdfPreview";
import { ResumeInsights } from "../components/resume/ResumeInsights";
import { ApplicationPdfPanel, READINESS_KEY } from "../components/resume/ApplicationPdfPanel";
import {
  SAMPLE_LATEX,
  base64ToPdfBlob,
  copyName,
  downloadBlob,
  parseResume,
  pdfFilename,
} from "../components/resume/resume-utils";

/** The document open in the editor. `id` is null for a new resume that has not been saved. */
interface Doc {
  id: string | null;
  name: string;
  latex: string;
  saved: string | null;
}

const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = IS_MAC ? "Cmd" : "Ctrl";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export const ResumeStudioView: React.FC = () => {
  const queryClient = useQueryClient();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [pane, setPane] = useState<"editor" | "preview">("editor");
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState<ResumeRecord | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: resumes = [], isLoading } = useQuery({ queryKey: ["resumes"], queryFn: () => api.resumes.list() });

  const record = doc?.id ? resumes.find((r) => r.id === doc.id) ?? null : null;
  const parsed = useMemo(() => (record ? parseResume(record.parsedJson) : null), [record]);
  const dirty = !!doc && doc.latex !== doc.saved;

  // Compiled PDF for the current preview; reused by Download and the auto-apply export when the source is unchanged.
  const compiled = useRef<{ latex: string; blob: Blob; url: string } | null>(null);
  const compileSeq = useRef(0);

  const resetPreview = useCallback(() => {
    compileSeq.current++;
    if (compiled.current) URL.revokeObjectURL(compiled.current.url);
    compiled.current = null;
    setPreview({ status: "idle" });
  }, []);

  useEffect(() => () => resetPreview(), [resetPreview]);

  const refreshResumes = () => {
    queryClient.invalidateQueries({ queryKey: ["resumes"] });
    queryClient.invalidateQueries({ queryKey: ["resume"] });
  };

  const open = useCallback(
    (r: ResumeRecord) => {
      resetPreview();
      setDoc({ id: r.id, name: r.name, latex: r.latex, saved: r.latex });
    },
    [resetPreview]
  );

  // Open the active resume (or the newest) once the library loads.
  useEffect(() => {
    if (doc || isLoading || resumes.length === 0) return;
    open(resumes.find((r) => r.isActive) ?? resumes[0]!);
  }, [doc, isLoading, resumes, open]);

  const confirmDiscard = async () =>
    !dirty ||
    confirmDialog({
      title: "Discard unsaved changes?",
      description: `Your edits to "${doc?.name}" have not been saved.`,
      confirmLabel: "Discard",
      destructive: true,
    });

  /** Compiles `latex`, shows it in the preview, and returns the PDF. Throws when compilation fails. */
  const compile = useCallback(
    async (latex: string): Promise<Blob> => {
      if (compiled.current?.latex === latex) return compiled.current.blob;
      const seq = ++compileSeq.current;
      setPreview({ status: "compiling" });
      try {
        const res = await api.resumes.compile({ latex, filename: "resume.pdf" });
        if (!res.success || !res.pdfBase64) {
          const error = res.error || "The compiler did not return a PDF.";
          if (seq === compileSeq.current) setPreview({ status: "error", error, log: res.log });
          throw new Error(error);
        }
        const blob = base64ToPdfBlob(res.pdfBase64);
        if (seq === compileSeq.current) {
          if (compiled.current) URL.revokeObjectURL(compiled.current.url);
          const url = URL.createObjectURL(blob);
          compiled.current = { latex, blob, url };
          setPreview({ status: "ready", url });
        }
        return blob;
      } catch (err) {
        if (seq === compileSeq.current) {
          setPreview((p) => (p.status === "error" ? p : { status: "error", error: errorMessage(err, "Could not reach the compiler") }));
        }
        throw err;
      }
    },
    []
  );

  const compilePreview = useCallback(() => {
    if (doc) compile(doc.latex).catch(() => {});
  }, [compile, doc]);

  // Compile once whenever a different resume is opened.
  const openedKey = doc ? doc.id ?? "draft" : null;
  const latexRef = useRef("");
  latexRef.current = doc?.latex ?? "";
  useEffect(() => {
    if (openedKey) compile(latexRef.current).catch(() => {});
  }, [openedKey, compile]);

  const saveMutation = useMutation({
    mutationFn: async (current: Doc): Promise<string> => {
      if (current.id) {
        await api.resumes.update(current.id, { latex: current.latex });
        return current.id;
      }
      const created = await api.resumes.create({ name: current.name, latex: current.latex, setActive: resumes.length === 0 });
      return created.id;
    },
    onSuccess: (id, current) => {
      setDoc((d) => (d && (d.id === current.id || d.id === null) ? { ...d, id, saved: current.latex } : d));
      refreshResumes();
      if (record?.isActive) queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });

  const save = async () => {
    if (!doc) return;
    try {
      await saveMutation.mutateAsync(doc);
      toast.success("Resume saved", { description: doc.name });
    } catch (err) {
      toast.error("Could not save resume", { description: errorMessage(err) });
    }
  };

  const rescore = useMutation({
    mutationFn: async (current: Doc) => {
      const id = await saveMutation.mutateAsync(current);
      await api.resumes.setActive(id);
    },
    onSuccess: () => {
      refreshResumes();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Resume saved and active", { description: "Match scores will refresh with the new skills." });
    },
    onError: (err) => toast.error("Could not save resume", { description: errorMessage(err) }),
  });

  // Keyboard shortcuts: Ctrl/Cmd+Enter compiles, Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        compilePreview();
        if (!wide) setPane("preview");
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [compilePreview, wide]);

  const selectResume = async (id: string) => {
    if (id === doc?.id) return;
    const r = resumes.find((x) => x.id === id);
    if (r && (await confirmDiscard())) open(r);
  };

  const newResume = async () => {
    if (!(await confirmDiscard())) return;
    resetPreview();
    setDoc({ id: null, name: "Untitled resume", latex: SAMPLE_LATEX, saved: null });
    setPane("editor");
  };

  const uploadTex = async (file: File) => {
    if (!/\.(tex|latex)$/i.test(file.name)) {
      toast.error("That is not a .tex file", { description: "Choose a LaTeX source file." });
      return;
    }
    if (!(await confirmDiscard())) return;
    try {
      const latex = await file.text();
      const name = file.name.replace(/\.(tex|latex)$/i, "") || "Uploaded resume";
      const created = await api.resumes.create({ name, latex, setActive: resumes.length === 0 });
      refreshResumes();
      resetPreview();
      setDoc({ id: created.id, name, latex, saved: latex });
      toast.success("Resume uploaded", { description: file.name });
    } catch (err) {
      toast.error("Could not upload the resume", { description: errorMessage(err) });
    }
  };

  const activate = async (r: ResumeRecord) => {
    try {
      await api.resumes.setActive(r.id);
      refreshResumes();
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success(`"${r.name}" is now active`, { description: "Job matches use its skills." });
    } catch (err) {
      toast.error("Could not set the active resume", { description: errorMessage(err) });
    }
  };

  const duplicate = async (r: ResumeRecord) => {
    try {
      const name = copyName(r.name, resumes);
      await api.resumes.create({ name, latex: r.latex, setActive: false });
      refreshResumes();
      toast.success("Resume duplicated", { description: name });
    } catch (err) {
      toast.error("Could not duplicate the resume", { description: errorMessage(err) });
    }
  };

  const remove = async (r: ResumeRecord) => {
    const ok = await confirmDialog({
      title: `Delete "${r.name}"?`,
      description: r.isActive
        ? "This is your active resume. Another saved resume becomes active, and this cannot be undone."
        : "This removes the LaTeX source and its extracted skills. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.resumes.delete(r.id);
      const rest = resumes.filter((x) => x.id !== r.id);
      if (r.isActive && rest[0]) await api.resumes.setActive(rest[0].id);
      if (doc?.id === r.id) {
        resetPreview();
        setDoc(rest[0] ? { id: rest[0].id, name: rest[0].name, latex: rest[0].latex, saved: rest[0].latex } : null);
      }
      refreshResumes();
      if (r.isActive) queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Resume deleted", { description: r.name });
    } catch (err) {
      toast.error("Could not delete the resume", { description: errorMessage(err) });
    }
  };

  const rename = async (r: ResumeRecord, name: string) => {
    try {
      await api.resumes.update(r.id, { name });
      setDoc((d) => (d?.id === r.id ? { ...d, name } : d));
      refreshResumes();
      setRenaming(null);
      toast.success("Resume renamed", { description: name });
    } catch (err) {
      toast.error("Could not rename the resume", { description: errorMessage(err) });
    }
  };

  const downloadPdf = async () => {
    if (!doc) return;
    try {
      const blob = await compile(doc.latex);
      downloadBlob(blob, pdfFilename(doc.name));
    } catch (err) {
      toast.error("Could not export the PDF", { description: errorMessage(err) });
    }
  };

  const copyLatex = async () => {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.latex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      toast.error("Could not copy", { description: errorMessage(err, "Clipboard access was blocked") });
    }
  };

  const exportForAutoApply = async () => {
    if (!doc) return;
    setExporting(true);
    try {
      const blob = await compile(doc.latex);
      await api.autoApply.uploadResumePdf(new File([blob], "resume.pdf", { type: "application/pdf" }));
      await queryClient.invalidateQueries({ queryKey: READINESS_KEY });
      toast.success("Auto-apply PDF updated", { description: `Forms will now get "${doc.name}".` });
    } catch (err) {
      toast.error("Could not update the auto-apply PDF", { description: errorMessage(err) });
    } finally {
      setExporting(false);
    }
  };

  const compiling = preview.status === "compiling";
  const stale = preview.status === "ready" && compiled.current?.latex !== doc?.latex;
  const lineCount = doc ? doc.latex.split("\n").length : 0;

  const editorPane = doc && <LatexEditor value={doc.latex} onChange={(latex) => setDoc((d) => (d ? { ...d, latex } : d))} />;
  const previewPane = <PdfPreview state={preview} onCompile={compilePreview} shortcut={`${MOD}+Enter`} />;
  const paneHeader = (title: string, meta?: React.ReactNode) => (
    <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
      <span className="text-[12.5px] font-medium text-foreground">{title}</span>
      {meta}
    </div>
  );

  return (
    <PageContainer className="flex flex-col gap-4">
      <PageIntro
        title="Resume Studio"
        description="Edit your LaTeX resumes, preview the PDF, and choose which one drives job matching."
      />

      <div className="grid min-h-[520px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Panel className="max-h-72 min-h-0 overflow-hidden lg:max-h-none">
          <ResumeLibrary
            resumes={resumes}
            loading={isLoading}
            selectedId={doc?.id ?? null}
            draftName={doc && !doc.id ? doc.name : null}
            onSelect={selectResume}
            onNew={newResume}
            onUpload={uploadTex}
            onActivate={activate}
            onDuplicate={duplicate}
            onRename={setRenaming}
            onDelete={remove}
          />
        </Panel>

        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          <Panel className="min-h-[420px] flex-1 overflow-hidden">
            {!doc ? (
              <div className="flex flex-1 items-center justify-center p-6">
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading resumes" />
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileText />
                      </EmptyMedia>
                      <EmptyTitle>Create your first resume</EmptyTitle>
                      <EmptyDescription>
                        Start from a one-page template and replace the details with yours. Skills you list are used to score jobs.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button onClick={newResume}>
                        <FilePlus2 data-icon="inline-start" />
                        Start from template
                      </Button>
                    </EmptyContent>
                  </Empty>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-[14px] font-semibold tracking-tight text-foreground">{doc.name}</h2>
                    {record?.isActive && <Badge variant="secondary">Active</Badge>}
                    {dirty && (
                      <Badge variant="outline" className="gap-1.5 font-normal">
                        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                        {doc.id ? "Unsaved changes" : "Not saved"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="icon-sm" onClick={copyLatex} aria-label="Copy LaTeX" title="Copy LaTeX">
                      {copied ? <Check /> : <Copy />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadPdf} disabled={compiling}>
                      <Download data-icon="inline-start" />
                      Download PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        compilePreview();
                        if (!wide) setPane("preview");
                      }}
                      disabled={compiling}
                      title={`Compile preview (${MOD}+Enter)`}
                    >
                      {compiling ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                      {compiling ? "Compiling…" : "Compile preview"}
                    </Button>
                    <Button size="sm" onClick={save} disabled={saveMutation.isPending || (!dirty && !!doc.id)} title={`Save (${MOD}+S)`}>
                      {saveMutation.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      Save
                    </Button>
                  </div>
                </div>
                <Separator />

                {wide ? (
                  <div className="grid min-h-0 flex-1 grid-cols-2">
                    <div className="flex min-h-0 min-w-0 flex-col">
                      {paneHeader("LaTeX", <span className="text-[12px] tabular-nums text-muted-foreground">{lineCount} lines</span>)}
                      {editorPane}
                    </div>
                    <div className="flex min-h-0 min-w-0 flex-col border-l border-border">
                      {paneHeader("Preview", stale && <span className="text-[12px] text-muted-foreground">Out of date. {MOD}+Enter to refresh</span>)}
                      {previewPane}
                    </div>
                  </div>
                ) : (
                  <Tabs value={pane} onValueChange={(v) => setPane(v as "editor" | "preview")} className="min-h-0 flex-1 gap-0">
                    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
                      <TabsList>
                        <TabsTrigger value="editor">Editor</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                      </TabsList>
                      <span className="text-[12px] tabular-nums text-muted-foreground">
                        {pane === "editor" ? `${lineCount} lines` : stale ? "Out of date" : ""}
                      </span>
                    </div>
                    <TabsContent value="editor" className="flex min-h-0 flex-col">
                      {editorPane}
                    </TabsContent>
                    <TabsContent value="preview" className="flex min-h-0 flex-col">
                      {previewPane}
                    </TabsContent>
                  </Tabs>
                )}
              </>
            )}
          </Panel>

          <div className="grid shrink-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Panel className={cn(!doc && "opacity-60")}>
              <ResumeInsights
                parsed={parsed}
                open={insightsOpen}
                onOpenChange={setInsightsOpen}
                onRescore={() => doc && rescore.mutate(doc)}
                rescoring={rescore.isPending}
                isActive={!!record?.isActive}
              />
            </Panel>
            <Panel>
              <ApplicationPdfPanel onExport={exportForAutoApply} exporting={exporting} />
            </Panel>
          </div>
        </div>
      </div>

      <RenameDialog resume={renaming} onClose={() => setRenaming(null)} onSubmit={rename} />
    </PageContainer>
  );
};

const RenameDialog: React.FC<{
  resume: ResumeRecord | null;
  onClose: () => void;
  onSubmit: (r: ResumeRecord, name: string) => Promise<void>;
}> = ({ resume, onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (resume) setName(resume.name);
  }, [resume]);
  const invalid = name.trim().length === 0;

  return (
    <Dialog open={!!resume} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resume || invalid) return;
            setBusy(true);
            await onSubmit(resume, name.trim());
            setBusy(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename resume</DialogTitle>
            <DialogDescription>Names help you tell versions apart, for example by role or company.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="resume-name">Name</FieldLabel>
              <Input id="resume-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid || undefined} autoFocus />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || busy}>
              {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
              Save name
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
