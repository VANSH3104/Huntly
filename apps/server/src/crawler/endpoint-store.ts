/**
 * EndpointStore — Persists and retrieves discovered API endpoints.
 *
 * When Playwright discovers that company.com/jobs → api.company.com/jobs,
 * that relationship is stored here so future crawls can skip the browser
 * entirely and go directly to the API.
 *
 * Uses a lightweight in-memory cache backed by a JSON file for persistence
 * across server restarts. (No DB migration needed — separate from the main schema.)
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DiscoveredEndpoint, EndpointType } from "./network-interceptor.js";

// ─── Types ───────────────────────────────────────────────────────

export interface StoredEndpoint {
  pageUrl: string;
  apiUrl: string;
  method: string;
  contentType: string;
  endpointType: EndpointType;
  discoveredAt: string;
  lastVerifiedAt: string;
  successCount: number;
  failureCount: number;
  /** Last known job count from this endpoint. */
  lastJobCount: number;
  /** Whether this endpoint is still considered valid. */
  isActive: boolean;
}

// ─── EndpointStore ────────────────────────────────────────────────

export class EndpointStore {
  private store = new Map<string, StoredEndpoint>();
  private dirty = false;
  private filePath: string;

  constructor(dataDir: string = process.cwd()) {
    this.filePath = path.join(dataDir, "endpoint-store.json");
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(data) as Record<string, StoredEndpoint>;
      for (const [key, val] of Object.entries(parsed)) {
        this.store.set(key, val);
      }
      console.log(`[EndpointStore] Loaded ${this.store.size} endpoints`);
    } catch {
      // File may not exist yet — start fresh
    }
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    try {
      const obj: Record<string, StoredEndpoint> = {};
      for (const [key, val] of this.store) {
        obj[key] = val;
      }
      await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      console.warn("[EndpointStore] Failed to save:", err);
    }
  }

  // ─── Lookup ──────────────────────────────────────────────────

  /**
   * Returns the best known active endpoint for a given page URL domain.
   * Returns null if none found or all are inactive.
   */
  getBestForDomain(domain: string): StoredEndpoint | null {
    let best: StoredEndpoint | null = null;
    for (const endpoint of this.store.values()) {
      if (!endpoint.isActive) continue;
      if (!endpoint.pageUrl.includes(domain)) continue;
      if (!best || endpoint.lastJobCount > best.lastJobCount) {
        best = endpoint;
      }
    }
    return best;
  }

  /**
   * Returns all active job-listing endpoints for a domain.
   */
  getJobEndpointsForDomain(domain: string): StoredEndpoint[] {
    return [...this.store.values()].filter(
      e =>
        e.isActive &&
        e.pageUrl.includes(domain) &&
        (e.endpointType === "job_listing" || e.endpointType === "search" || e.endpointType === "graphql")
    );
  }

  // ─── Write ───────────────────────────────────────────────────

  record(endpoint: DiscoveredEndpoint, jobCount: number): void {
    const key = `${endpoint.method}:${endpoint.apiUrl}`;

    const existing = this.store.get(key);
    if (existing) {
      existing.lastVerifiedAt = new Date().toISOString();
      existing.successCount++;
      existing.lastJobCount = Math.max(existing.lastJobCount, jobCount);
      existing.isActive = true;
    } else {
      this.store.set(key, {
        pageUrl: endpoint.pageUrl,
        apiUrl: endpoint.apiUrl,
        method: endpoint.method,
        contentType: endpoint.contentType,
        endpointType: endpoint.endpointType,
        discoveredAt: endpoint.discoveredAt,
        lastVerifiedAt: new Date().toISOString(),
        successCount: 1,
        failureCount: 0,
        lastJobCount: jobCount,
        isActive: true,
      });
      console.log(`[EndpointStore] Recorded new ${endpoint.endpointType} endpoint: ${endpoint.apiUrl}`);
    }

    this.dirty = true;
  }

  recordFailure(apiUrl: string, method = "GET"): void {
    const key = `${method}:${apiUrl}`;
    const existing = this.store.get(key);
    if (existing) {
      existing.failureCount++;
      // Disable endpoint after 5 consecutive failures
      if (existing.failureCount > 5 && existing.successCount < existing.failureCount) {
        existing.isActive = false;
        console.warn(`[EndpointStore] Disabled endpoint after failures: ${apiUrl}`);
      }
      this.dirty = true;
    }
  }

  recordSuccess(apiUrl: string, method = "GET", jobCount = 0): void {
    const key = `${method}:${apiUrl}`;
    const existing = this.store.get(key);
    if (existing) {
      existing.successCount++;
      existing.failureCount = 0; // Reset on success
      existing.lastJobCount = jobCount;
      existing.lastVerifiedAt = new Date().toISOString();
      existing.isActive = true;
      this.dirty = true;
    }
  }

  // ─── Stats ───────────────────────────────────────────────────

  get size(): number { return this.store.size; }

  getStats(): { total: number; active: number; inactive: number; byType: Record<string, number> } {
    const byType: Record<string, number> = {};
    let active = 0;
    let inactive = 0;
    for (const e of this.store.values()) {
      if (e.isActive) active++; else inactive++;
      byType[e.endpointType] = (byType[e.endpointType] ?? 0) + 1;
    }
    return { total: this.store.size, active, inactive, byType };
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let _store: EndpointStore | null = null;

export function getEndpointStore(dataDir?: string): EndpointStore {
  if (!_store) _store = new EndpointStore(dataDir);
  return _store;
}
