# Contributing

Thanks for helping improve AgentForge.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev:all
```

## Before you open a pull request

1. Run the typechecks:
   ```bash
   pnpm --filter @agentforge/desktop typecheck
   pnpm --filter @agentforge/server typecheck
   ```
2. For UI or API changes, run the app and exercise the feature. Check it in the light and dark themes.
3. Keep the pull request focused. One change per pull request is easier to review.

## Conventions

- TypeScript with strict settings. Workspace packages use `workspace:*`.
- Backend: one Express router per domain in `apps/server/src/routes`, with logic in `services/` or `crawler/`. Validate input with zod.
- Database: change `packages/database/src/schema.ts`, then run `pnpm db:generate` and `pnpm db:migrate`. Never edit the `.db` file by hand.
- All Gemini calls go through `services/gemini.ts`.
- Frontend: function components, TanStack Query for server data, Zustand for UI state.
- UI: use the shadcn components in `apps/desktop/src/components/ui` and the theme tokens in `index.css`. Do not hardcode colors. Add new components with `npx shadcn@latest add <name>`.
- Use `toast` for outcomes and `confirmDialog` for destructive actions from `@/lib/notify`. Do not use `alert()` or `confirm()`.

## Safety rules

- Never commit `.env`, `*.db` or API keys.
- Auto-apply must stay human-in-the-loop. Do not add silent submission.
- Respect crawler etiquette: prefer ATS APIs over HTML scraping and honor the configured delay.
