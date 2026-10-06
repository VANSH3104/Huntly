/**
 * NetworkInterceptor — Captures and classifies network traffic during Playwright page loads.
 *
 * Monitors all requests/responses to:
 *  - Identify public JSON/API/GraphQL endpoints that serve job data
 *  - Capture structured JSON payloads from XHR/fetch responses
 *  - Classify discovered endpoints by type
 *  - Enable "discover once, reuse later" API extraction
 */

import type { Page, Request, Response } from "playwright";

// ─── Types ───────────────────────────────────────────────────────

export type EndpointType =
  | "job_listing"
  | "job_detail"
  | "search"
  | "pagination"
  | "company"
  | "location"
  | "metadata"
  | "graphql"
  | "unknown";

export interface DiscoveredEndpoint {
  pageUrl: string;
  apiUrl: string;
  method: string;
  contentType: string;
  status: number;
  discoveredAt: string;
  endpointType: EndpointType;
  /** Parsed JSON payload, if available and parseable. */
  payload?: unknown;
  /** Estimated count of jobs in the payload. */
  jobCount?: number;
}

export interface InterceptedResponse {
  url: string;
  method: string;
  status: number;
  contentType: string;
  payload: unknown;
  jobCount: number;
  endpointType: EndpointType;
}

// ─── Scoring heuristics ──────────────────────────────────────────

/** URL patterns that strongly suggest a job-related endpoint. */
const JOB_URL_SIGNALS = [
  /\/jobs?\b/i,
  /\/career/i,
  /\/posting/i,
  /\/position/i,
  /\/opening/i,
  /\/listing/i,
  /\/search/i,
  /\/vacancies?/i,
  /\/opportunities?/i,
  /\/requisition/i,
  /graphql/i,
  /boards-api\.greenhouse\.io/i,
  /api\.lever\.co/i,
  /api\.ashbyhq\.com/i,
  /\.workday\.com/i,
  /smartrecruiters\.com/i,
  /\.workable\.com/i,
];

/** Field names in JSON that indicate job-list-like data. */
const JOB_PAYLOAD_SIGNALS = [
  "jobs",
  "jobPostings",
  "positions",
  "openings",
  "listings",
  "postings",
  "data",
  "results",
  "items",
  "edges",
  "nodes",
];

const GRAPHQL_SIGNALS = [/graphql/i, /gql/i, /\/query/i];

/** Minimum size (bytes) of a JSON response worth capturing. */
const MIN_RESPONSE_SIZE = 100;

/** Maximum size (bytes) to read from a single response to avoid OOM. */
const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2 MB

// ─── NetworkInterceptor ──────────────────────────────────────────

export class NetworkInterceptor {
  private responses: InterceptedResponse[] = [];
  private endpoints: DiscoveredEndpoint[] = [];
  private pageUrl = "";

  /** Install listeners on a page before navigation. */
  attach(page: Page): void {
    this.responses = [];
    this.endpoints = [];

    page.on("response", (response) => {
      this.handleResponse(response, page.url()).catch(() => {/* ignore */});
    });
  }

  private async handleResponse(response: Response, currentPageUrl: string): Promise<void> {
    // Only care about successful responses
    if (response.status() < 200 || response.status() >= 400) return;

    const url = response.url();
    const contentType = response.headers()["content-type"] ?? "";

    const isJson = contentType.includes("application/json") || contentType.includes("application/ld+json");
    const isGraphQL = GRAPHQL_SIGNALS.some(p => p.test(url));

    if (!isJson && !isGraphQL) return;

    // Does the URL have any job-related signal?
    const hasJobSignal = JOB_URL_SIGNALS.some(p => p.test(url));
    if (!hasJobSignal && !isGraphQL) return;

    let payload: unknown;
    try {
      const body = await response.body();
      if (body.length < MIN_RESPONSE_SIZE || body.length > MAX_RESPONSE_SIZE) return;
      payload = JSON.parse(body.toString("utf-8"));
    } catch {
      return; // Not valid JSON or too large
    }

    const jobCount = estimateJobCount(payload);
    const endpointType = classifyEndpoint(url, payload, jobCount);

    // Only record if it looks like it has jobs (unless it's GraphQL which we always capture)
    if (jobCount === 0 && endpointType === "unknown" && !isGraphQL) return;

    const intercepted: InterceptedResponse = {
      url,
      method: response.request().method(),
      status: response.status(),
      contentType,
      payload,
      jobCount,
      endpointType,
    };

    this.responses.push(intercepted);

    const endpoint: DiscoveredEndpoint = {
      pageUrl: currentPageUrl || this.pageUrl,
      apiUrl: url,
      method: response.request().method(),
      contentType,
      status: response.status(),
      discoveredAt: new Date().toISOString(),
      endpointType,
      payload,
      jobCount,
    };
    this.endpoints.push(endpoint);

    if (jobCount > 0) {
      console.log(`[NetworkInterceptor] Discovered ${endpointType} endpoint: ${url} (${jobCount} jobs)`);
    }
  }

  /** Set the base page URL for endpoint tracking. */
  setPageUrl(url: string): void {
    this.pageUrl = url;
  }

  /** Returns all captured JSON responses, sorted by job count descending. */
  getResponses(): InterceptedResponse[] {
    return [...this.responses].sort((a, b) => b.jobCount - a.jobCount);
  }

  /** Returns the best response (highest job count), or undefined. */
  getBestResponse(): InterceptedResponse | undefined {
    return this.getResponses()[0];
  }

  /** Returns all discovered endpoints. */
  getEndpoints(): DiscoveredEndpoint[] {
    return [...this.endpoints];
  }

  /** Returns endpoints classified as job listings. */
  getJobListingEndpoints(): DiscoveredEndpoint[] {
    return this.endpoints.filter(e =>
      e.endpointType === "job_listing" ||
      e.endpointType === "search" ||
      e.endpointType === "graphql"
    );
  }

  reset(): void {
    this.responses = [];
    this.endpoints = [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Estimates how many jobs are contained in a JSON payload.
 * Checks common array shapes used by ATS and job APIs.
 */
function estimateJobCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;

  // Array directly
  if (Array.isArray(payload)) {
    if (payload.length > 0 && looksLikeJob(payload[0])) return payload.length;
    return 0;
  }

  const obj = payload as Record<string, unknown>;

  // Check top-level keys
  for (const key of JOB_PAYLOAD_SIGNALS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) return val.length;
  }

  // GraphQL: data.jobs, data.jobBoard.jobs, etc.
  if (obj["data"] && typeof obj["data"] === "object") {
    const inner = obj["data"] as Record<string, unknown>;
    for (const key of Object.keys(inner)) {
      const val = inner[key];
      if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) return val.length;
      // Nested one more level: data.jobBoard.jobs
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const nested = val as Record<string, unknown>;
        for (const nkey of Object.keys(nested)) {
          const nval = nested[nkey];
          if (Array.isArray(nval) && nval.length > 0 && looksLikeJob(nval[0])) return nval.length;
        }
      }
    }
  }

  return 0;
}

/** Checks whether an object looks like a job posting. */
function looksLikeJob(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  // Check for common job fields
  return !!(
    (o["title"] || o["name"] || o["jobTitle"]) &&
    (o["id"] || o["jobId"] || o["requisitionId"] || o["url"] || o["applyUrl"] || o["absoluteUrl"])
  );
}

/** Classifies an endpoint based on URL signals and payload shape. */
export function classifyEndpoint(url: string, payload: unknown, jobCount: number): EndpointType {
  if (GRAPHQL_SIGNALS.some(p => p.test(url))) return "graphql";
  if (/\/search/i.test(url)) return "search";
  if (/\/job\/\d+|\/jobs\/\d+|\/posting\/[^/]+/i.test(url)) return "job_detail";
  if (/page=|offset=|cursor=|start=/i.test(url)) return "pagination";
  if (/\/company|\/employer/i.test(url)) return "company";
  if (/\/location/i.test(url)) return "location";

  if (jobCount > 0) return "job_listing";

  return "unknown";
}

// ─── Payload Extraction Helpers ──────────────────────────────────

export interface RawJobFromNetwork {
  title?: string;
  id?: string | number;
  url?: string;
  applyUrl?: string;
  absoluteUrl?: string;
  location?: string | { name?: string };
  description?: string;
  descriptionPlain?: string;
  employmentType?: string;
  postedAt?: string;
  updatedAt?: string;
  categories?: { location?: string; team?: string };
  [key: string]: unknown;
}

/**
 * Extracts a flat array of job-like objects from an intercepted JSON payload.
 */
export function extractJobsFromPayload(payload: unknown): RawJobFromNetwork[] {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.filter(looksLikeJob) as RawJobFromNetwork[];
  }

  if (typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;

  // Direct top-level keys
  for (const key of JOB_PAYLOAD_SIGNALS) {
    const val = obj[key];
    if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) {
      return val as RawJobFromNetwork[];
    }
  }

  // GraphQL data layer
  if (obj["data"] && typeof obj["data"] === "object") {
    const inner = obj["data"] as Record<string, unknown>;
    for (const key of Object.keys(inner)) {
      const val = inner[key];
      if (Array.isArray(val) && val.length > 0 && looksLikeJob(val[0])) {
        return val as RawJobFromNetwork[];
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const nested = val as Record<string, unknown>;
        for (const nkey of Object.keys(nested)) {
          const nval = nested[nkey];
          if (Array.isArray(nval) && nval.length > 0 && looksLikeJob(nval[0])) {
            return nval as RawJobFromNetwork[];
          }
        }
      }
    }
  }

  return [];
}
