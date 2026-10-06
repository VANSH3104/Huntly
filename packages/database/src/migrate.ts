import { getDatabase } from "./client.js";
import { sql } from "drizzle-orm";

/**
 * Runs inline migrations against the SQLite database.
 * We use CREATE TABLE IF NOT EXISTS style DDL so it's completely idempotent.
 */
export async function runMigrations(dbPath?: string): Promise<void> {
  const db = getDatabase(dbPath);

  const tables = getTableDDL();
  for (const stmt of tables) {
    db.run(sql.raw(stmt));
  }

  const indexes = getIndexDDL();
  for (const stmt of indexes) {
    db.run(sql.raw(stmt));
  }

  console.log("✓ Database migrations complete");
}

function getTableDDL(): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      latex TEXT NOT NULL,
      parsed_json TEXT,
      hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS resume_skills (
      id TEXT PRIMARY KEY,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      skill TEXT NOT NULL,
      canonical TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL UNIQUE,
      logo_url TEXT,
      industry TEXT,
      company_type TEXT,
      size TEXT,
      headquarters TEXT,
      website TEXT,
      career_page TEXT,
      ats TEXT,
      linkedin_url TEXT,
      description TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      is_preferred INTEGER NOT NULL DEFAULT 0,
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_crawled_at INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
      url TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      ats TEXT,
      priority REAL NOT NULL DEFAULT 0.5,
      last_crawled_at INTEGER,
      last_job_count INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      crawl_interval_minutes INTEGER NOT NULL DEFAULT 360,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      responsibilities TEXT NOT NULL DEFAULT '[]',
      requirements TEXT NOT NULL DEFAULT '[]',
      preferred_qualifications TEXT NOT NULL DEFAULT '[]',
      skills TEXT NOT NULL DEFAULT '[]',
      location_json TEXT NOT NULL DEFAULT '{}',
      employment_type TEXT,
      experience_level TEXT,
      salary_json TEXT,
      posted_at INTEGER,
      expires_at INTEGER,
      source_url TEXT NOT NULL,
      apply_url TEXT NOT NULL,
      canonical_url TEXT,
      source_type TEXT NOT NULL,
      ats TEXT,
      external_job_id TEXT,
      content_hash TEXT NOT NULL,
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      last_verified_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      status TEXT NOT NULL DEFAULT 'active'
    )`,

    `CREATE TABLE IF NOT EXISTS job_snapshots (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      content_hash TEXT NOT NULL,
      snapshot_data TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS job_skills (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      skill TEXT NOT NULL,
      canonical TEXT NOT NULL,
      is_required INTEGER NOT NULL DEFAULT 1
    )`,

    `CREATE TABLE IF NOT EXISTS job_matches (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      overall_score REAL NOT NULL,
      skill_score REAL NOT NULL DEFAULT 0,
      role_score REAL NOT NULL DEFAULT 0,
      experience_score REAL NOT NULL DEFAULT 0,
      location_score REAL NOT NULL DEFAULT 0,
      freshness_score REAL NOT NULL DEFAULT 0,
      source_score REAL NOT NULL DEFAULT 0,
      company_score REAL NOT NULL DEFAULT 0,
      breakdown_json TEXT,
      computed_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
      cache_key TEXT NOT NULL UNIQUE,
      match_score REAL NOT NULL,
      summary TEXT NOT NULL,
      strongest_matches TEXT NOT NULL DEFAULT '[]',
      missing_requirements TEXT NOT NULL DEFAULT '[]',
      concerns TEXT NOT NULL DEFAULT '[]',
      relevant_resume_sections TEXT NOT NULL DEFAULT '[]',
      recommended_keywords TEXT NOT NULL DEFAULT '[]',
      application_priority TEXT NOT NULL DEFAULT 'MEDIUM',
      resume_tailoring_suggestions TEXT NOT NULL DEFAULT '[]',
      raw_response TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      resume_version_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'saved',
      applied_at INTEGER,
      notes TEXT,
      next_action TEXT,
      deadline INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS crawl_runs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      stats_json TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      finished_at INTEGER
    )`,

    `CREATE TABLE IF NOT EXISTS crawl_events (
      id TEXT PRIMARY KEY,
      crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      url TEXT,
      job_id TEXT,
      company_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS crawl_errors (
      id TEXT PRIMARY KEY,
      crawl_run_id TEXT REFERENCES crawl_runs(id) ON DELETE SET NULL,
      url TEXT,
      error_code INTEGER,
      error_message TEXT,
      retries INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS queue_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 5,
      retries INTEGER NOT NULL DEFAULT 0,
      max_retries INTEGER NOT NULL DEFAULT 3,
      scheduled_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000),
      started_at INTEGER,
      finished_at INTEGER,
      error TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      job_id TEXT,
      company_id TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,

    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    )`,
  ];
}

function getIndexDDL(): string[] {
  return [
    `CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_posted_at ON jobs(posted_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_normalized_title ON jobs(normalized_title)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_external_id ON jobs(company_id, external_job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs(content_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_job_matches_job_id ON job_matches(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_job_matches_resume_id ON job_matches(resume_id)`,
    `CREATE INDEX IF NOT EXISTS idx_job_matches_overall ON job_matches(overall_score DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_analyses_cache_key ON ai_analyses(cache_key)`,
    `CREATE INDEX IF NOT EXISTS idx_ai_analyses_job_id ON ai_analyses(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sources_company_id ON sources(company_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status)`,
    `CREATE INDEX IF NOT EXISTS idx_queue_jobs_status_scheduled ON queue_jobs(status, scheduled_at)`,
    `CREATE INDEX IF NOT EXISTS idx_queue_jobs_type ON queue_jobs(type)`,
    `CREATE INDEX IF NOT EXISTS idx_crawl_events_run_id ON crawl_events(crawl_run_id)`,
    `CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)`,
    `CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain)`,
    `CREATE INDEX IF NOT EXISTS idx_job_skills_job_id ON job_skills(job_id)`,
  ];
}
