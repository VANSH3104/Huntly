/**
 * Ghost Job Detector Service
 *
 * Evaluates job vacancy authenticity and identifies "ghost jobs" (postings that are perpetually
 * open without real hiring intent, stale reposts, or phantom aggregator listings).
 */

export type GhostRiskLevel = "none" | "low" | "medium" | "high";

export interface GhostSignalResult {
  riskLevel: GhostRiskLevel;
  riskScore: number; // 0 - 100
  isGhost: boolean;
  reasons: string[];
  signals: {
    isStale: boolean;
    isEvergreen: boolean;
    isSparse: boolean;
    isAggregatorUnverified: boolean;
    daysOpen: number;
  };
}

export interface JobInputForGhostAnalysis {
  title: string;
  companyName: string;
  description?: string | null;
  postedAt?: Date | string | null;
  createdAt?: Date | string | null;
  sourceUrl?: string | null;
  board?: string | null;
  isClosed?: boolean | null;
}

export class GhostJobDetector {
  /**
   * Analyzes a job and produces a deterministic authenticity score and breakdown.
   */
  static analyze(job: JobInputForGhostAnalysis): GhostSignalResult {
    const reasons: string[] = [];
    let riskScore = 0;

    // 1. Calculate posting age
    const now = Date.now();
    const referenceDate = job.postedAt
      ? new Date(job.postedAt).getTime()
      : job.createdAt
      ? new Date(job.createdAt).getTime()
      : now;

    const daysOpen = Math.max(0, Math.round((now - referenceDate) / (1000 * 60 * 60 * 24)));

    let isStale = false;
    let isEvergreen = false;

    if (daysOpen > 90) {
      isEvergreen = true;
      riskScore += 45;
      reasons.push(`Posted ${daysOpen} days ago with no hire made (evergreen listing)`);
    } else if (daysOpen > 45) {
      isStale = true;
      riskScore += 25;
      reasons.push(`Posting is ${daysOpen} days old without recent employer activity`);
    }

    // 2. Analyze description substance
    const descText = (job.description ?? "").replace(/<[^>]*>/g, " ").trim();
    let isSparse = false;
    if (descText.length > 0 && descText.length < 180) {
      isSparse = true;
      riskScore += 25;
      reasons.push("Extremely brief or generic role description (possible placeholder)");
    }

    // 3. Source reliability & Aggregator cross-check
    const board = (job.board ?? "").toLowerCase();
    const url = (job.sourceUrl ?? "").toLowerCase();
    let isAggregatorUnverified = false;

    // Direct ATS sources (Greenhouse, Lever, Ashby, Workday, BambooHR) have direct company authority
    const isDirectAts =
      url.includes("greenhouse.io") ||
      url.includes("lever.co") ||
      url.includes("ashbyhq.com") ||
      url.includes("myworkdayjobs.com") ||
      url.includes("bamboohr.com") ||
      url.includes("smartrecruiters.com") ||
      url.includes("workable.com") ||
      url.includes("recruitee.com") ||
      url.includes("breezy.hr");

    if (!isDirectAts && (board === "foundit" || board === "monster" || board === "timesjobs")) {
      isAggregatorUnverified = true;
      riskScore += 15;
      reasons.push("Aggregator feed; not verified against official company ATS board");
    }

    // 4. Closed status
    if (job.isClosed) {
      riskScore = 100;
      reasons.push("Listing has been closed by employer");
    }

    // Normalize risk score to 100 max
    riskScore = Math.min(100, riskScore);

    // Derive Risk Level
    let riskLevel: GhostRiskLevel = "none";
    if (riskScore >= 60) {
      riskLevel = "high";
    } else if (riskScore >= 35) {
      riskLevel = "medium";
    } else if (riskScore >= 15) {
      riskLevel = "low";
    }

    return {
      riskLevel,
      riskScore,
      isGhost: riskLevel === "high" || riskLevel === "medium",
      reasons: reasons.length > 0 ? reasons : ["Active posting with normal hiring velocity"],
      signals: {
        isStale,
        isEvergreen,
        isSparse,
        isAggregatorUnverified,
        daysOpen,
      },
    };
  }
}
