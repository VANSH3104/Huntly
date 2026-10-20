const API_BASE = "/api";

export type AutoApplyStatus =
  | "queued"
  | "running"
  | "open"
  | "needs_review"
  | "needs_login"
  | "skipped"
  | "submitted"
  | "failed";

export interface AutoApplyConfig {
  mode: "tabs" | "review" | "auto_submit";
  tabBatch: number;
  headless: boolean;
  dailyCap: number;
  delayMs: number;
  maxPerRun: number;
  onLogin: "skip" | "wait";
  fillGaps: boolean;
  onCaptcha: "wait" | "skip";
}

export interface AutoApplyQueueItem {
  id: string;
  jobId: string;
  title: string;
  company: string;
  applyUrl: string;
  status: AutoApplyStatus;
  mode: string;
  attempts: number;
  ats: string | null;
  reason: string | null;
  screenshot: string | null;
  unfilled: string[];
  logs: string[];
  queuedAt: number;
  finishedAt: number | null;
}

export interface AutoApplyQueueState {
  items: AutoApplyQueueItem[];
  stats: Record<AutoApplyStatus, number>;
  paused: boolean;
  config: AutoApplyConfig;
  submittedToday: number;
}

export interface ResumeRecord {
  id: string;
  name: string;
  latex: string;
  /** JSON string of the parsed resume; parse before use. */
  parsedJson: string | null;
  hash: string;
  isActive: boolean;
  createdAt: string;
}

export type FacetBucket ={ value: string; count: number };
export type JobFacets = Record<"ats" | "employmentType" | "country" | "company", FacetBucket[]>;

export interface BoardScrapeResult {
  success: true;
  scraped: number;
  added: number;
  updated: number;
  perBoard: Array<{ board: string; fetched: number; added: number; error?: string }>;
}

export interface LiveCrawlEvent {
  type: "board_start" | "board_done" | "job_added" | "error";
  board: string;
  at: string | number;
  title?: string;
  company?: string;
  url?: string;
  location?: string;
  fetched?: number;
  added?: number;
  message?: string;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const err = await response.json();
      errorMsg = err.error || err.message || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Jobs
  jobs: {
    list: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          query.set(key, String(val));
        }
      });
      return request<{
        jobs: any[];
        total?: number;
        page?: number;
        pageSize?: number;
        pagination?: { total: number; page: number; limit: number; pages: number };
        facets?: JobFacets;
      }>(
        `/jobs?${query.toString()}`
      );
    },
    getById: (id: string) => request<any>(`/jobs/${id}`),
    verify: (id: string) => request<any>(`/jobs/${id}/verify`, { method: "POST" }),
  },

  // AI & Analysis
  ai: {
    analyzeJob: (jobId: string, resumeId?: string) =>
      request<any>("/ai/analyze", {
        method: "POST",
        body: JSON.stringify({ jobId, resumeId }),
      }),
    tailorResume: (jobId: string, resumeId?: string, targetLaTeX?: string) =>
      request<{
        tailoredLaTeX: string;
        tailoredLatex: string;
        changes: any[];
        warnings?: string[];
        pdfFilename?: string;
        pdfBase64?: string;
        compileSuccess?: boolean;
        compileError?: string;
      }>("/ai/tailor-resume", {
        method: "POST",
        body: JSON.stringify({ jobId, resumeId, targetLaTeX }),
      }),
    compileResume: (data: { latex: string; jobId?: string; filename?: string }) =>
      request<{
        success: boolean;
        filename: string;
        pdfBase64?: string;
        error?: string;
      }>("/ai/compile-resume", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    generateCoverLetter: (jobId: string, resumeId?: string) =>
      request<{ coverLetter: string }>("/ai/generate-cover-letter", {
        method: "POST",
        body: JSON.stringify({ jobId, resumeId }),
      }),
    expandFilters: (params: { role?: string; keywords?: string; location?: string; skills?: string[] }) =>
      request<{
        combinations: Array<{ query: string; category: string; description: string }>;
      }>("/ai/expand-filters", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    agentSearch: (params: { query: string; resumeId?: string; limit?: number }) =>
      request<{
        query: string;
        parsedIntent: {
          targetRoles: string[];
          targetSkills: string[];
          location: string;
          reputationTier: string;
          compensationExpectation: string;
          keyFocusAreas: string[];
        };
        executionSteps: Array<{
          step: number;
          title: string;
          detail: string;
          timestamp: string;
        }>;
        stats: {
          totalEvaluatedInDb: number;
          uniqueCompaniesResearched: number;
          returnedMatches: number;
        };
        results: Array<{
          id: string;
          title: string;
          normalizedTitle: string;
          companyName: string;
          companyId: string;
          companyDomain?: string;
          companyLogoUrl?: string;
          location: any;
          employmentType?: string;
          sourceUrl?: string;
          applyUrl?: string;
          postedAt?: string;
          descriptionSnippet: string;
          skills: string[];
          agentScore: number;
          companyTier: string;
          tierBadgeColor: "emerald" | "blue" | "purple" | "amber" | "rose";
          reputationScore: number;
          expectedPay: string;
          payBenchmarkSummary: string;
          whyThisFits: string[];
          companyHighlights: string[];
          pros: string[];
          cons: string[];
        }>;
      }>("/ai/agent-search", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    generateOutreach: (params: {
      jobId?: string;
      jobTitle?: string;
      companyName?: string;
      platform?: string;
      jobDescription?: string;
      founderHandle?: string;
      contactEmail?: string;
      resumeId?: string;
    }) =>
      request<{
        success: boolean;
        companyName: string;
        jobTitle: string;
        platform: string;
        founderHandle?: string;
        contactEmail?: string;
        twitterDM: string;
        coldEmail: { subject: string; body: string };
        linkedInNote: string;
        keyHook: string;
      }>("/ai/outreach-draft", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },

  // Companies
  companies: {
    list: (params: Record<string, any> = {}) => {
      const query = new URLSearchParams(params);
      return request<{ companies: any[]; total: number }>(`/companies?${query.toString()}`);
    },
    getById: (id: string) => request<any>(`/companies/${id}`),
    create: (data: any) => request<any>("/companies", { method: "POST", body: JSON.stringify(data) }),
  },

  // Sources
  sources: {
    list: () => request<any[]>("/sources"),
    create: (data: any) => request<any>("/sources", { method: "POST", body: JSON.stringify(data) }),
    triggerCrawl: (id: string) => request<any>(`/sources/${id}/crawl`, { method: "POST" }),
  },

  // Crawl & Discovery
  crawl: {
    start: (options?: { scope?: string; queryFamilies?: string[] }) =>
      request<any>("/crawl/start", {
        method: "POST",
        body: JSON.stringify(options ?? {}),
      }),
    status: () => request<any>("/crawl/status"),
    probeUrl: (url: string) =>
      request<any>("/crawl/probe", {
        method: "POST",
        body: JSON.stringify({ url }),
      }),
    events: (limit = 50) => request<any[]>(`/crawl/events?limit=${limit}`),
    runs: () => request<any[]>("/crawl/runs"),
    listBoards: () => request<{ boards: Array<{ id: string; label: string }> }>("/crawl/boards"),
    boards: (params: { keywords?: string; boards?: string[]; limit?: number }) =>
      request<BoardScrapeResult>("/crawl/boards", { method: "POST", body: JSON.stringify(params) }),
    liveUrl: () => `${API_BASE}/crawl/live`,
    discover: (params: { keywords?: string; role?: string; location?: string; remoteOnly?: boolean }) =>
      request<any>("/crawl/discover", { method: "POST", body: JSON.stringify(params) }),
    scrapeLinkedIn: (params: { keywords: string; location?: string; remoteOnly?: boolean }) =>
      request<any>("/crawl/linkedin", { method: "POST", body: JSON.stringify(params) }),
    scrapeTwitter: (params: { keywords: string; location?: string; limit?: number }) =>
      request<{ success: boolean; found?: number; scraped?: number; added: number; jobs?: any[] }>("/crawl/twitter", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    scrapeYC: (params: { keywords?: string; role?: string; limit?: number }) =>
      request<{ success: boolean; found?: number; scraped?: number; added: number; jobs?: any[] }>("/crawl/yc", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    scrapeHN: (params: { keywords?: string; role?: string; limit?: number }) =>
      request<{ success: boolean; found?: number; scraped?: number; added: number; jobs?: any[] }>("/crawl/hn", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    crawlCareerPage: (params: { url: string; companyName?: string }) =>
      request<{ success: boolean; url: string; company: string; addedJobs: number }>("/crawl/career-page", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    deepSearch: (params: { queries: string[]; location?: string; remoteOnly?: boolean; limitPerQuery?: number }) =>
      request<{
        success: boolean;
        runId: string;
        totalAdded: number;
        results: Array<{ query: string; jobsAdded: number }>;
      }>("/crawl/deep-search", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },

  // Applications
  applications: {
    list: () => request<any[]>("/applications"),
    create: (data: { jobId: string; status?: string; notes?: string }) =>
      request<any>("/applications", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/applications/${id}`, { method: "DELETE" }),
  },

  // Resumes
  resumes: {
    list: () => request<ResumeRecord[]>("/resumes"),
    getActive: () => request<any>("/resumes/active"),
    create: (data: { name: string; latex: string; setActive?: boolean }) =>
      request<{ id: string; name: string; hash: string; isActive: boolean }>("/resumes", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name?: string; latex?: string }) =>
      request<ResumeRecord>(`/resumes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<{ ok: boolean }>(`/resumes/${id}`, { method: "DELETE" }),
    setActive: (id: string) =>
      request<any>(`/resumes/${id}/activate`, { method: "POST" }),
    compile: (data?: { latex?: string; resumeId?: string; filename?: string }) =>
      request<{ success: boolean; filename: string; pdfBase64?: string; error?: string; log?: string }>(
        "/resumes/compile",
        {
          method: "POST",
          body: JSON.stringify(data || {}),
        }
      ),
  },

  // Analytics
  analytics: {
    getOverview: () => request<any>("/analytics/overview"),
    getSkills: () => request<any>("/analytics/skills"),
    getSalary: () => request<any>("/analytics/salary"),
  },

  // Notifications
  notifications: {
    list: () => request<any[]>("/notifications"),
    markRead: (id: string) =>
      request<any>(`/notifications/${id}/read`, { method: "POST" }),
  },

  // Settings
  settings: {
    getAll: () => request<Record<string, any>>("/settings"),
    update: (settings: Record<string, any>) =>
      request<any>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
    getLlm: () => request<any>("/settings/llm"),
    testLlm: (config?: any) =>
      request<any>("/settings/test-llm", { method: "POST", body: JSON.stringify(config || {}) }),
  },

  // Tech & AI Intelligence Radar
  intel: {
    getFeed: (params: { category?: string; q?: string; force?: boolean } = {}) => {
      const query = new URLSearchParams();
      if (params.category && params.category !== "all") query.set("category", params.category);
      if (params.q) query.set("q", params.q);
      if (params.force) query.set("force", "true");
      return request<{
        success: boolean;
        count: number;
        feed: Array<{
          id: string;
          title: string;
          source: string;
          category: string;
          url: string;
          score: number;
          commentsCount: number;
          readTime: string;
          publishedAt: string;
          executiveSummary: string;
          technicalHighlights: string[];
          practicalImpact: string;
          keyConcepts: string[];
        }>;
        lastUpdated: string;
      }>(`/intel/feed?${query.toString()}`);
    },
    refresh: () => request<{ success: boolean; count: number; feed: any[] }>("/intel/refresh", { method: "POST" }),
    deepDive: (params: { title: string; summary: string; url: string }) =>
      request<{
        success: boolean;
        title: string;
        architectureOverview: string;
        markdownContent: string;
        codeExample?: string;
      }>("/intel/deep-dive", { method: "POST", body: JSON.stringify(params) }),
  },

  // Autonomous Job Application Crawler (Auto-Applier)
  autoApply: {
    getProfile: () => request<any>("/auto-apply/profile"),
    updateProfile: (profile: any) =>
      request<{ success: boolean; profile: any }>("/auto-apply/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    apply: (data: {
      jobId: string;
      resumeId?: string;
      mode: "review" | "auto_submit";
      profileOverrides?: any;
    }) =>
      request<{
        jobId: string;
        title: string;
        company: string;
        url: string;
        atsType: string;
        status: "ready_for_review" | "submitted" | "needs_review" | "needs_login" | "skipped" | "already_applied" | "failed";
        reason?: string;
        fieldsFilled: Array<{ field: string; label: string; value: string; type: string }>;
        screenshotBase64?: string;
        screenshotPath?: string;
        confirmationMessage?: string;
        logs: string[];
        error?: string;
        applicationId?: string;
      }>("/auto-apply", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    confirm: (data: { jobId: string; resumeId?: string }) =>
      request<any>("/auto-apply/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getMemory: () => request<{ success: boolean; memory: Record<string, string> }>("/auto-apply/memory"),
    saveMemory: (data: { question: string; answer: string }) =>
      request<{ success: boolean; question: string; answer: string }>("/auto-apply/memory", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    queue: () => request<AutoApplyQueueState>("/auto-apply/queue"),
    previewQueue: (jobIds: string[]) =>
      request<{ total: number; fresh: number; skipped: Array<{ jobId: string; reason: string }> }>(
        "/auto-apply/queue/preview",
        { method: "POST", body: JSON.stringify({ jobIds }) }
      ),
    enqueue: (data: { jobIds: string[]; mode?: "tabs" | "review" | "auto_submit"; limit?: number; resumeId?: string }) =>
      request<{ queued: string[]; skipped: Array<{ jobId: string; reason: string }> }>("/auto-apply/queue", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    pauseQueue: () => request<any>("/auto-apply/queue/pause", { method: "POST" }),
    resumeQueue: () => request<any>("/auto-apply/queue/resume", { method: "POST" }),
    cancelQueued: () => request<any>("/auto-apply/queue/cancel-queued", { method: "POST" }),
    clearFailed: () => request<any>("/auto-apply/queue/clear-failed", { method: "POST" }),
    retryItem: (id: string, opts: { force?: boolean; signIn?: boolean } = {}) =>
      request<any>(`/auto-apply/queue/${id}/retry`, { method: "POST", body: JSON.stringify(opts) }),
    rerun: (statuses: AutoApplyStatus[]) =>
      request<any>("/auto-apply/queue/rerun", { method: "POST", body: JSON.stringify({ statuses }) }),
    connectLinkedIn: () => request<{ started: boolean; message?: string }>("/auto-apply/linkedin/connect", { method: "POST" }),
    focusItem: (id: string) => request<{ ok: boolean }>(`/auto-apply/queue/${id}/focus`, { method: "POST" }),
    markItemApplied: (id: string) => request<any>(`/auto-apply/queue/${id}/mark-applied`, { method: "POST" }),
    removeItem: (id: string) => request<any>(`/auto-apply/queue/${id}`, { method: "DELETE" }),
    readiness: () =>
      request<{
        profile: { fullName: string; email: string; phone: string; linkedinUrl: string; location: string };
        needsCity: boolean;
        missing: string[];
        resumePdf: { size: number; updatedAt: number } | null;
      }>("/auto-apply/readiness"),
    uploadResumePdf: async (file: File) =>
      request<{ ok: boolean }>("/auto-apply/resume-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: await file.arrayBuffer(),
      }),
    deleteResumePdf: () => request<{ ok: boolean }>("/auto-apply/resume-pdf", { method: "DELETE" }),
    resumePdfUrl: (version?: number) => `/api/auto-apply/resume-pdf${version ? `?v=${version}` : ""}`,
    getConfig: () => request<AutoApplyConfig>("/auto-apply/config"),
    saveConfig: (patch: Partial<AutoApplyConfig>) =>
      request<AutoApplyConfig>("/auto-apply/config", { method: "PUT", body: JSON.stringify(patch) }),
    batch: (data: { jobIds: string[]; resumeId?: string; mode?: "review" | "auto_submit" }) =>
      request<{
        success: boolean;
        total: number;
        submitted: number;
        readyForReview: number;
        failed: number;
        results: any[];
      }>("/auto-apply/batch", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};
