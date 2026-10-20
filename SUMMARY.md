# Huntly — Feature & File Summary

AI-powered Job Intelligence OS. pnpm monorepo: Express + SQLite (Drizzle) backend, React + Vite frontend, Gemini for AI, Playwright for crawling. Give this file to an AI along with `AGENT.md` when asking it to design a new feature.

Paths are relative to the repo root. Frontend = `apps/desktop/src`, backend = `apps/server/src`.

## Repo layout

| Path | Role |
|---|---|
| `apps/server` | Express API (port 7842), crawlers, AI services, auto-applier |
| `apps/desktop` | React 18 + Vite UI (port 1420, proxies `/api` to 7842) |
| `packages/database` | Drizzle schema (`src/schema.ts`), client, migrate script |
| `packages/shared` | Shared types, zod schemas, constants (match weights, ATS names) |

Frontend navigation is a Zustand tab (`store/useStore.ts` → `currentTab`), switched in `App.tsx`. No router.

## Features

### 1. Dashboard
- UI: `views/DashboardView.tsx`
- API: `routes/analytics.ts` (`GET /api/analytics/overview`)

### 2. Jobs feed & matching
Browse crawled jobs with filters, match scores, closed/already-applied exclusion toggle.
- UI: `views/JobsView.tsx` (largest file), `views/JobDetailModal.tsx`, `components/common/{ScoreRing,Badge}.tsx`
- API: `routes/jobs.ts` (`GET /api/jobs`, `GET /api/jobs/:id`)
- Logic: `services/job-matcher.ts` (weighted score using `DEFAULT_MATCH_WEIGHTS` in `packages/shared/src/constants`), `utils/normalize.ts`
- Tables: `jobs`, `job_skills`, `job_matches`, `job_snapshots`

### 3. Agent job search (AI)
Natural-language job search; AI expands filters then searches.
- API: `routes/ai.ts` (`POST /api/ai/expand-filters`, `POST /api/ai/agent-search`)
- Logic: `services/agent-job-search.ts`

### 4. Discovery & crawling
Find companies/jobs from the web and ATS APIs; live progress over SSE.
- UI: `views/DiscoveryView.tsx`
- API: `routes/crawl.ts` — `/runs`, `/events`, `/events/stream` (SSE), `/stats`, `/start`, `/linkedin`, `/twitter`, `/yc`, `/hn`, `/discover`, `/career-page`, `/deep-search`, `/probe`
- API: `routes/companies.ts`, `routes/sources.ts` (CRUD for companies and crawl sources)
- Orchestration: `workers/orchestrator.ts` (SQLite-backed queue, `queue_jobs`)
- Crawler (`crawler/`):
  - Engine: `playwright-engine.ts` (browser mgmt), `playwright-crawler.ts` (main extraction pipeline)
  - Extraction, in priority order: `ats-adapters.ts` (Greenhouse/Lever/Ashby APIs), `network-interceptor.ts` (captured XHR/JSON), `embedded-data.ts` (Next/Nuxt state), `extractor.ts` (JSON-LD + HTML), `dynamic-extractor.ts` (scroll, pagination, iframes, self-healing selectors)
  - Discovery: `career-discovery.ts`, `page-classifier.ts`, `query-generator.ts`, `search-provider.ts` (Serper / SerpAPI / Brave)
  - Social: `linkedin-scraper.ts`, `social-yc-scraper.ts` (X, YC, HN; extracts salary/equity/batch)
  - Persistence/health: `job-processor.ts` (dedupe, close detection), `endpoint-store.ts` (learned API endpoints → `endpoint-store.json`), `source-health.ts`
- Tables: `companies`, `sources`, `crawl_runs`, `crawl_events`, `crawl_errors`, `queue_jobs`

### 5. Applications tracker
Kanban/board of applications by status.
- UI: `views/ApplicationsView.tsx`
- API: `routes/applications.ts` (`GET /`, `GET /board`, `POST /`, `PATCH /:id`)
- Table: `applications`

### 6. Auto-apply (Autopilot)
Filter jobs, click "Auto-Apply all (N)", and a background queue applies to each one in a Playwright browser. A job is marked applied only after the site shows a confirmation, and is never applied to twice.
- UI: `components/autoapply/AutoApplyLauncher.tsx` (start dialog, one-time profile + resume PDF setup), `components/autoapply/AutoApplyDock.tsx` (floating live queue, mounted in `App.tsx`; retry, answer missing fields, mark applied), `components/AutoApplyModal.tsx` (single-job flow from the job detail), button in `views/JobsView.tsx`; board badge in `views/ApplicationsView.tsx`
- API: `routes/auto-apply.ts` — `/queue` (GET list, POST enqueue), `/queue/preview`, `/queue/pause|resume|cancel-queued|clear-failed`, `/queue/:id/retry|mark-applied`, `DELETE /queue/:id`, `/config` (GET/PUT), `/readiness`, `/resume-pdf` (POST raw PDF, DELETE), plus `/profile`, `/memory`, `/` (single run), `/confirm`, `/batch` (alias of enqueue), `/screenshot/:filename`
- Queue: `crawler/auto-applier/queue.ts` (sequential worker, daily cap, delay, one auto-retry, crash recovery), `applied-index.ts` (duplicate check by job id, apply URL, or company + title), `config.ts` (mode, headless, dailyCap, delayMs, maxPerRun in settings key `autoApplyConfig`), `resume-file.ts` (uploaded PDF stored beside the SQLite file)
- Engine: `crawler/auto-applier/{engine,form-analyzer,ats-detector,ai-answer-generator,linkedin,types}.ts`. One persistent Chromium profile (logins survive). Reads the form DOM, fills known fields from the profile, answers the rest with the LLM using the resume text, and asks the LLM which button to click when the page is not a form yet. Handles iframes, radio groups, react-select comboboxes, typeaheads, multi-step forms, consent boxes, LinkedIn Easy Apply (dialog scope) and LinkedIn external Apply redirects. Outcomes: `submitted` (only after a confirmation), `needs_review` (unfillable required field, captcha, unconfirmed submit), `needs_login` (site or LinkedIn needs sign-in; config `onLogin` = skip and list it, or wait with a visible browser; the item's "Sign in & run" button does the same on demand), `skipped` (closed job, no apply button). Skipped and needs-login items stay in the queue list and can be re-run one by one or all at once.
- Modes: `tabs` (default) fills each job in a tab of one shared visible Chromium window and leaves it open; the user clicks Submit and the agent detects the confirmation, records it and closes the tab (`browser-session.ts`, `engine.ts#watchTab`, queue status `open`, `tabBatch` limits open tabs). `auto_submit` submits by itself. `review` fills, screenshots and closes.
- Models: `services/gemini.ts` fails over between Gemini models on quota errors.
- Tables: `apply_queue` (UNIQUE job_id), `applications` (UNIQUE job_id)

### 7. Resume Studio
Upload LaTeX resumes, parse, tailor to a job with AI, compile to PDF, generate cover letters and outreach drafts.
- UI: `views/ResumeStudioView.tsx`
- API: `routes/resumes.ts` (list, active, upload, delete, activate, download-active, compile); `routes/ai.ts` (`/analyze`, `/tailor-resume`, `/download-pdf`, `/compile-resume`, `/generate-cover-letter`, `/outreach-draft`)
- Logic: `services/resume-parser.ts` (regex LaTeX parser), `services/latex-compiler.ts`; LaTeX packages in `apps/server/assets/tex/`
- Tables: `resumes`, `resume_skills`, `ai_analyses`

### 8. Tech Radar
AI-scanned news/trend feed with featured breaking-news scroller; cards link straight to sources (no deep-dive modal in the UI).
- UI: `views/TechRadarView.tsx`
- API: `routes/intel.ts` (`GET /feed`, `POST /refresh`, `POST /deep-dive`)
- Logic: `services/ai-intel-scanner.ts`

### 9. Analytics
- UI: `views/AnalyticsView.tsx`
- API: `routes/analytics.ts` (`/overview`, `/skills`, `/companies`, `/applications/timeline`)

### 10. Settings, LLM config, notifications
- UI: `views/SettingsView.tsx`, `components/layout/Header.tsx` (notifications drawer)
- API: `routes/settings.ts` (`/`, `/gemini-key`, `/llm`, `/test-llm`), `routes/notifications.ts`
- Logic: `services/gemini.ts` (`GeminiClient`, exported as `LLMClient`)
- Tables: `settings`, `notifications`, `users`

### 11. App shell
- `App.tsx`, `main.tsx`, `index.css` (design tokens as CSS variables mapped onto shadcn semantic colors, paper grain, motion)
- `components/layout/{Sidebar,Header}.tsx` (shadcn Sidebar, theme picker, notifications sheet), `components/common/{CommandPalette,ConfirmHost,Logo}.tsx`, `components/ui/` (shadcn), `lib/notify.ts` (toast + confirmDialog)
- `lib/api.ts` (fetch client), `store/useStore.ts` (Zustand), `types.ts`

## Database tables (`packages/database/src/schema.ts`)
`users`, `resumes`, `resume_skills`, `companies`, `sources`, `jobs`, `job_snapshots`, `job_skills`, `job_matches`, `ai_analyses`, `applications`, `apply_queue`, `crawl_runs`, `crawl_events`, `crawl_errors`, `queue_jobs`, `notifications`, `settings`.

## API mounts (`apps/server/src/index.ts`)
`/health`, `/api/{jobs,companies,sources,resumes,applications,crawl,analytics,settings,notifications,ai,intel,auto-apply}`

## Environment (`.env`)
`GEMINI_API_KEY`, `GEMINI_MODEL`, `SEARCH_PROVIDER` (+ `SERPER_API_KEY` / `SERPAPI_KEY` / `BRAVE_SEARCH_API_KEY`), `DATABASE_PATH`, `SERVER_PORT`, `SERVER_HOST`, `CRAWLER_CONCURRENCY`, `CRAWLER_REQUEST_DELAY_MS`, `CRAWLER_TIMEOUT_MS`, `PLAYWRIGHT_HEADLESS`.

## Adding a feature: where things go
1. Table change → `packages/database/src/schema.ts`, then `pnpm db:generate` / `pnpm db:migrate`.
2. Shared types/zod → `packages/shared/src`.
3. Route → new file in `apps/server/src/routes/`, mount in `apps/server/src/index.ts`; heavy logic in `services/`.
4. UI → new view in `apps/desktop/src/views/`, add the tab to `store/useStore.ts`, `App.tsx` switch, `Sidebar.tsx` (and `CommandPalette.tsx` if searchable); API calls via `lib/api.ts`.
