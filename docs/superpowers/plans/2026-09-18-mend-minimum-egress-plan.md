# Mend Minimum Egress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Mend's steady-state Supabase egress to at most 12 MB/day (warning budget), with a hard ceiling of 16.7 MB/day and no regression in inbox, run, knowledge, or media workflows.

**Architecture:** Keep Supabase Realtime as the change signal, but stop using it as a trigger for whole-workspace snapshots. Load a small workspace shell once, fetch conversation messages and run details only when selected, reconcile changes with domain-specific loaders, back off idle worker claims/heartbeats, and resolve media URLs only when media enters the viewport or the user opens it. Keep the first release schema-neutral; a production migration is allowed only if an `EXPLAIN (ANALYZE, BUFFERS)` captured during implementation proves a missing index on a bounded query.

**Tech Stack:** TypeScript 5.9, React 19, Vite 7, Supabase JS 2.57/PostgREST/Realtime/Storage, Express 5, Vitest 3, Playwright 1.62, Supabase CLI 2.109+

**Spec:** [`docs/operations/MEND_SUPABASE_EGRESS_INVESTIGATION_2026-09.md`](../../operations/MEND_SUPABASE_EGRESS_INVESTIGATION_2026-09.md)

## Global Constraints

- Confirm `supabase/.temp/project-ref` and `supabase projects list` both identify Mend (`uwhugsimhtjtrnuotuki`) before every linked or production command.
- Do not reintroduce repository article bodies into workspace bootstrap. Preserve commit `b2d6e63`'s boundary.
- Preserve RLS and workspace scoping on every query. Never move `service_role` into the browser.
- Do not add a log drain in this plan; its own egress/cost is not justified on Free.
- Do not add a new UI surface or user-visible copy. Existing loading and error states remain in use, so no i18n additions are expected.
- Do not migrate public media or change cache headers in this plan. First eliminate repeated reads and automatic downloads.
- Treat the following as release gates, not aspirations:
  - healthy idle browser tab: zero PostgREST refreshes over 15 minutes;
  - degraded Realtime: no more than one bounded reconciliation per minute, stop after five failed minutes, and pause while hidden;
  - idle runner at maximum backoff: at most two claims and one heartbeat per minute;
  - initial workspace shell: at most 15 PostgREST requests and 500 KB transferred;
  - no Storage object request before its media is visible or explicitly opened;
  - production Mend egress: target <= 12 MB/day, hard ceiling <= 16.7 MB/day.

---

### Task 1: Make the runner cheap while idle

**Files:**

- Modify: `server/live-worker.ts:303-443`
- Modify: `server/live-worker.test.ts:531-641`
- Modify: `server/index.ts:740-750`
- Modify: `.env.example`
- Modify: `docs/engineering/catalog.md` (runner heartbeat/backoff contract)

**Interfaces:**

- Consumes: `LiveWorkerOptions.pollIntervalMs`, `HeartbeatPort.beat()`, `JobStore.claim()`.
- Produces: adaptive idle delay, rate-limited liveness writes, unchanged immediate job processing.

- [ ] **Step 1: Write failing fake-timer tests for idle backoff and heartbeat throttling.**

  Add cases that prove consecutive empty claims wait `2s -> 4s -> 8s -> 16s -> 30s`, a found job resets the delay to 2 seconds, and idle heartbeats occur no more than once per 60 seconds. Preserve the existing test that heartbeat failures never terminate the loop.

  ```ts
  vi.useFakeTimers();
  worker.start();
  await vi.advanceTimersByTimeAsync(61_000);
  expect(store.claim).toHaveBeenCalledTimes(5); // t=0,2,6,14,30; then 30s
  expect(heartbeat.beat).toHaveBeenCalledTimes(2); // initial + 60s liveness
  ```

- [ ] **Step 2: Run the focused test and confirm it fails for the current one-second loop.**

  Run: `npm test -- server/live-worker.test.ts`

  Expected: FAIL because `LiveWorker` has a fixed delay and writes a heartbeat before every claim.

- [ ] **Step 3: Implement adaptive backoff and due-only heartbeat writes.**

  Add `maxIdlePollIntervalMs` (default `30_000`) and `heartbeatIntervalMs` (default `60_000`) to `LiveWorkerOptions`. Keep immediate beats when a job is claimed and completed; skip the pre-claim write until the interval is due. Reset the idle delay after work or a claim error so recovery remains prompt. Add <=10% jitter in production but inject the delay function/random source in tests so assertions remain deterministic.

  ```ts
  const nextIdleDelay = (current: number, base: number, max: number) =>
    Math.min(current === 0 ? base : current * 2, max);
  ```

- [ ] **Step 4: Wire deployment controls without changing the job contract.**

  Read `MEND_WORKER_POLL_MS` as the base (set production to `2000`), add `MEND_WORKER_MAX_IDLE_POLL_MS=30000` and `MEND_RUNNER_HEARTBEAT_MS=60000`, and document them in `.env.example`. Do not change `claim_next_job`, lease duration, retry state, or queue schema.

- [ ] **Step 5: Verify and commit the runner slice.**

  Run: `npm test -- server/live-worker.test.ts && npm run typecheck`

  Expected: PASS. In a 10-minute local idle run, <= 22 claims and <= 11 heartbeat writes.

  Commit: `git commit -am "perf: back off idle runner traffic"`

---

### Task 2: Replace the whole-workspace payload with a bounded shell

**Files:**

- Modify: `src/api/live-actions.ts:25-430`
- Modify: `src/api/live-actions.test.ts`
- Modify: `src/api/live-mappers.ts:41-49,236-300`
- Modify: `src/types.ts:90-119`
- Modify: `src/App.tsx:420-469`
- Modify: `src/features/inbox/api.ts`
- Modify: `src/features/inbox/pages/InboxPage.tsx`
- Modify: `src/features/inbox/pages/InboxPage.test.tsx`

**Interfaces:**

- Consumes: workspace id and selected conversation id.
- Produces: `WorkspaceShell` with summaries only; `ConversationPage` with newest 50 messages and a cursor for older messages.

- [ ] **Step 1: Write contract tests that reject broad or unbounded reads.**

  Introduce a query-recorder fake client. Assert the shell never calls `messages.select("*")`, never loads `agent_run_events` or `bug_case_events`, uses explicit column lists, caps conversations/issues/runs, and keeps repository bodies absent. Assert the conversation page filters by both workspace and conversation, orders newest-first for pagination, and requests exactly 50 rows.

  ```ts
  expect(recordedQuery("messages")).toMatchObject({
    filters: { workspace_id: "workspace-1", conversation_id: "conversation-1" },
    limit: 50,
  });
  expect(recordedQuery("knowledge_articles").columns).not.toContain("body");
  ```

- [ ] **Step 2: Run the focused contracts and confirm the current bootstrap fails.**

  Run: `npm test -- src/api/live-actions.test.ts src/features/inbox/pages/InboxPage.test.tsx`

  Expected: FAIL because `loadLiveWorkspace` currently selects every message/event and signs every media path.

- [ ] **Step 3: Split `loadLiveWorkspace` into shell and detail loaders.**

  Rename the bounded entry point to `loadLiveWorkspaceShell`. Use explicit columns and these hard limits:
  - conversations: 100, ordered by `last_message_at desc`;
  - issues: 100, ordered by `updated_at desc`;
  - runs: 50, ordered by `created_at desc`;
  - manual knowledge: 100; repository knowledge remains summary-only;
  - active drafts: one latest draft per returned conversation;
  - messages and all event tables: zero rows in the shell.

  Keep contacts scoped to the returned conversation contact ids instead of the whole workspace. Build conversation summaries from `conversations.last_message_at` plus an embedded `messages` projection, ordered by `created_at desc` and limited to one row with Supabase JS's `referencedTable` modifier. The existing foreign key exposes this relationship; cover the exact nested query with the recorder test. Do not add duplicated preview columns or a trigger in phase 1.

- [ ] **Step 4: Paginate only the open conversation.**

  Change `loadLiveConversationSnapshot` to return `{ conversation, nextCursor }`, load the newest 50 messages, reverse them for chronological rendering, and add `loadOlderConversationMessages(workspaceId, conversationId, before, limit=50)`. In `App.tsx`, fetch detail when `selectedConversationId` changes and merge by message id. In `InboxPage`, request the next page when the existing message list reaches its top; keep scroll position stable and reuse the existing loading treatment.

- [ ] **Step 5: Stop signing media during data hydration.**

  Map `mediaAssetId`, `mediaStoragePath`, type, name, and size into the UI model, but leave `attachment.url` absent until Task 4. Remove `hydrateMessageMediaUrls()` from shell and conversation data loaders; keep its cache temporarily for the on-demand legacy fallback.

- [ ] **Step 6: Verify behavior and payload shape.**

  Run: `npm test -- src/api/live-actions.test.ts src/api/live-mappers.test.ts src/features/inbox/pages/InboxPage.test.tsx && npm run typecheck`

  Expected: PASS; opening Inbox loads the shell plus one 50-message page, and scrolling upward loads one additional page without duplicates.

  Commit: `git commit -am "perf: bound workspace and conversation reads"`

---

### Task 3: Reconcile Realtime events by domain instead of rehydrating everything

**Files:**

- Create: `src/app/live-workspace-sync.ts`
- Create: `src/app/live-workspace-sync.test.ts`
- Modify: `src/api/workspace-data.ts:19-163`
- Modify: `src/api/workspace-data.test.ts`
- Modify: `src/api/live-actions.ts`
- Modify: `src/App.tsx:420-581`

**Interfaces:**

- Consumes: Realtime table/row event, last successful sync timestamp, tab visibility, selected conversation/run.
- Produces: a coalesced domain refresh command: `conversation`, `issues`, `runs`, `knowledge`, `channels`, `notifications`, or `bounded-reconcile`.

- [ ] **Step 1: Write a pure routing matrix and failing tests.**

  The planner must route `messages/conversations/conversation_ai_state/ai_drafts` to one conversation refresh; issue tables to issues; run/bug tables to runs; knowledge/repository tables to knowledge; and channel/notification tables to their own loaders. Multiple events for the same key inside 250 ms collapse to one request. A `SUBSCRIBED` status must not synthesize `table="*"`.

  ```ts
  expect(plan({ table: "messages", new: { conversation_id: "c1" } })).toEqual({
    domain: "conversation",
    id: "c1",
  });
  ```

- [ ] **Step 2: Confirm current tests fail because reconnect emits a full refresh.**

  Run: `npm test -- src/api/workspace-data.test.ts src/app/live-workspace-sync.test.ts`

  Expected: FAIL on the synthetic `*` refresh and missing domain coalescing.

- [ ] **Step 3: Add explicit, bounded domain loaders.**

  Add `loadLiveIssues`, `loadLiveRuns`, `loadLiveKnowledgeSummaries`, and `loadLiveChannels` with the same explicit columns/limits as Task 2. For an active or selected run, add `loadLiveRunDetail(runId)` with at most 200 newest run/bug events. Keep every query workspace-scoped.

- [ ] **Step 4: Replace the `hydrate(false)` fallback in `App.tsx`.**

  Use `live-workspace-sync.ts` to serialize writes per domain but allow unrelated domains to refresh independently. On reconnect, run one bounded shell reconciliation, not the old full snapshot. During a Realtime outage, reconcile at 15s, 30s, then 60s; pause while `document.hidden`; stop automatic fallback after five minutes and retain the existing retry/error affordance.

- [ ] **Step 5: Replace active-run whole-workspace polling.**

  Poll only active run rows/details at 15 seconds while visible, increase to 60 seconds after two unchanged results, and stop immediately when no run is queued/running. Realtime remains the primary path.

- [ ] **Step 6: Verify idle and degraded behavior.**

  Run: `npm test -- src/api/workspace-data.test.ts src/app/live-workspace-sync.test.ts src/api/live-actions.test.ts && npm run typecheck`

  Expected: PASS. A fake 15-minute healthy idle session produces zero domain loader calls; 100 burst events for one conversation produce one conversation refresh; a five-minute outage produces no more than seven bounded reconciliations.

  Commit: `git commit -am "perf: reconcile live workspace incrementally"`

---

### Task 4: Make Storage delivery demand-driven

**Files:**

- Create: `src/features/inbox/components/MessageMedia.tsx`
- Create: `src/features/inbox/components/MessageMedia.test.tsx`
- Modify: `src/features/inbox/api.ts`
- Modify: `src/features/inbox/pages/InboxPage.tsx:2750-2845`
- Modify: `src/api/live-actions.ts:45-126`
- Modify: `server/routes/media-routes.ts:54-78`
- Modify: `server/api-router.test.ts:705-760`

**Interfaces:**

- Consumes: message media metadata and visibility/user intent.
- Produces: a short-lived URL for `preview`/`browser`/`original`, cached by asset/path and purpose until one minute before expiry.

- [ ] **Step 1: Write failing component and route tests.**

  Assert that rendering an offscreen media message performs no URL request; intersecting an image requests `preview`; pressing play requests `browser`; opening the lightbox requests `browser`; explicit download requests `original`. Assert duplicate renders share one in-flight promise and one cached URL.

- [ ] **Step 2: Confirm the current eager path fails the contract.**

  Run: `npm test -- src/features/inbox/components/MessageMedia.test.tsx server/api-router.test.ts`

  Expected: FAIL because URLs are currently generated for every hydrated message.

- [ ] **Step 3: Resolve current pipeline assets through the existing media endpoint.**

  Add `getMessageMediaUrl` to `src/features/inbox/api.ts`, backed by `/api/media/assets/:id/url?purpose=...`. Preserve backend workspace authorization and the existing variant preference (`preview`/`browser` before original). Extend the route test to reject a cross-workspace asset.

- [ ] **Step 4: Support legacy paths without eager signing.**

  For messages without `mediaAssetId`, call the existing Supabase signed-URL operation only after visibility or click. Key the cache by `path + purpose`; never put signed URLs in persistent storage or logs.

- [ ] **Step 5: Prevent implicit large transfers.**

  Use `IntersectionObserver` for image previews, `loading="lazy"` for images, and `preload="none"` for audio/video. Do not set `src` until demand. Lightbox navigation preloads at most the adjacent item and always uses the browser-sized variant when present.

- [ ] **Step 6: Verify Storage behavior.**

  Run: `npm test -- src/features/inbox/components/MessageMedia.test.tsx src/features/inbox/pages/InboxPage.test.tsx server/api-router.test.ts && npm run typecheck`

  Expected: PASS; a conversation with 50 media messages makes zero object requests before visibility and no more than one request per visible asset/purpose during the 15-minute cache window.

  Commit: `git commit -am "perf: load private media on demand"`

---

### Task 5: Add the egress regression gate and operations runbook

**Files:**

- Create: `e2e/egress-budget.spec.ts`
- Create: `docs/operations/MEND_EGRESS_ROLLOUT_RUNBOOK.md`
- Modify: `docs/engineering/catalog.md`
- Modify: `docs/operations/MEND_SUPABASE_EGRESS_INVESTIGATION_2026-09.md` (link the implementation/validation outcome only)

**Interfaces:**

- Consumes: browser request log, Supabase CLI inspection snapshots, Dashboard daily usage.
- Produces: repeatable release evidence and explicit rollback thresholds.

- [ ] **Step 1: Add a Playwright request-budget test.**

  Record requests to `*.supabase.co/rest/v1/*` and `*.supabase.co/storage/v1/*`. For one Inbox navigation, opening one conversation, 15 seconds idle, and opening one media item, assert request counts by path and fail on unbounded endpoints. Do not assert compressed byte totals in Playwright because browser transfer accounting/CORS is unreliable; measure bytes in DevTools/Dashboard during rollout.

- [ ] **Step 2: Write the runbook with exact preflight commands.**

  Include:

  ```powershell
  supabase --version
  supabase projects list
  Get-Content supabase/.temp/project-ref
  supabase inspect db calls --linked
  ```

  Require the linked ref to equal `uwhugsimhtjtrnuotuki` before proceeding. Document Dashboard captures for Database Egress, Storage Egress Requests, Top Paths, cache status, and the 24-hour daily total.

- [ ] **Step 3: Define component budgets and stop conditions.**

  Use: Database/Data API <= 7 MB/day, Storage <= 4 MB/day, Realtime/Auth/other <= 1 MB/day, total warning <= 12 MB/day. Stop rollout if any 2-hour projection exceeds 16.7 MB/day, if Inbox misses a message, if a run status is stale for >60 seconds, or if media errors exceed the prior release.

- [ ] **Step 4: Run the complete local gate.**

  Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run i18n:check && npm run format:check`

  Expected: all PASS.

  Commit: `git commit -am "test: enforce Supabase egress budgets"`

---

### Task 6: Roll out to production in reversible slices

**Files:**

- No source changes expected; use the release commits and `docs/operations/MEND_EGRESS_ROLLOUT_RUNBOOK.md`.

**Interfaces:**

- Consumes: immutable deploy revisions and environment settings.
- Produces: measured production releases A, B, and C, or rollback to the immediately previous revision.

- [ ] **Step 1: Capture the production baseline and verify the target.**

  Confirm CLI project ref, record `pg_stat_statements` counters for `claim_next_job` and heartbeat, capture the previous 24-hour Database/Storage totals, and record the current deploy revision. Do not reset statistics.

- [ ] **Step 2: Release A — worker backoff only.**

  Deploy Task 1 with base 2s, max 30s, heartbeat 60s. After 30 minutes, require <= 3 combined claims/heartbeats per minute while idle and verify a test job starts within 30 seconds. Roll back the deploy revision and environment values if either condition fails.

- [ ] **Step 3: Release B — bounded shell plus incremental sync.**

  Deploy Tasks 2–3. Run one normal founder session and one controlled Realtime disconnect. Require shell <= 500 KB, zero healthy-idle PostgREST refreshes, message arrival visible within 5 seconds, active run freshness <= 60 seconds, and no query returning an unbounded message/event collection. Roll back to Release A if any functional gate fails.

- [ ] **Step 4: Release C — demand-driven media.**

  Deploy Task 4. Open text-only and media-heavy conversations. Require no Storage object request for offscreen media, browser/preview variants for inline use, and original only after explicit download. Roll back to Release B if media display/send/transcription regresses.

- [ ] **Step 5: Observe for 72 hours before declaring success.**

  Capture 24-hour totals after each full day. Success requires three consecutive days <= 12 MB/day total, with Database <= 7 MB/day and Storage <= 4 MB/day. At 12–16.7 MB/day, keep the release but investigate the dominant component. Above 16.7 MB/day or on a functional stop condition, roll back the latest slice.

- [ ] **Step 6: Use a migration only on measured proof.**

  If a new bounded query is slow, run `EXPLAIN (ANALYZE, BUFFERS)` read-only and compare it with existing indexes. Only if it shows a sequential scan on the bounded predicate/order, create the migration with `supabase migration new bound_live_workspace_queries`, add the narrow composite index, run local tests/advisors, inspect the SQL, and apply it through the normal production migration workflow. A migration is not a remedy for excess response bytes.

- [ ] **Step 7: Record final evidence.**

  Append actual daily values, request counts, deployed revisions, any rollback, and the final percentage reduction to the investigation report. Do not estimate success from request count alone.

  Commit: `git commit -am "docs: record Mend egress rollout results"`

## Expected Savings (Non-additive)

| Change                                       | Measured component        |                                    Expected reduction |                          Release gate |
| -------------------------------------------- | ------------------------- | ----------------------------------------------------: | ------------------------------------: |
| Bounded shell/detail pagination              | Database baseline         |                                                70–90% | Database <= 10 MB/day after Release B |
| Domain reconciliation + targeted run polling | remaining refresh traffic |                                                80–95% | zero healthy-idle PostgREST refreshes |
| Runner backoff/heartbeat throttle            | 172,800 idle requests/day |                                                97–98% |        <= 4,320 combined requests/day |
| Demand-driven media + variants               | Storage baseline          |                                                70–90% |                   Storage <= 4 MB/day |
| All minimum slices                           | Mend total                | at least 91% of the post-incident 131 MB/day baseline |               <= 12 MB/day for 3 days |

The 10+ GB incident class is separately prevented by the existing omission of repository bodies plus the new bounded-shell contract. Savings overlap and must not be summed.

## Self-review

- Scope covers the two measured egress sources (Database and Storage) and the proven high-frequency runner consumer.
- The plan adds no public endpoint, cache-policy change, storage migration, or broad refactor.
- Every behavior change has a failing test first, a focused verification command, and a rollback boundary.
- There are no `TODO`, `TBD`, placeholder values, invented migration names, or unresolved product choices.
- Production changes are authorized, but schema change remains evidence-gated because it does not directly reduce response bytes.
