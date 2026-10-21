import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store/useStore";
import { api } from "../lib/api";
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AutoApplyModal } from "../components/AutoApplyModal";
import { CompanyMark, formatLocation, formatSalary, matchPercent, relativeTime, sourceLabel } from "../components/jobs/JobCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { errorMessage, toast } from "@/lib/notify";

type TabId = "description" | "company" | "ai" | "tailor";

function base64ToBlob(base64: string): Blob {
  const byteCharacters = atob(base64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
  return new Blob([byteArray], { type: "application/pdf" });
}

function downloadPdfFromBase64(base64: string, filename: string) {
  const url = URL.createObjectURL(base64ToBlob(base64));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function previewPdfFromBase64(base64: string) {
  window.open(URL.createObjectURL(base64ToBlob(base64)), "_blank");
}

function experienceLabel(job: any): string {
  const exp = job?.experienceLevel || job?.grade;
  if (exp && exp !== "Mid - Senior") return String(exp).charAt(0) + String(exp).slice(1).toLowerCase();
  const t = (job?.title || "").toLowerCase();
  if (t.includes("intern")) return "Internship";
  if (t.includes("associate") || t.includes("junior") || t.includes("entry") || t.includes("fresher")) return "Entry level (0–2 yrs)";
  if (t.includes("senior") || t.includes("lead") || t.includes("staff") || t.includes("principal")) return "Senior / Lead";
  return exp || "Mid level (2–5 yrs)";
}

const prose = "max-w-[68ch] text-[15px] leading-7 text-foreground";

function Description({ text }: { text: string }) {
  const desc = text.trim();
  if (!desc || desc.length < 50) return <p className="text-sm text-muted-foreground">No description provided.</p>;

  const decoded = desc
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "");
  const paragraphs = decoded.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  return (
    <div className={cn("flex flex-col gap-4", prose)}>
      {paragraphs.map((para, pIdx) => {
        const lines = para.trim().split("\n").map((l) => l.trim()).filter(Boolean);
        const hasBullets = lines.some((l) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*"));
        if (hasBullets) {
          return (
            <ul key={pIdx} className="flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground">
              {lines.map((line, lIdx) => (
                <li key={lIdx} className="pl-1">
                  {line.replace(/^[•\-*]\s*/, "")}
                </li>
              ))}
            </ul>
          );
        }
        if (
          lines.length === 1 &&
          (para.trim().endsWith(":") ||
            /^(Job Description|Responsibilities|Requirements|Qualifications|About|What We Offer)/i.test(para.trim()))
        ) {
          return (
            <h4 key={pIdx} className="pt-2 text-base font-semibold tracking-tight text-foreground">
              {para.trim()}
            </h4>
          );
        }
        return (
          <p key={pIdx} className="whitespace-pre-line">
            {lines.map((l) => l.replace(/^\*\s*/, "")).join("\n")}
          </p>
        );
      })}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold tracking-tight text-foreground">{children}</h3>;
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("flex list-disc flex-col gap-2 pl-5 marker:text-muted-foreground", prose, className)}>
      {items.map((t, i) => (
        <li key={i} className="pl-1">
          {t}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-foreground">{value}</dd>
    </div>
  );
}

function ScorePanel({ value }: { value: number | null }) {
  if (value === null) {
    return <p className="text-sm text-muted-foreground">This job has not been scored against your resume yet.</p>;
  }
  const tone = value >= 80 ? "bg-[var(--success)]" : value >= 60 ? "bg-primary" : "bg-muted-foreground";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">Match score</span>
        <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Match score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export const JobDetailModal: React.FC = () => {
  const { selectedJobId, isJobModalOpen, setIsJobModalOpen } = useStore();

  const [activeTab, setActiveTab] = useState<TabId>("description");
  const [isTailoring, setIsTailoring] = useState(false);
  const [tailoredResult, setTailoredResult] = useState<{
    tailoredLaTeX: string;
    changes: any[];
    warnings?: string[];
    pdfFilename?: string;
    pdfBase64?: string;
    compileSuccess?: boolean;
    compileError?: string;
  } | null>(null);
  const [copied, setCopied] = useState<"letter" | "latex" | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [showAutoApply, setShowAutoApply] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const open = isJobModalOpen && !!selectedJobId;

  // Generated artefacts belong to one job; do not show them on the next one.
  React.useEffect(() => {
    setTailoredResult(null);
    setCoverLetter(null);
    setSaved(false);
    setActiveTab("description");
  }, [selectedJobId]);

  const { data: job, isLoading } = useQuery({
    queryKey: ["job", selectedJobId],
    queryFn: () => (selectedJobId ? api.jobs.getById(selectedJobId) : null),
    enabled: open,
  });

  const { data: aiAnalysis, isLoading: isAiLoading } = useQuery({
    queryKey: ["job", selectedJobId, "ai"],
    queryFn: () => (selectedJobId ? api.ai.analyzeJob(selectedJobId) : null),
    enabled: open && activeTab === "ai",
  });

  const handleRunTailor = async () => {
    if (!selectedJobId) return;
    setIsTailoring(true);
    setActiveTab("tailor");
    try {
      const res = await api.ai.tailorResume(selectedJobId);
      setTailoredResult(res);
    } catch (err) {
      toast.error("Resume tailoring failed", { description: errorMessage(err) });
    } finally {
      setIsTailoring(false);
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!selectedJobId) return;
    setIsGeneratingCoverLetter(true);
    try {
      const res = await api.ai.generateCoverLetter(selectedJobId);
      setCoverLetter(res.coverLetter);
    } catch (err) {
      toast.error("Cover letter generation failed", { description: errorMessage(err) });
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleSave = async () => {
    if (!job?.id || saved) return;
    setSaving(true);
    try {
      await api.applications.create({ jobId: job.id, status: "saved" });
      setSaved(true);
      toast.success("Saved to Applications", { description: `${job.title} is now on your board.` });
    } catch (err) {
      toast.error("Could not save this job", { description: errorMessage(err, "It may already be on your board.") });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string, which: "letter" | "latex") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      toast.error("Could not copy to the clipboard", { description: errorMessage(err) });
    }
  };

  const score = matchPercent(job);
  const location = formatLocation(job?.location);
  const salary = job ? formatSalary(job) : null;
  const posted = relativeTime(job?.postedAt || job?.firstSeenAt);
  const companyObj = job?.company;
  const company = companyObj?.name || job?.companyName || "Unknown company";
  const source = job ? sourceLabel(job) : null;
  const aiScore = matchPercent(aiAnalysis);
  const responsibilities: string[] = Array.isArray(job?.responsibilities) ? job.responsibilities : [];
  const requirements: string[] = Array.isArray(job?.requirements) ? job.requirements : [];
  const skills: string[] = Array.isArray(job?.skills) ? job.skills : [];
  const applyHref = job?.applyUrl || job?.sourceUrl;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setIsJobModalOpen(false)}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(900px,calc(100vh-3rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
      >
        <DialogHeader className="flex-row flex-wrap items-center gap-4 border-b border-border px-6 py-4 text-left">
          <CompanyMark name={company} className="size-11 text-base" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {isLoading && !job ? (
              <>
                <DialogTitle className="sr-only">Loading job</DialogTitle>
                <DialogDescription className="sr-only">Job details are loading.</DialogDescription>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-1 h-6 w-72" />
              </>
            ) : (
              <>
                <DialogDescription className="truncate text-sm text-muted-foreground">
                  {company}
                  {posted ? ` · Posted ${posted}` : ""}
                </DialogDescription>
                <DialogTitle className="font-sans text-xl leading-snug font-semibold tracking-tight">
                  {job?.title || "Job details"}
                </DialogTitle>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  disabled={!job || saving}
                  aria-pressed={saved}
                  aria-label={saved ? "Saved to Applications" : "Save to Applications"}
                >
                  {saving ? <Loader2 className="animate-spin" /> : saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{saved ? "Saved" : "Save to Applications"}</TooltipContent>
            </Tooltip>
            <Button variant="outline" onClick={() => setShowAutoApply(true)} disabled={!job}>
              <Bot data-icon="inline-start" aria-hidden />
              Auto-apply
            </Button>
            {applyHref && (
              <Button variant="outline" asChild>
                <a href={applyHref} target="_blank" rel="noreferrer" className="text-foreground no-underline">
                  Apply
                  <ExternalLink data-icon="inline-end" aria-hidden />
                </a>
              </Button>
            )}
            <Button onClick={handleRunTailor} disabled={isTailoring || !job}>
              {isTailoring ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <FileText data-icon="inline-start" aria-hidden />}
              {isTailoring ? "Tailoring…" : "Tailor my CV"}
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close job details">
                <X />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-1 gap-8 px-6 py-6 md:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="flex flex-col gap-5 self-start rounded-xl border border-border bg-card p-5 md:sticky md:top-0">
              {isLoading ? (
                <div className="flex flex-col gap-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ) : (
                <>
                  <ScorePanel value={score} />
                  <Separator />
                  <dl className="-my-2.5 flex flex-col divide-y divide-border">
                    <Row label="Location" value={location || "Not specified"} />
                    {job?.workFormat && <Row label="Work format" value={job.workFormat} />}
                    {job?.region && <Row label="Region" value={job.region} />}
                    <Row label="Experience" value={experienceLabel(job)} />
                    <Row label="Type" value={job?.employmentType || "Full-time"} />
                    {salary && <Row label="Salary" value={salary} />}
                    {source && <Row label="Source" value={source} />}
                    <Row
                      label="Status"
                      value={<span className="capitalize">{job?.status || "Active"}</span>}
                    />
                    {job?.ghostRisk && job.ghostRisk !== "none" && (
                      <Row
                        label="Authenticity"
                        value={
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium cursor-help",
                                job.ghostRisk === "high" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"
                              )}>
                                {job.ghostRisk === "high" ? "High Ghost Risk" : "Stale / Repost Risk"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {job.ghostReasons?.join(". ") || "Listing may be an evergreen posting"}
                            </TooltipContent>
                          </Tooltip>
                        }
                      />
                    )}
                  </dl>
                  {skills.length > 0 && (
                    <>
                      <Separator />
                      <div className="flex flex-col gap-2.5">
                        <span className="text-sm text-muted-foreground">Skills</span>
                        <ul className="flex flex-wrap gap-1.5">
                          {skills.map((skill, idx) => (
                            <li key={idx}>
                              <Badge variant="secondary" className="rounded-md font-normal">
                                {skill}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}
                </>
              )}
            </aside>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)} className="min-w-0 gap-6">
              <TabsList variant="line" className="h-10 w-full justify-start gap-5 border-b border-border">
                <TabsTrigger value="description" className="flex-none px-0">
                  Description
                </TabsTrigger>
                <TabsTrigger value="company" className="flex-none px-0">
                  Company
                </TabsTrigger>
                <TabsTrigger value="ai" className="flex-none px-0">
                  Match analysis
                </TabsTrigger>
                <TabsTrigger value="tailor" className="flex-none px-0">
                  Tailored CV
                </TabsTrigger>
              </TabsList>

              <TabsContent value="description" className="flex flex-col gap-8">
                {isLoading ? (
                  <div className="flex flex-col gap-3" role="status" aria-label="Loading job description">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                  </div>
                ) : (
                  <>
                    <Description text={job?.description || ""} />
                    {responsibilities.length > 0 && (
                      <section className="flex flex-col gap-3">
                        <SectionTitle>Key responsibilities</SectionTitle>
                        <BulletList items={responsibilities} />
                      </section>
                    )}
                    {requirements.length > 0 && (
                      <section className="flex flex-col gap-3">
                        <SectionTitle>Requirements</SectionTitle>
                        <BulletList items={requirements} />
                      </section>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="company" className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <CompanyMark name={company} />
                  <div className="flex min-w-0 flex-col">
                    <span className="text-base font-semibold tracking-tight text-foreground">{company}</span>
                    {companyObj?.domain && <span className="text-sm text-muted-foreground">{companyObj.domain}</span>}
                  </div>
                </div>
                {companyObj?.description ? (
                  <p className={prose}>{companyObj.description}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No company description is available.</p>
                )}
                <dl className="flex max-w-md flex-col divide-y divide-border rounded-xl border border-border px-4">
                  {companyObj?.industry && <Row label="Industry" value={companyObj.industry} />}
                  {companyObj?.size && <Row label="Size" value={companyObj.size} />}
                  {companyObj?.headquarters && <Row label="Headquarters" value={companyObj.headquarters} />}
                  {companyObj?.ats && <Row label="Hiring system" value={sourceLabel({ ats: companyObj.ats }) ?? companyObj.ats} />}
                  {job?.openDays ? <Row label="Listed for" value={`${job.openDays} ${job.openDays === 1 ? "day" : "days"}`} /> : null}
                </dl>
                <div className="flex flex-wrap gap-2">
                  {companyObj?.website && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={companyObj.website} target="_blank" rel="noreferrer">
                        <Globe data-icon="inline-start" aria-hidden />
                        Website
                      </a>
                    </Button>
                  )}
                  {companyObj?.careerPage && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={companyObj.careerPage} target="_blank" rel="noreferrer">
                        Careers page
                        <ExternalLink data-icon="inline-end" aria-hidden />
                      </a>
                    </Button>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="ai" className="flex flex-col gap-7">
                {isAiLoading ? (
                  <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground" role="status">
                    <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
                    Analysing how your resume matches this job…
                  </div>
                ) : (
                  <>
                    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-5">
                      <div className="flex items-baseline justify-between gap-4">
                        <SectionTitle>Summary</SectionTitle>
                        {aiScore !== null && (
                          <span className="text-lg font-semibold tracking-tight text-foreground tabular-nums">{aiScore}% match</span>
                        )}
                      </div>
                      <p className={prose}>{aiAnalysis?.summary || "No summary is available for this job yet."}</p>
                    </section>

                    <section className="flex flex-col gap-3">
                      <SectionTitle>
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-[var(--success)]" aria-hidden />
                          Strongest resume alignments
                        </span>
                      </SectionTitle>
                      {aiAnalysis?.strongestMatches?.length ? (
                        <BulletList items={aiAnalysis.strongestMatches} />
                      ) : (
                        <p className="text-sm text-muted-foreground">No strong alignments were identified.</p>
                      )}
                    </section>

                    <section className="flex flex-col gap-3">
                      <SectionTitle>
                        <span className="inline-flex items-center gap-2">
                          <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
                          Gaps and areas to emphasise
                        </span>
                      </SectionTitle>
                      {aiAnalysis?.missingRequirements?.length ? (
                        <BulletList items={aiAnalysis.missingRequirements} />
                      ) : (
                        <p className="text-sm text-muted-foreground">No gaps were identified.</p>
                      )}
                    </section>

                    <div>
                      <Button variant="outline" onClick={handleGenerateCoverLetter} disabled={isGeneratingCoverLetter}>
                        {isGeneratingCoverLetter ? (
                          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
                        ) : (
                          <FileText data-icon="inline-start" aria-hidden />
                        )}
                        {isGeneratingCoverLetter ? "Drafting…" : "Generate cover letter"}
                      </Button>
                    </div>

                    {coverLetter && (
                      <section className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <SectionTitle>Cover letter</SectionTitle>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(coverLetter, "letter")}>
                            {copied === "letter" ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
                            {copied === "letter" ? "Copied" : "Copy"}
                          </Button>
                        </div>
                        <div className={cn("rounded-xl border border-border bg-card p-5 whitespace-pre-line", prose)}>{coverLetter}</div>
                      </section>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="tailor" className="flex flex-col gap-6">
                <p className="flex max-w-[68ch] items-start gap-2.5 text-sm text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  Bullet points and skills from your existing resume are reordered and emphasised for this job. Nothing is invented.
                </p>

                {!tailoredResult ? (
                  <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
                    <p className="text-sm text-muted-foreground">
                      {isTailoring
                        ? "Tailoring your resume and compiling the PDF. This can take a minute."
                        : "Generate a version of your active resume tuned for this job, as LaTeX and a compiled PDF."}
                    </p>
                    <Button onClick={handleRunTailor} disabled={isTailoring}>
                      {isTailoring ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Sparkles data-icon="inline-start" aria-hidden />}
                      {isTailoring ? "Tailoring…" : "Tailor my CV"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="size-5 shrink-0 text-[var(--success)]" aria-hidden />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">
                            {tailoredResult.compileSuccess ? "Tailored PDF ready" : "LaTeX generated"}
                          </span>
                          <span className="text-xs text-muted-foreground">{tailoredResult.pdfFilename || "resume.pdf"}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {tailoredResult.pdfBase64 && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                downloadPdfFromBase64(tailoredResult.pdfBase64!, tailoredResult.pdfFilename || "resume.pdf")
                              }
                            >
                              <Download data-icon="inline-start" aria-hidden />
                              Download PDF
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => previewPdfFromBase64(tailoredResult.pdfBase64!)}>
                              <ExternalLink data-icon="inline-start" aria-hidden />
                              Preview
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={handleRunTailor} disabled={isTailoring}>
                          {isTailoring ? "Tailoring…" : "Re-tailor"}
                        </Button>
                      </div>
                    </div>

                    {tailoredResult.changes && tailoredResult.changes.length > 0 && (
                      <section className="flex flex-col gap-3">
                        <SectionTitle>Adjustments made</SectionTitle>
                        <BulletList items={tailoredResult.changes.map(String)} />
                      </section>
                    )}

                    <section className="flex flex-col gap-3">
                      <div className="flex items-center justify-between gap-3">
                        <SectionTitle>LaTeX source</SectionTitle>
                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(tailoredResult.tailoredLaTeX, "latex")}>
                          {copied === "latex" ? <Check data-icon="inline-start" aria-hidden /> : <Copy data-icon="inline-start" aria-hidden />}
                          {copied === "latex" ? "Copied" : "Copy LaTeX"}
                        </Button>
                      </div>
                      <pre className="max-h-80 overflow-y-auto rounded-xl border border-border bg-muted/60 p-4 font-mono text-xs whitespace-pre-wrap text-foreground">
                        {tailoredResult.tailoredLaTeX}
                      </pre>
                    </section>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DialogContent>

      {showAutoApply && job && <AutoApplyModal job={job} isOpen={showAutoApply} onClose={() => setShowAutoApply(false)} />}
    </Dialog>
  );
};
