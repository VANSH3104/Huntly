/**
 * SourceHealthTracker — Tracks per-source crawl reliability metrics.
 *
 * Tracks for each source URL:
 *   - Success rate
 *   - Average latency
 *   - HTTP errors
 *   - Extraction failures
 *   - Jobs discovered over time
 *   - Last success / failure timestamps
 *
 * Sources with repeated failures get their crawl frequency reduced.
 * Sources that recover have their frequency restored.
 */

// ─── Types ───────────────────────────────────────────────────────

export interface SourceHealth {
  url: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  extractionFailures: number;
  totalLatencyMs: number;
  totalJobsDiscovered: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  /** Current crawl interval multiplier. 1.0 = normal, 2.0 = half frequency, etc. */
  intervalMultiplier: number;
  /** Whether this source is considered healthy for crawling. */
  isHealthy: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

/** Success rate below this → reduce frequency. */
const LOW_SUCCESS_THRESHOLD = 0.4;
/** Success rate above this after recovery → restore frequency. */
const RECOVERY_THRESHOLD = 0.7;
/** Max interval multiplier (4x = very infrequent). */
const MAX_INTERVAL_MULTIPLIER = 4;
/** After this many total failures, mark as unhealthy. */
const UNHEALTHY_FAILURE_THRESHOLD = 10;

// ─── SourceHealthTracker ─────────────────────────────────────────

export class SourceHealthTracker {
  private health = new Map<string, SourceHealth>();

  ensure(url: string): SourceHealth {
    if (!this.health.has(url)) {
      this.health.set(url, {
        url,
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        extractionFailures: 0,
        totalLatencyMs: 0,
        totalJobsDiscovered: 0,
        intervalMultiplier: 1.0,
        isHealthy: true,
      });
    }
    return this.health.get(url)!;
  }

  recordSuccess(url: string, latencyMs: number, jobCount: number): void {
    const h = this.ensure(url);
    h.totalAttempts++;
    h.successCount++;
    h.totalLatencyMs += latencyMs;
    h.totalJobsDiscovered += jobCount;
    h.lastSuccessAt = new Date().toISOString();

    // Recovery: restore interval multiplier if success rate improves
    const rate = this.successRate(h);
    if (rate >= RECOVERY_THRESHOLD && h.intervalMultiplier > 1) {
      h.intervalMultiplier = Math.max(1, h.intervalMultiplier / 2);
      console.log(`[SourceHealth] ${url} recovering — interval multiplier: ${h.intervalMultiplier}`);
    }

    if (rate > 0.5) h.isHealthy = true;
  }

  recordFailure(url: string, error: string, isExtractionFailure = false): void {
    const h = this.ensure(url);
    h.totalAttempts++;
    h.failureCount++;
    if (isExtractionFailure) h.extractionFailures++;
    h.lastFailureAt = new Date().toISOString();
    h.lastError = error;

    const rate = this.successRate(h);

    // Reduce frequency on sustained failures
    if (rate < LOW_SUCCESS_THRESHOLD && h.totalAttempts >= 5) {
      h.intervalMultiplier = Math.min(MAX_INTERVAL_MULTIPLIER, h.intervalMultiplier * 2);
      console.warn(`[SourceHealth] ${url} degraded — interval multiplier: ${h.intervalMultiplier}`);
    }

    // Mark unhealthy after too many failures
    if (h.failureCount >= UNHEALTHY_FAILURE_THRESHOLD && rate < 0.3) {
      h.isHealthy = false;
      console.error(`[SourceHealth] ${url} marked UNHEALTHY after ${h.failureCount} failures`);
    }
  }

  getHealth(url: string): SourceHealth | null {
    return this.health.get(url) ?? null;
  }

  successRate(h: SourceHealth): number {
    if (h.totalAttempts === 0) return 1;
    return h.successCount / h.totalAttempts;
  }

  averageLatencyMs(url: string): number {
    const h = this.health.get(url);
    if (!h || h.successCount === 0) return 0;
    return h.totalLatencyMs / h.successCount;
  }

  /**
   * Returns the effective crawl interval multiplier for a source.
   * Orchestrator should multiply the base interval by this value.
   */
  getIntervalMultiplier(url: string): number {
    return this.health.get(url)?.intervalMultiplier ?? 1;
  }

  /**
   * Returns true if the source is healthy enough to crawl.
   */
  isHealthy(url: string): boolean {
    return this.health.get(url)?.isHealthy ?? true;
  }

  /**
   * Returns a summary of all tracked source health stats.
   */
  getSummary(): Array<{
    url: string;
    successRate: number;
    avgLatencyMs: number;
    jobsDiscovered: number;
    isHealthy: boolean;
    intervalMultiplier: number;
  }> {
    return [...this.health.values()].map(h => ({
      url: h.url,
      successRate: this.successRate(h),
      avgLatencyMs: h.successCount > 0 ? h.totalLatencyMs / h.successCount : 0,
      jobsDiscovered: h.totalJobsDiscovered,
      isHealthy: h.isHealthy,
      intervalMultiplier: h.intervalMultiplier,
    }));
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let _tracker: SourceHealthTracker | null = null;

export function getSourceHealthTracker(): SourceHealthTracker {
  if (!_tracker) _tracker = new SourceHealthTracker();
  return _tracker;
}
