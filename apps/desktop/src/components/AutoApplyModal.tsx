import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  Brain,
  Camera,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { errorMessage, toast } from "@/lib/notify";

interface AutoApplyModalProps {
  job: any;
  isOpen: boolean;
  onClose: () => void;
  onAppliedSuccess?: (application: any) => void;
}

const PROFILE_FIELDS: Array<{ key: string; label: string; type: string; autoComplete?: string }> = [
  { key: "fullName", label: "Full name", type: "text", autoComplete: "name" },
  { key: "email", label: "Email", type: "email", autoComplete: "email" },
  { key: "phone", label: "Phone number", type: "tel", autoComplete: "tel" },
  { key: "linkedinUrl", label: "LinkedIn URL", type: "url" },
  { key: "githubUrl", label: "GitHub URL", type: "url" },
  { key: "portfolioUrl", label: "Portfolio or website", type: "url", autoComplete: "url" },
];

export const AutoApplyModal: React.FC<AutoApplyModalProps> = ({ job, isOpen, onClose, onAppliedSuccess }) => {
  const [mode, setMode] = useState<"review" | "auto_submit">("review");
  const [step, setStep] = useState<"configure" | "running" | "reviewed" | "submitted" | "error">("configure");
  const [profile, setProfile] = useState<any>({
    fullName: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    authorizedToWork: true,
    requireSponsorship: false,
    yearsOfExperience: 2,
  });

  const [activeResume, setActiveResume] = useState<any>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<"screenshot" | "fields">("screenshot");
  const [memory, setMemory] = useState<Record<string, string>>({});
  const [showMemory, setShowMemory] = useState<boolean>(false);
  const [newMemQ, setNewMemQ] = useState("");
  const [newMemA, setNewMemA] = useState("");
  const [isSavingMem, setIsSavingMem] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("configure");
      setResult(null);
      setLogs([]);
      loadProfileAndResume();
    }
  }, [isOpen, job?.id]);

  const loadProfileAndResume = async () => {
    try {
      const [savedProfile, resume, memRes] = await Promise.all([
        api.autoApply.getProfile().catch(() => ({})),
        api.resumes.getActive().catch(() => null),
        api.autoApply.getMemory().catch(() => ({ success: true, memory: {} })),
      ]);

      setActiveResume(resume);
      if (memRes?.memory) {
        setMemory(memRes.memory);
      }

      setProfile({
        fullName: savedProfile.fullName || resume?.parsed?.basics?.name || "",
        email: savedProfile.email || resume?.parsed?.basics?.email || "",
        phone: savedProfile.phone || resume?.parsed?.basics?.phone || "",
        linkedinUrl:
          savedProfile.linkedinUrl ||
          resume?.parsed?.basics?.profiles?.find((p: any) => /linkedin/i.test(p.network || p.url))?.url ||
          "",
        githubUrl:
          savedProfile.githubUrl ||
          resume?.parsed?.basics?.profiles?.find((p: any) => /github/i.test(p.network || p.url))?.url ||
          "",
        portfolioUrl: savedProfile.portfolioUrl || resume?.parsed?.basics?.website || "",
        authorizedToWork: savedProfile.authorizedToWork ?? true,
        requireSponsorship: savedProfile.requireSponsorship ?? false,
        yearsOfExperience: savedProfile.yearsOfExperience ?? 2,
      });
    } catch (err) {
      console.error("Failed to load profile for auto-apply:", err);
    }
  };

  const handleSaveMemoryItem = async (q: string, a: string) => {
    if (!q.trim() || !a.trim()) return;
    try {
      setIsSavingMem(true);
      await api.autoApply.saveMemory({ question: q.trim(), answer: a.trim() });
      setMemory((prev) => ({ ...prev, [q.trim().toLowerCase()]: a.trim() }));
      setNewMemQ("");
      setNewMemA("");
      toast.success("Answer saved", { description: "It will be reused on future applications." });
    } catch (err) {
      toast.error("Could not save the answer", { description: errorMessage(err) });
    } finally {
      setIsSavingMem(false);
    }
  };

  const handleStartApply = async () => {
    if (!job?.id) return;
    try {
      setIsRunning(true);
      setStep("running");
      setLogs([`[${new Date().toLocaleTimeString()}] Initializing Autonomous Job Application Crawler...`]);

      // Save profile updates for next time
      api.autoApply.updateProfile(profile).catch(() => {});

      const res = await api.autoApply.apply({
        jobId: job.id,
        resumeId: activeResume?.id,
        mode,
        profileOverrides: profile,
      });

      setResult(res);
      setLogs(res.logs || []);

      if (res.status === "ready_for_review") {
        setStep("reviewed");
      } else if (res.status === "submitted") {
        setStep("submitted");
        onAppliedSuccess?.(res);
      } else {
        setStep("error");
      }
    } catch (err: any) {
      setStep("error");
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (!job?.id) return;
    try {
      setIsRunning(true);
      setStep("running");

      const res = await api.autoApply.confirm({
        jobId: job.id,
        resumeId: activeResume?.id,
      });

      setResult(res);
      setLogs(res.logs || []);

      if (res.status === "submitted") {
        setStep("submitted");
        onAppliedSuccess?.(res);
      } else {
        setStep("error");
      }
    } catch (err: any) {
      setStep("error");
      setLogs((prev) => [...prev, `[Error] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  if (!job) return null;

  const companyName = job.company?.name || job.companyName || "the company";
  const memoryCount = Object.keys(memory).length;

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(860px,calc(100vh-3rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]">
        <DialogHeader className="gap-3 border-b border-border px-6 pt-5 pb-4 pr-14 text-left">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-primary" aria-hidden>
              <Zap className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="font-sans text-lg font-semibold tracking-tight">Auto-apply</DialogTitle>
              <DialogDescription>
                Applying to <span className="font-medium text-foreground">{job.title}</span> at {companyName}
              </DialogDescription>
            </div>
          </div>
          <div>
            <Button
              variant="outline"
              size="sm"
              aria-pressed={showMemory}
              onClick={() => setShowMemory(!showMemory)}
              className={cn(showMemory && "border-[var(--brand-line)] bg-[var(--brand-soft)]")}
            >
              <Brain data-icon="inline-start" aria-hidden />
              Learned answers
              <span className="text-xs text-muted-foreground tabular-nums">{memoryCount}</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            {showMemory && (
              <section aria-label="Learned answers" className="flex flex-col gap-3 rounded-xl border border-border bg-muted/50 p-4">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-semibold text-foreground">Learned answers</h3>
                  <p className="text-xs text-muted-foreground">Reused across Greenhouse, Lever, Ashby, Workday and other portals.</p>
                </div>
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSaveMemoryItem(newMemQ, newMemA);
                  }}
                >
                  <Input
                    aria-label="Question"
                    placeholder="Question, e.g. Notice period"
                    value={newMemQ}
                    onChange={(e) => setNewMemQ(e.target.value)}
                    className="min-w-[200px] flex-1 bg-card"
                  />
                  <Input
                    aria-label="Answer"
                    placeholder="Answer, e.g. 15 days"
                    value={newMemA}
                    onChange={(e) => setNewMemA(e.target.value)}
                    className="min-w-[200px] flex-1 bg-card"
                  />
                  <Button type="submit" disabled={isSavingMem || !newMemQ.trim() || !newMemA.trim()}>
                    {isSavingMem && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
                    {isSavingMem ? "Saving…" : "Remember"}
                  </Button>
                </form>
                {memoryCount === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No saved answers yet. The agent learns recurring questions as it fills applications.
                  </p>
                ) : (
                  <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                    {Object.entries(memory).map(([q, a]) => (
                      <li key={q} className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-xs">
                        <span className="font-medium text-foreground">{q}</span>
                        <span className="text-muted-foreground">{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {step === "configure" && (
              <>
                <section className="flex flex-col gap-2.5">
                  <h3 id="aa-mode" className="text-sm font-semibold text-foreground">
                    Mode
                  </h3>
                  <ToggleGroup
                    type="single"
                    aria-labelledby="aa-mode"
                    value={mode}
                    onValueChange={(v) => v && setMode(v as "review" | "auto_submit")}
                    className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2"
                  >
                    {(
                      [
                        {
                          id: "review",
                          icon: Eye,
                          title: "Review before submitting",
                          body: "Fills every field, uploads your resume, answers questions with AI, then pauses with a screenshot for your approval.",
                        },
                        {
                          id: "auto_submit",
                          icon: Zap,
                          title: "Submit automatically",
                          body: "Fills the full application, answers screening questions, submits it and records the confirmation.",
                        },
                      ] as const
                    ).map((m) => (
                      <ToggleGroupItem
                        key={m.id}
                        value={m.id}
                        className={cn(
                          "h-auto flex-col items-start gap-1.5 rounded-xl border border-border bg-card p-4 text-left whitespace-normal shadow-none",
                          "hover:border-[var(--border-hover)] hover:bg-card hover:text-foreground",
                          "data-[state=on]:border-primary data-[state=on]:bg-[var(--brand-soft)] data-[state=on]:text-foreground"
                        )}
                      >
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <m.icon className="size-4 text-primary" aria-hidden />
                          {m.title}
                        </span>
                        <span className="text-xs leading-relaxed font-normal text-muted-foreground">{m.body}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </section>

                <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <User className="size-4 text-muted-foreground" aria-hidden />
                      Details to autofill
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {activeResume ? `Resume: ${activeResume.name}` : "No active resume"}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {PROFILE_FIELDS.map((f) => (
                      <div key={f.key} className="flex flex-col gap-2">
                        <Label htmlFor={`aa-${f.key}`}>{f.label}</Label>
                        <Input
                          id={`aa-${f.key}`}
                          type={f.type}
                          autoComplete={f.autoComplete}
                          value={profile[f.key]}
                          onChange={(e) => setProfile({ ...profile, [f.key]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id="aa-authorized"
                        checked={profile.authorizedToWork}
                        onCheckedChange={(v) => setProfile({ ...profile, authorizedToWork: v === true })}
                      />
                      <Label htmlFor="aa-authorized" className="font-normal">
                        Legally authorised to work
                      </Label>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Checkbox
                        id="aa-sponsorship"
                        checked={profile.requireSponsorship}
                        onCheckedChange={(v) => setProfile({ ...profile, requireSponsorship: v === true })}
                      />
                      <Label htmlFor="aa-sponsorship" className="font-normal">
                        Requires visa sponsorship now or later
                      </Label>
                    </div>
                  </div>
                </section>
              </>
            )}

            {step === "running" && (
              <div className="flex flex-col items-center gap-4 py-8 text-center" role="status">
                <Loader2 className="size-9 animate-spin text-primary" aria-hidden />
                <div className="flex flex-col gap-1">
                  <h3 className="text-base font-semibold text-foreground">Filling the application…</h3>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Opening the portal, detecting the ATS, filling your details, uploading your resume and drafting answers.
                  </p>
                </div>
                <ol className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-border bg-muted/50 p-4 text-left text-sm text-muted-foreground">
                  {[
                    "Launch the browser and load the portal",
                    "Detect the ATS and form fields",
                    "Fill contact details, links and location",
                    "Upload your resume PDF",
                    "Answer screening questions with AI",
                    mode === "auto_submit" ? "Submit and capture the confirmation" : "Capture a preview for your review",
                  ].map((s, idx) => (
                    <li key={idx} className="flex items-center gap-2.5">
                      <span className="text-xs text-muted-foreground tabular-nums">{idx + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {step === "reviewed" && result && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-soft)] p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-foreground">
                        Ready for review{result.atsType ? ` · ${String(result.atsType).toUpperCase()}` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Filled {result.fieldsFilled?.length || 0} fields. Check the preview before submitting.
                      </span>
                    </div>
                  </div>
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    aria-label="Preview"
                    value={previewTab}
                    onValueChange={(v) => v && setPreviewTab(v as "screenshot" | "fields")}
                    className="bg-card"
                  >
                    <ToggleGroupItem value="screenshot" className="px-3 text-xs">
                      <Camera aria-hidden />
                      Screenshot
                    </ToggleGroupItem>
                    <ToggleGroupItem value="fields" className="px-3 text-xs">
                      <FileText aria-hidden />
                      Fields ({result.fieldsFilled?.length || 0})
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {previewTab === "screenshot" ? (
                  <div className="max-h-[440px] overflow-y-auto rounded-xl border border-border bg-muted">
                    {result.screenshotBase64 ? (
                      <img src={result.screenshotBase64} alt="Filled application form" className="block w-full" />
                    ) : (
                      <p className="p-10 text-center text-sm text-muted-foreground">Screenshot unavailable</p>
                    )}
                  </div>
                ) : (
                  <div className="max-h-[440px] overflow-y-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-3 py-2 font-medium">Field</th>
                          <th scope="col" className="px-3 py-2 font-medium">Category</th>
                          <th scope="col" className="px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.fieldsFilled?.map((f: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium text-foreground">{f.label || f.field}</td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="font-normal text-muted-foreground">
                                {f.category}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {f.type === "ai_generated" && (
                                <Badge variant="secondary" className="mr-1.5 text-[10px]">
                                  AI
                                </Badge>
                              )}
                              {f.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {step === "submitted" && result && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--success)_14%,transparent)]">
                  <CheckCircle2 className="size-6 text-[var(--success)]" aria-hidden />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Application submitted</h3>
                <p className="max-w-md text-sm text-muted-foreground">
                  {result.confirmationMessage || `Applied to ${job.title} at ${companyName}.`}
                </p>
                <p className="text-xs text-muted-foreground">Recorded and added to your Applications board.</p>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center gap-3 py-8 text-center" role="alert">
                <AlertCircle className="size-8 text-destructive" aria-hidden />
                <h3 className="text-base font-semibold text-foreground">The application could not be completed</h3>
                <p className="max-w-md text-sm text-destructive">
                  {result?.error || result?.reason || logs[logs.length - 1] || "Failed to automate the application form."}
                </p>
                <Button variant="outline" onClick={() => setStep("configure")}>
                  Try again
                </Button>
              </div>
            )}

            {logs.length > 0 && (
              <Collapsible open={showLogs} onOpenChange={setShowLogs} className="flex flex-col gap-2 border-t border-border pt-3">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="justify-between px-2 text-muted-foreground">
                    Automation log ({logs.length} events)
                    <ChevronDown className={cn("transition-transform", showLogs && "rotate-180")} data-icon="inline-end" aria-hidden />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/60 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {logs.join("\n")}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border bg-muted/40 px-6 py-3 sm:justify-between">
          <div>
            {job.applyUrl && (
              <Button variant="link" size="sm" asChild className="px-0">
                <a href={job.applyUrl} target="_blank" rel="noreferrer">
                  Open original posting
                  <ExternalLink data-icon="inline-end" aria-hidden />
                </a>
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isRunning}>
              {step === "submitted" ? "Done" : "Cancel"}
            </Button>
            {step === "configure" && (
              <Button onClick={handleStartApply} disabled={isRunning}>
                <Zap data-icon="inline-start" aria-hidden />
                {mode === "review" ? "Fill and review" : "Fill and submit"}
              </Button>
            )}
            {step === "reviewed" && (
              <Button onClick={handleConfirmSubmit} disabled={isRunning}>
                <Send data-icon="inline-start" aria-hidden />
                Submit application
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
