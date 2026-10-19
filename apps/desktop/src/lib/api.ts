const API_BASE = "/api";

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
    list: () => request<any[]>("/resumes"),
    getActive: () => request<any>("/resumes/active"),
    create: (data: { name: string; latex: string; makeActive?: boolean }) =>
      request<any>("/resumes", { method: "POST", body: JSON.stringify(data) }),
    setActive: (id: string) =>
      request<any>(`/resumes/${id}/activate`, { method: "POST" }),
    compile: (data?: { latex?: string; resumeId?: string; filename?: string }) =>
      request<{ success: boolean; filename: string; pdfBase64?: string; error?: string }>(
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

  // Agent Sandbox Environment
  sandbox: {
    list: () => request<any[]>("/sandbox"),
    create: (data: { id?: string; timeoutSeconds?: number; persistent?: boolean; metadata?: Record<string, string> } = {}) =>
      request<any>("/sandbox", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) => request<any>(`/sandbox/${id}`),
    terminate: (id: string) => request<any>(`/sandbox/${id}`, { method: "DELETE" }),
    execCommand: (id: string, command: string, cwd?: string, timeoutSeconds?: number) =>
      request<{
        commandId: string;
        command: string;
        stdout: string;
        stderr: string;
        exitCode: number | null;
        durationMs: number;
        timedOut: boolean;
        status: "completed" | "failed" | "timed_out" | "running";
      }>(`/sandbox/${id}/commands`, {
        method: "POST",
        body: JSON.stringify({ command, cwd, timeoutSeconds }),
      }),
    listFiles: (id: string, path: string = ".") =>
      request<{ files: Array<{ name: string; path: string; isDirectory: boolean; sizeBytes: number; updatedAt: string }> }>(
        `/sandbox/${id}/files/list?path=${encodeURIComponent(path)}`
      ),
    readFile: (id: string, path: string) =>
      request<{ content: string; sizeBytes: number }>(`/sandbox/${id}/files?path=${encodeURIComponent(path)}`),
    writeFile: (id: string, path: string, content: string) =>
      request<{ success: boolean; path: string; bytesWritten: number }>(`/sandbox/${id}/files`, {
        method: "POST",
        body: JSON.stringify({ path, content }),
      }),
    browser: {
      getStatus: () => request<any>("/sandbox/browser/status"),
      navigate: (url: string, viewport?: { width: number; height: number }) =>
        request<any>("/sandbox/browser/navigate", {
          method: "POST",
          body: JSON.stringify({ url, viewport }),
        }),
      click: (coords?: { x?: number; y?: number; selector?: string }) =>
        request<any>("/sandbox/browser/click", {
          method: "POST",
          body: JSON.stringify(coords || {}),
        }),
      type: (text: string, selector?: string) =>
        request<any>("/sandbox/browser/type", {
          method: "POST",
          body: JSON.stringify({ text, selector }),
        }),
      scroll: (deltaY: number = 300) =>
        request<any>("/sandbox/browser/scroll", {
          method: "POST",
          body: JSON.stringify({ deltaY }),
        }),
      back: () => request<any>("/sandbox/browser/back", { method: "POST" }),
      forward: () => request<any>("/sandbox/browser/forward", { method: "POST" }),
      reload: () => request<any>("/sandbox/browser/reload", { method: "POST" }),
      close: () => request<any>("/sandbox/browser/close", { method: "POST" }),
    },
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
        status: "ready_for_review" | "submitted" | "failed";
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
