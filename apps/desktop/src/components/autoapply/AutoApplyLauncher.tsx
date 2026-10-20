import React, { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Eye, FileUp, Loader2, LogIn, ShieldCheck, SkipForward, Zap } from "lucide-react";
import { api, type AutoApplyConfig } from "../../lib/api";
import { useStore } from "../../store/useStore";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/notify";
import { ResumeFileCard } from "./ResumeFileCard";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Every job id matching the current filters (already de-duplicated against the board by the server). */
  jobIds: string[];
  /** Total matches, which can be larger than jobIds when the fetch was capped. */
  totalMatching: number;
}

const MODES: Array<{ id: AutoApplyConfig["mode"]; title: string; body: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "tabs", title: "Fill and leave open", body: "Recommended. Fills each job in a browser tab; you check it and click Submit.", icon: ExternalLink },
  { id: "auto_submit", title: "Fully automatic", body: "Fills and submits by itself. Best for clean forms.", icon: Zap },
  { id: "review", title: "Preview only", body: "Fills and saves a screenshot, then closes. Nothing is sent.", icon: Eye },
];

const choiceItem = cn(
  "h-auto flex-col items-start gap-1 rounded-xl border border-border bg-card p-3 text-left whitespace-normal shadow-none",
  "hover:border-[var(--border-hover)] hover:bg-card hover:text-foreground",
  "data-[state=on]:border-primary data-[state=on]:bg-[var(--brand-soft)] data-[state=on]:text-foreground"
);

export const AutoApplyLauncher: React.FC<Props> = ({ isOpen, onClose, jobIds, totalMatching }) => {
  const setDockOpen = useStore((s) => s.setIsAutoApplyDockOpen);
  const [config, setConfig] = useState<AutoApplyConfig | null>(null);
  const [preview, setPreview] = useState<{ fresh: number; skipped: Array<{ reason: string }> } | null>(null);
  const [limit, setLimit] = useState(25);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<Awaited<ReturnType<typeof api.autoApply.readiness>> | null>(null);
  const [me, setMe] = useState({ fullName: "", email: "", phone: "", city: "" });
  const [uploading, setUploading] = useState(false);

  const loadReadiness = () =>
    api.autoApply.readiness().then((r) => {
      setReady(r);
      setMe({ fullName: r.profile.fullName, email: r.profile.email, phone: r.profile.phone, city: "" });
    });

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setPreview(null);
    loadReadiness().catch(() => {});
    api.autoApply.getConfig().then((c) => {
      setConfig(c);
      setLimit(c.maxPerRun);
    });
    api.autoApply
      .previewQueue(jobIds)
      .then(setPreview)
      .catch((e) => setError(e.message));
  }, [isOpen, jobIds]);

  if (!config) return null;

  const fresh = preview?.fresh ?? 0;
  const willApply = Math.min(limit, fresh);
  const skippedApplied = preview?.skipped.length ?? 0;

  const start = async () => {
    try {
      setStarting(true);
      setError(null);
      if (ready && ready.missing.length > 0) {
        if (!me.fullName.trim() || !me.email.trim() || !me.phone.trim()) {
          throw new Error("Fill in your name, email and phone first. Forms need them.");
        }
        const [first, ...rest] = me.fullName.trim().split(/\s+/);
        const saved = await api.autoApply.getProfile().catch(() => ({}));
        await api.autoApply.updateProfile({
          ...saved,
          fullName: me.fullName.trim(),
          firstName: first,
          lastName: rest.join(" "),
          email: me.email.trim(),
          phone: me.phone.trim(),
        });
      }
      if (ready?.needsCity && me.city.trim()) {
        const saved = await api.autoApply.getProfile().catch(() => ({}));
        const city = me.city.trim();
        await api.autoApply.updateProfile({ ...saved, location: city, city: city.split(",")[0].trim() });
      }
      if (!ready?.resumePdf) throw new Error("Upload your resume as a PDF first. Most forms require a file.");
      await api.autoApply.saveConfig({ ...config, maxPerRun: limit });
      await api.autoApply.enqueue({ jobIds, mode: config.mode, limit });
      toast.success(`Auto-apply started for ${willApply} ${willApply === 1 ? "job" : "jobs"}`, {
        description: "Progress shows in the Auto-apply panel.",
      });
      setDockOpen(true);
      onClose();
    } catch (e: any) {
      setError(e.message || "Could not start auto-apply");
    } finally {
      setStarting(false);
    }
  };

  const needsSetup = ready && (ready.missing.length > 0 || ready.needsCity);
  const stats = [
    { label: "Match your filters", value: totalMatching.toLocaleString(), tone: "text-foreground" },
    { label: "New, will apply", value: preview ? fresh.toLocaleString() : "…", tone: "text-[var(--success)]" },
    { label: "Skipped (done or queued)", value: preview ? skippedApplied.toLocaleString() : "…", tone: "text-muted-foreground" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(880px,calc(100vh-3rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4 pr-14 text-left">
          <DialogTitle className="font-sans text-lg font-semibold tracking-tight">Auto-apply to filtered jobs</DialogTitle>
          <DialogDescription>Runs in the background, so you can keep working while it applies.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {totalMatching > jobIds.length && (
            <p className="text-xs text-muted-foreground">
              Checking the first {jobIds.length.toLocaleString()} of {totalMatching.toLocaleString()} matches. Run it again for the rest.
            </p>
          )}

          <dl className="grid grid-cols-3 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                <dd className={cn("text-xl font-semibold tabular-nums", s.tone)}>{s.value}</dd>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
              </div>
            ))}
          </dl>

          {needsSetup && (
            <section className="flex flex-col gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
                One-time setup, saved for every future application
              </p>
              {ready.missing.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input aria-label="Full name" placeholder="Full name" autoComplete="name" value={me.fullName} onChange={(e) => setMe({ ...me, fullName: e.target.value })} className="bg-card" />
                  <Input aria-label="Email" type="email" placeholder="Email" autoComplete="email" value={me.email} onChange={(e) => setMe({ ...me, email: e.target.value })} className="bg-card" />
                  <Input aria-label="Phone" type="tel" placeholder="Phone" autoComplete="tel" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} className="bg-card" />
                </div>
              )}
              {ready.needsCity && (
                <Input
                  aria-label="City and country"
                  placeholder="Your city and country, e.g. Noida, India"
                  value={me.city}
                  onChange={(e) => setMe({ ...me, city: e.target.value })}
                  className="bg-card"
                />
              )}
            </section>
          )}

          {ready && (
            <section className="flex flex-col gap-2.5">
              <h3 className="text-sm font-semibold text-foreground">Resume</h3>
              <ResumeFileCard resume={ready.resumePdf} onChange={loadReadiness} />
            </section>
          )}

          <section className="flex flex-col gap-2.5">
            <h3 id="aal-mode" className="text-sm font-semibold text-foreground">
              Mode
            </h3>
            <ToggleGroup
              type="single"
              aria-labelledby="aal-mode"
              value={config.mode}
              onValueChange={(v) => v && setConfig({ ...config, mode: v as AutoApplyConfig["mode"] })}
              className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-3"
            >
              {MODES.map((m) => (
                <ToggleGroupItem key={m.id} value={m.id} className={choiceItem}>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <m.icon className="size-3.5 text-primary" aria-hidden />
                    {m.title}
                  </span>
                  <span className="text-xs leading-relaxed font-normal text-muted-foreground">{m.body}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </section>

          {config.mode === "tabs" && (
            <div className="flex flex-wrap items-center gap-3">
              <Label htmlFor="aal-tabs">Tabs open at once</Label>
              <Input
                id="aal-tabs"
                type="number"
                min={1}
                max={30}
                value={config.tabBatch}
                onChange={(e) => setConfig({ ...config, tabBatch: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                className="w-20"
              />
              <span className="text-xs text-muted-foreground">The next jobs open as you submit or close tabs.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="aal-limit">Apply to at most (this run)</Label>
              <Input id="aal-limit" type="number" min={1} max={500} value={limit} onChange={(e) => setLimit(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="aal-cap">Daily cap</Label>
              <Input
                id="aal-cap"
                type="number"
                min={1}
                max={500}
                value={config.dailyCap}
                onChange={(e) => setConfig({ ...config, dailyCap: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Checkbox id="aal-gaps" checked={config.fillGaps} onCheckedChange={(v) => setConfig({ ...config, fillGaps: v === true })} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="aal-gaps">Never stop on a question</Label>
                <p className="text-xs text-muted-foreground">If a required question is unclear, answer it with the best guess from your resume.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="aal-captcha"
                checked={config.onCaptcha === "wait"}
                onCheckedChange={(v) => setConfig({ ...config, onCaptcha: v === true ? "wait" : "skip" })}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="aal-captcha">Let me solve captchas</Label>
                <p className="text-xs text-muted-foreground">A browser window opens on that job; tick the captcha and it submits for you.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="aal-watch" checked={!config.headless} onCheckedChange={(v) => setConfig({ ...config, headless: v !== true })} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor="aal-watch">Watch the browser while it applies</Label>
                <p className="text-xs text-muted-foreground">Opens a visible window.</p>
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-2.5">
            <h3 id="aal-login" className="text-sm font-semibold text-foreground">
              When a job needs you to sign in
            </h3>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="aal-login"
              value={config.onLogin}
              onValueChange={(v) => v && setConfig({ ...config, onLogin: v as AutoApplyConfig["onLogin"] })}
              className="w-full"
            >
              <ToggleGroupItem value="skip" className="flex-1 text-xs data-[state=on]:bg-[var(--brand-soft)]">
                Skip it and list it for later
              </ToggleGroupItem>
              <ToggleGroupItem value="wait" className="flex-1 text-xs data-[state=on]:bg-[var(--brand-soft)]">
                Pause and let me sign in
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => api.autoApply.connectLinkedIn().catch((e) => setError(e.message))}
            >
              <LogIn data-icon="inline-start" aria-hidden />
              Connect LinkedIn
            </Button>
          </section>

          <p className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
            Jobs already on your board, already submitted, or the same posting under another link are skipped. A job is only marked
            applied after the site confirms it.
          </p>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/40 px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={start} disabled={starting || !preview || fresh === 0}>
            {starting ? (
              <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
            ) : fresh === 0 && preview ? (
              <SkipForward data-icon="inline-start" aria-hidden />
            ) : (
              <CheckCircle2 data-icon="inline-start" aria-hidden />
            )}
            {preview && fresh === 0
              ? "Nothing new to apply"
              : config.mode === "tabs"
                ? `Open ${willApply} jobs in the browser`
                : `Start applying to ${willApply} jobs`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
