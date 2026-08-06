# Repository Guidelines

## Project Structure & Module Organization

This repository is a TypeScript React/Vite SaaS with an Express backend.

- `src/app/`: application shell, navigation, routing, and onboarding.
- `src/features/`: feature verticals such as `inbox`, `issues`, `knowledge`, `runs`, and `settings`.
- `src/shared/`: reusable UI, formatting, and cross-feature utilities.
- `server/`: Express bootstrap, services, persistence adapters, workers, and domain routes in `server/routes/`.
- `e2e/`: Playwright browser scenarios; `*.test.ts` files beside source cover unit/server behavior.
- `public/`, `supabase/`, `docs/`: static assets, database configuration, and supporting documentation.

Keep feature-specific API calls inside that feature’s `api.ts`; shared UI must not import backend adapters directly. Consult `DESIGN.md` before changing visual patterns.
Before adding a helper, adapter, integration or authorization flow, consult `docs/engineering/catalog.md` and update its catalog when the behavior is reusable.

Every feature that involves UI must read `DESIGN.md` before implementation and follow its design patterns, tokens, accessibility rules, and review checklist. New confirmation flows must use the shared app-native confirmation pattern documented there.

## Build, Test, and Development Commands

Run `npm install` first, then use:

- `npm run dev` — start the Vite development client.
- `npm run server` — run the Express server with `.env`.
- `npm run build` — clean TypeScript outputs and create the production client build.
- `npm run typecheck` — run both TypeScript project checks.
- `npm run lint` — run ESLint across the repository.
- `npm test` — run Vitest once; use `npm run test:watch` while developing.
- `npm run test:e2e` — run Playwright desktop and mobile scenarios.
- `npm run format:check` or `npm run format` — verify or apply Prettier formatting.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and Prettier formatting. Components and pages use PascalCase (`IssuesPage.tsx`); hooks use `useX`; utilities and API modules use camelCase or lowercase descriptive names. Prefer small domain modules and explicit ports/adapters over new cross-cutting abstractions.

## Testing Guidelines

Name unit tests `*.test.ts` and E2E tests `*.spec.ts`. Add regression coverage for changed behavior, run focused tests during development, then run `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, and `npm run format:check` before submitting.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects such as `feat:`, `fix:`, and `refactor:`. Pull requests should explain the behavior and architecture impact, list validation commands, link the relevant issue, and include screenshots or recordings for UI changes. Keep unrelated refactors out of feature PRs.

## Security & Configuration

Copy `.env.example` to `.env` for local configuration and never commit secrets. Validate auth, workspace scoping, rate limits, and Supabase access when changing server routes. Use the Supabase CLI for database-related work and include migrations in `supabase/`.
