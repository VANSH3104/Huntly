import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { BrainCircuit, CheckCircle2, Crosshair, Globe, Loader2, Save, XCircle, Zap } from "lucide-react";
import { api } from "../lib/api";
import { PageContainer, PageIntro, Panel, PanelHeader } from "../components/common/PagePrimitives";
import { toast, errorMessage } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface FormState {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  geminiKey: string;
  searchProvider: string;
  searchKey: string;
  targetRoles: string;
  targetLocations: string;
  minMatchThreshold: number;
  crawlIntervalHours: number;
}

const DEFAULTS: FormState = {
  llmProvider: "freellm",
  llmBaseUrl: "http://127.0.0.1:31415/v1",
  llmApiKey: "",
  llmModel: "auto",
  geminiKey: "",
  searchProvider: "serper",
  searchKey: "",
  targetRoles: "Software Engineer, Backend Engineer, Full Stack Engineer",
  targetLocations: "Bengaluru, Remote, India",
  minMatchThreshold: 60,
  crawlIntervalHours: 6,
};

const LLM_PROVIDERS = [
  { value: "freellm", label: "FreeLLM gateway", hint: "OpenAI-compatible local or multi-model gateway" },
  { value: "gemini", label: "Google Gemini", hint: "Direct Gemini API" },
  { value: "openai", label: "Custom OpenAI-compatible", hint: "Any endpoint that speaks the OpenAI API" },
];

const SEARCH_PROVIDERS = [
  { value: "serper", label: "Serper.dev (Google Search)" },
  { value: "serpapi", label: "SerpAPI (Google Jobs and Web)" },
  { value: "brave", label: "Brave Search API" },
];

function fromSettings(data: Record<string, any> | undefined): FormState {
  if (!data) return DEFAULTS;
  return {
    llmProvider: data["llm.provider"] || DEFAULTS.llmProvider,
    llmBaseUrl: data["llm.baseUrl"] || DEFAULTS.llmBaseUrl,
    llmApiKey: data["llm.apiKey"] || "",
    llmModel: data["llm.model"] || DEFAULTS.llmModel,
    geminiKey: data.geminiApiKey || "",
    searchProvider: data.searchProvider || DEFAULTS.searchProvider,
    searchKey: data.searchApiKey || "",
    targetRoles: data.targetRoles || DEFAULTS.targetRoles,
    targetLocations: data.targetLocations || DEFAULTS.targetLocations,
    minMatchThreshold: data.minMatchThreshold ? Number(data.minMatchThreshold) : DEFAULTS.minMatchThreshold,
    crawlIntervalHours: data.crawlIntervalHours ? Number(data.crawlIntervalHours) : DEFAULTS.crawlIntervalHours,
  };
}

function validate(f: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (f.llmProvider !== "gemini") {
    try {
      const u = new URL(f.llmBaseUrl);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      errors.llmBaseUrl = "Enter a full URL, for example http://127.0.0.1:31415/v1";
    }
  }
  if (!f.llmModel.trim()) errors.llmModel = "Model is required. Use auto to let the gateway choose.";
  if (!f.targetRoles.split(",").some((r) => r.trim())) errors.targetRoles = "Add at least one role.";
  if (!Number.isInteger(f.crawlIntervalHours) || f.crawlIntervalHours < 1 || f.crawlIntervalHours > 48)
    errors.crawlIntervalHours = "Choose a whole number of hours between 1 and 48.";
  return errors;
}

/* Settings row: label and help on the left, control on the right. */
const Field: React.FC<{
  id: string;
  label: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ id, label, description, error, children }) => (
  <div
    data-invalid={error ? true : undefined}
    className="grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:gap-8"
  >
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className={cn("text-[13px]", error && "text-destructive")}>
        {label}
      </Label>
      {description && <p className="text-[12px] leading-snug text-muted-foreground">{description}</p>}
    </div>
    <div className="flex min-w-0 flex-col gap-1.5">
      {children}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[12px] text-destructive"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  </div>
);

const Rows: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="flex flex-col pb-1">
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <div className="px-5">
              <Separator />
            </div>
          )}
          {child}
        </React.Fragment>
      ))}
    </div>
  );
};

export const SettingsView: React.FC = () => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [baseline, setBaseline] = useState<FormState>(DEFAULTS);
  const [showKeys, setShowKeys] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; latencyMs?: number } | null>(null);

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.settings.getAll(),
  });

  useEffect(() => {
    if (!settingsData) return;
    const next = fromSettings(settingsData);
    setForm(next);
    setBaseline(next);
  }, [settingsData]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const errors = useMemo(() => validate(form), [form]);
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = JSON.stringify(form) !== JSON.stringify(baseline);
  // Show errors only once a field differs from what was loaded, or after a save attempt.
  const errorFor = (key: keyof FormState) => (submitted || form[key] !== baseline[key] ? errors[key] : undefined);

  const testLlm = useMutation({
    mutationFn: () =>
      api.settings.testLlm({
        provider: form.llmProvider,
        baseUrl: form.llmBaseUrl,
        apiKey: form.llmProvider === "gemini" ? form.geminiKey : form.llmApiKey,
        model: form.llmModel,
      }),
    onMutate: () => setTestResult(null),
    onSuccess: (res) => {
      setTestResult(res);
      if (res?.ok) toast.success("Model connection works", { description: `${form.llmModel} replied in ${res.latencyMs ?? "?"} ms.` });
      else toast.error("Model connection failed", { description: res?.error || "The provider returned an error." });
    },
    onError: (err) => {
      const message = errorMessage(err, "Could not reach the model provider");
      setTestResult({ ok: false, error: message });
      toast.error("Model connection failed", { description: message });
    },
  });

  const save = useMutation({
    mutationFn: () =>
      api.settings.update({
        "llm.provider": form.llmProvider,
        "llm.baseUrl": form.llmBaseUrl,
        "llm.apiKey": form.llmApiKey,
        "llm.model": form.llmModel,
        geminiApiKey: form.geminiKey,
        searchProvider: form.searchProvider,
        searchApiKey: form.searchKey,
        targetRoles: form.targetRoles,
        targetLocations: form.targetLocations,
        minMatchThreshold: form.minMatchThreshold,
        crawlIntervalHours: form.crawlIntervalHours,
      }),
    onSuccess: () => {
      setBaseline(form);
      setSubmitted(false);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success("Settings saved", { description: "New preferences apply to the next crawl and match run." });
    },
    onError: (err) => toast.error("Could not save settings", { description: errorMessage(err) }),
  });

  const handleSave = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (hasErrors) {
      toast.error("Fix the highlighted fields", { description: "Some settings are missing or invalid." });
      return;
    }
    save.mutate();
  };

  const keyType = showKeys ? "text" : "password";
  const usesGateway = form.llmProvider !== "gemini";

  if (isLoading) {
    return (
      <PageContainer className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <Skeleton className="h-10 w-80" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 w-full rounded-xl" />
        ))}
      </PageContainer>
    );
  }

  return (
    <PageContainer className="w-full">
      <form onSubmit={handleSave} className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-20" noValidate>
        <PageIntro
          title="Configuration"
          description="Keys and preferences are stored locally in your SQLite database. Nothing leaves this machine except calls to the providers you choose."
          actions={
            <div className="flex items-center gap-2">
              <Switch id="reveal-keys" checked={showKeys} onCheckedChange={setShowKeys} />
              <Label htmlFor="reveal-keys" className="text-[12.5px] font-normal text-muted-foreground">
                Show keys
              </Label>
            </div>
          }
        />

        <Panel>
          <PanelHeader
            icon={BrainCircuit}
            title="AI model"
            description="Used for match scoring, resume tailoring and digests."
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => testLlm.mutate()} disabled={testLlm.isPending}>
                {testLlm.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Zap data-icon="inline-start" />}
                {testLlm.isPending ? "Testing…" : "Test connection"}
              </Button>
            }
          />
          {testResult && (
            <div
              role="status"
              className={cn(
                "mx-5 mt-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                testResult.ok
                  ? "border-[color-mix(in_srgb,var(--success)_30%,transparent)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)]"
                  : "border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_7%,transparent)]"
              )}
            >
              {testResult.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-[var(--success)]" aria-hidden />
              ) : (
                <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="text-foreground">
                {testResult.ok ? (
                  <>
                    Connected to <span className="font-mono">{form.llmModel}</span> ·{" "}
                    <span className="tabular-nums">{testResult.latencyMs ?? "?"} ms</span>
                  </>
                ) : (
                  <>Connection failed: {testResult.error}</>
                )}
              </span>
            </div>
          )}
          <Rows>
            <Field id="llm-provider" label="Provider" description={LLM_PROVIDERS.find((p) => p.value === form.llmProvider)?.hint}>
              <Select value={form.llmProvider} onValueChange={(v) => set("llmProvider", v)}>
                <SelectTrigger id="llm-provider" className="w-full">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {LLM_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field id="llm-model" label="Model" description="Model name sent to the provider. auto lets the gateway pick." error={errorFor("llmModel")}>
              <Input
                id="llm-model"
                value={form.llmModel}
                onChange={(e) => set("llmModel", e.target.value)}
                placeholder="auto"
                className="font-mono"
                aria-invalid={!!errorFor("llmModel") || undefined}
              />
            </Field>
            {usesGateway && (
              <Field id="llm-base-url" label="Base URL" description="OpenAI-compatible endpoint, including the /v1 path." error={errorFor("llmBaseUrl")}>
                <Input
                  id="llm-base-url"
                  type="url"
                  value={form.llmBaseUrl}
                  onChange={(e) => set("llmBaseUrl", e.target.value)}
                  className="font-mono"
                  aria-invalid={!!errorFor("llmBaseUrl") || undefined}
                />
              </Field>
            )}
            {usesGateway ? (
              <Field id="llm-api-key" label="API key" description="Leave empty if your gateway does not require one.">
                <Input
                  id="llm-api-key"
                  type={keyType}
                  autoComplete="off"
                  value={form.llmApiKey}
                  onChange={(e) => set("llmApiKey", e.target.value)}
                  placeholder="Not set"
                  className="font-mono"
                />
              </Field>
            ) : (
              <Field id="gemini-key" label="Gemini API key" description="Create one in Google AI Studio.">
                <Input
                  id="gemini-key"
                  type={keyType}
                  autoComplete="off"
                  value={form.geminiKey}
                  onChange={(e) => set("geminiKey", e.target.value)}
                  placeholder="AIza…"
                  className="font-mono"
                />
              </Field>
            )}
          </Rows>
        </Panel>

        <Panel>
          <PanelHeader icon={Globe} title="Web search" description="Finds new career pages and ATS boards during discovery." />
          <Rows>
            <Field id="search-provider" label="Search provider">
              <Select value={form.searchProvider} onValueChange={(v) => set("searchProvider", v)}>
                <SelectTrigger id="search-provider" className="w-full">
                  <SelectValue placeholder="Choose a provider" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {SEARCH_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field id="search-key" label="Search API key" description="Without a key, discovery only revisits known sources.">
              <Input
                id="search-key"
                type={keyType}
                autoComplete="off"
                value={form.searchKey}
                onChange={(e) => set("searchKey", e.target.value)}
                placeholder="Not set"
                className="font-mono"
              />
            </Field>
          </Rows>
        </Panel>

        <Panel>
          <PanelHeader icon={Crosshair} title="Targeting" description="What the crawler looks for and how strict matching is." />
          <Rows>
            <Field id="target-roles" label="Target roles" description="Comma separated." error={errorFor("targetRoles")}>
              <Input
                id="target-roles"
                value={form.targetRoles}
                onChange={(e) => set("targetRoles", e.target.value)}
                aria-invalid={!!errorFor("targetRoles") || undefined}
              />
            </Field>
            <Field id="target-locations" label="Target locations" description="Cities, countries or Remote. Comma separated.">
              <Input id="target-locations" value={form.targetLocations} onChange={(e) => set("targetLocations", e.target.value)} />
            </Field>
            <Field id="min-match" label="Minimum match score" description="Jobs below this score are hidden from highlights.">
              <div className="flex items-center gap-3">
                <input
                  id="min-match"
                  type="range"
                  min={20}
                  max={90}
                  step={5}
                  value={form.minMatchThreshold}
                  onChange={(e) => set("minMatchThreshold", Number(e.target.value))}
                  aria-valuetext={`${form.minMatchThreshold} percent`}
                  className="h-1.5 flex-1 cursor-pointer border-0 bg-transparent p-0 accent-[var(--brand)] shadow-none"
                />
                <span className="w-12 text-right text-[13px] tabular-nums text-foreground">
                  {form.minMatchThreshold}%
                </span>
              </div>
            </Field>
            <Field id="crawl-interval" label="Crawl interval" description="Hours between background crawls, 1 to 48." error={errorFor("crawlIntervalHours")}>
              <div className="flex items-center gap-2">
                <Input
                  id="crawl-interval"
                  type="number"
                  min={1}
                  max={48}
                  step={1}
                  value={Number.isNaN(form.crawlIntervalHours) ? "" : form.crawlIntervalHours}
                  onChange={(e) => set("crawlIntervalHours", e.target.value === "" ? NaN : Number(e.target.value))}
                  className="w-28 tabular-nums"
                  aria-invalid={!!errorFor("crawlIntervalHours") || undefined}
                />
                <span className="text-[12.5px] text-muted-foreground">hours</span>
              </div>
            </Field>
          </Rows>
        </Panel>

        <AnimatePresence>
          {isDirty && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-hover)] bg-popover px-4 py-3 shadow-[var(--shadow-lg)]"
            >
              <span className="text-[13px] text-muted-foreground">You have unsaved changes.</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setForm(baseline);
                    setSubmitted(false);
                  }}
                >
                  Discard
                </Button>
                <Button type="submit" size="sm" disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                  {save.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </PageContainer>
  );
};
