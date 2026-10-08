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
      request<{ success: boolean; found: number; added: number; jobs: any[] }>("/crawl/twitter", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    scrapeYC: (params: { keywords?: string; role?: string; limit?: number }) =>
      request<{ success: boolean; found: number; added: number; jobs: any[] }>("/crawl/yc", {
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
};
