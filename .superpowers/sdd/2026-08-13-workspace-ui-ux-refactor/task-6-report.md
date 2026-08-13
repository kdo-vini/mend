# Task 6 report — Settings taxonomy and routes

## Status

Implemented and verified on `codex/workspace-ui-refactor`.

Implementation commit: `606936b753048088731ffeda52a73d88036d85e6`

## RED

- `npm test -- src/features/settings/settings-navigation.test.ts`
  - Failed as expected: 7 failures and 1 pass.
  - The old 13-item taxonomy remained, nested canonical routes resolved to
    Overview, and `legacySettingsRoute` did not exist.
- `npx playwright test e2e/settings.spec.ts`
  - Failed as expected: 8 failures and 4 passes.
  - `Agents & models` and the canonical options/routes were absent, and the old
    coding-connections URL did not redirect.

## GREEN

- Focused navigation unit test: 9/9 passed.
- Focused Settings E2E: 14/14 passed across desktop and mobile.
- Full Vitest suite: 64 files, 349 tests passed.
- Full Playwright suite: 106 passed, 4 expected project-specific skips.
- `npm run i18n:check`: passed; both locales at 100% parity and frontend guard
  passed.
- `npm run typecheck`: passed.
- `npm run lint`: exited 0; two pre-existing Fast Refresh warnings remain in
  `src/components/ui/badge.tsx` and `src/components/ui/button.tsx`.
- `npm run build`: passed.
- Prettier check for every changed implementation/test file: passed.
- `git diff --check`: passed.

## Files changed

- `src/features/settings/settings-navigation.ts`
- `src/features/settings/settings-navigation.test.ts`
- `src/features/settings/components/SettingsLayout.tsx`
- `src/features/settings/pages/SettingsWorkspacePage.tsx`
- `src/features/settings/pages/SettingsAutomationPage.tsx`
- `src/features/settings/pages/SettingsIntegrationPages.tsx`
- `src/i18n/locales/en-US/settings.json`
- `src/i18n/locales/pt-BR/settings.json`
- `src/styles/features/settings.css`
- `e2e/settings.spec.ts`

## Decisions

- The public Settings navigation is exactly four groups and eight semantic
  items. Provider-level GitHub, Google, and MCP pages remain reachable as
  integration detail routes but are not sidebar or mobile-selector items.
- Each item owns a canonical `path` and a `matchPrefix`. Active selection uses
  the longest segment-boundary prefix and treats only exact `/settings` (plus
  its trailing-slash equivalent) as Overview.
- The four implementation-shaped legacy paths are exact lookup keys. Canonical
  paths are not keys, so redirects cannot loop. The original `search` string is
  appended unchanged, preserving `demo` and all other query parameters.
- Legacy `tab` values remain supported and now resolve directly to canonical
  destinations while retaining unrelated query parameters.
- The mobile selector uses the canonical item path, preserves the current
  query, and uses the shared 44px touch-target token.
- `layout.groups` and `layout.items` contain only the public taxonomy. GitHub
  and MCP titles still used inside integration content moved to semantic
  `v2.integrations.*Title` keys.

## Task 7 handoff

- `/settings/automation/replies` temporarily renders the existing AI behavior
  body.
- `/settings/automation/intake` temporarily renders the existing support-flow
  body.
- `/settings/engineering/agents/providers` temporarily renders the existing
  coding-connections body.
- `/settings/engineering/agents/run-policy` temporarily renders the existing
  coding-routing body.
- No Task 7 content redesign was performed.

## Review and concerns

- Five-axis self-review (correctness, readability, architecture, security, and
  performance) found no required changes and no dead code introduced by this
  task.
- Repository-wide `npm run format:check` still reports six pre-existing SDD
  brief files (`task-1-brief.md` through `task-6-brief.md`) that are outside
  this task and intentionally were not reformatted. All changed code, locale,
  CSS, and test files pass Prettier.
