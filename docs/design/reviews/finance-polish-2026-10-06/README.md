# Finance polish — review evidence

The financial overview now turns existing coverage gaps into an attention queue.
Operators can open the coverage review alongside the ledger on wide screens,
or inline on mobile, complete the existing checks and receive a save confirmation.
Missing amounts and estimates now open a server-filtered list covering the
selected month, including records beyond the first page. Cancelled entries and internal transfers are
excluded. Editing a value refreshes the queue after save. Payment evidence still
opens its ledger view; no automatic payment matching is claimed.

The Liquid Glass inspired finish is scoped to the month toolbar and editor header.
Numbers stay on opaque surfaces. Controls use a subtle spring press/release;
skeletons, pending saves and completion have state-driven motion. Reduced motion
disables animation and smooth scrolling; reduced transparency uses solid surfaces.

## Visual evidence

These images use simulated test data, not production financial records.

- [Desktop review, 1440×900 viewport](review-desktop.png)
- [Mobile review, 390×844 viewport](review-mobile.png)
- [Completed review](complete-desktop.png)
- [Portuguese light-theme overview](overview-light-pt.png)
- [Guided missing-amount resolution on desktop](guided-desktop.png)
- [Guided missing-amount resolution on mobile](guided-mobile.png)

Full-page captures can include the fixed mobile shell at its current scroll
position. Viewport sizes above describe the browser, not the tall PNG dimensions.

## Verification

- TypeScript and production build passed.
- 778 unit/integration tests passed with `--maxWorkers=2 --testTimeout=20000`.
  The initial unconstrained run hit Windows subprocess timeouts; no product code
  or test assertion was changed to suppress them.
- Finance/Zelo E2E run after adding guided resolution: **48 passed**, desktop and mobile, one worker.
- Full E2E run: **192 passed, 10 skipped**, desktop and mobile, one worker.
- Final transfer-exclusion adjustment: both guided-resolution E2E cases and both
  Supabase query contract tests passed; TypeScript passed again.
- Keyboard entry, Escape/return focus, review completion, reduced motion,
  narrow layout, stale month, revocation, drafts, conflicts and business separation
  are covered by the financial E2E scenarios.
- i18n checks passed for pt-BR/en-US. Formatting passed. Lint has no errors;
  three pre-existing warnings remain in shared primitives and InboxPage.
- Visual inspection completed on the attached images in dark and light themes.

## Review boundaries

The backend adds an optional validated attention filter on entry reads, applied
in the Supabase query before pagination. No migrations, grants, authentication,
payment execution or dependencies changed. The queue uses `coverageGaps` from
the existing API snapshot. This is not an AI
matching engine, an automatic bank reconciliation, or a new three-section finance
information architecture. The remaining financial workflow stays available.

This is a reviewable first slice. Independent QA and visual acceptance remain
before merge; nothing was deployed. Attaching to the user's Chrome profile was
rejected by automatic approval review because it could expose authenticated
sessions. Verification used isolated automated tests with mocked API data.
