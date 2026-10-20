# AGENT.md — Guide for AI coding agents

Read `SUMMARY.md` first for the feature/file map. This file covers how to work in the repo.

## Setup

Requirements: Node >= 20 (works on 24), pnpm >= 9.

```bash
pnpm install
cp .env.example .env     # then fill GEMINI_API_KEY and a search provider key
pnpm db:migrate          # creates agentforge.db (path from DATABASE_PATH)
pnpm dev:all             # server (7842) + UI (1420)
```

Open http://localhost:1420. Optional: `pnpm seed` for demo data; `npx playwright install chromium` for crawling, auto-apply and.

## Commands

| Task | Command |
|---|---|
| Server only | `pnpm dev:server` |
| UI only | `pnpm dev` |
| Typecheck | `pnpm --filter @agentforge/server typecheck` and `pnpm --filter @agentforge/desktop typecheck` |
| Build all | `pnpm build:all` |
| DB schema → SQL | `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio` |

There is no test suite or linter configured yet. Typecheck is the verification gate; for UI/API changes also run the app and exercise the feature.

## Conventions

- TypeScript, ESM (`"type": "module"`), strict via `tsconfig.base.json`. Workspace deps use `workspace:*`.
- Backend: one Express router per domain in `routes/`, mounted under `/api/<name>` in `index.ts`. Validate input with zod; shared schemas go in `packages/shared`. Keep routes thin, put logic in `services/` or `crawler/`.
- DB: Drizzle + better-sqlite3 (synchronous). Change `schema.ts`, then generate and migrate. Never hand-edit the `.db` file.
- AI: all Gemini calls go through `services/gemini.ts` (`LLMClient`). Don't instantiate the SDK elsewhere.
- Frontend: function components + hooks, TanStack Query for server data, Zustand for UI state, no router (tab switch in `App.tsx`). UI is shadcn/ui (`components/ui`, add with `npx shadcn@latest add`) on Tailwind v4. Colors come only from the tokens in `index.css`; never hardcode hex. Use `toast` / `confirmDialog` from `@/lib/notify` instead of `alert()` / `confirm()`.
- Match the surrounding file's style, comment density and naming. Don't add dependencies without need.

## Rules and gotchas

- Never commit `.env`, `*.db`, or API keys. `.env` is gitignored; edit `.env.example` for new variables.
- `better-sqlite3` must be v12+ for Node 24 (v11 has no prebuilt binary and the machine has no C++ toolchain).
- Crawler etiquette: respect `CRAWLER_CONCURRENCY` / `CRAWLER_REQUEST_DELAY_MS`; prefer ATS APIs (`ats-adapters.ts`) over HTML scraping.
- Auto-apply must stay human-in-the-loop: it fills the form and waits for `/confirm` before submitting. Don't add silent submission.
- Auto-generated screenshots/artifacts and `endpoint-store.json` are runtime output, not source.
- Large files to be careful with (edit narrowly, don't rewrite): `views/JobsView.tsx` (~2k lines), `components/AutoApplyModal.tsx`.

## Workflow for a new feature

1. Locate the closest existing feature in `SUMMARY.md` and read its files.
2. Plan the slice end-to-end: table → shared types → route/service → API client → view → navigation.
3. Implement in that order; typecheck both apps after each layer.
4. Run the app and verify the feature works in the UI, not just that it compiles.
5. Update `SUMMARY.md` (add the feature, files and endpoints) so the map stays accurate.
6. Commit only when asked; small, focused commits with conventional prefixes (`feat(scope):`, `fix(ui):`, `refactor(...)`).
