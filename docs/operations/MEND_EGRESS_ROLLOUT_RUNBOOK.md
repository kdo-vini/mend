# Mend Supabase egress rollout runbook

Use this runbook for the minimum egress release described in
[`2026-09-18-mend-minimum-egress-plan.md`](../superpowers/plans/2026-09-18-mend-minimum-egress-plan.md).

## Budgets

| Component                | Daily target |
| ------------------------ | -----------: |
| Database / Data API      |      <= 7 MB |
| Storage                  |      <= 4 MB |
| Realtime, Auth and other |      <= 1 MB |
| Mend warning total       |     <= 12 MB |
| Mend hard ceiling        |      16.7 MB |

The organization reserves 4.25 GB/month for ZeloPDV and 0.25 GB/month as
operational margin. Mend receives at most 0.50 GB/month.

## Mandatory Supabase preflight

Run from the repository root before every linked command:

```powershell
supabase --version
supabase projects list
Get-Content supabase/.temp/project-ref
```

Continue only when the linked project is `mend` and both outputs show the ref
`uwhugsimhtjtrnuotuki`. ZeloPDV (`xnnjyrblpvsqrtsshawa`) must show
`linked: false`.

Capture, without resetting statistics:

```powershell
supabase inspect db calls --linked
```

Record the counters for `claim_next_job` and the `runner_heartbeats` upsert,
the current Git SHA, and the current Dokploy deployment ids.

No migration is part of the minimum release. If a bounded query is slow, first
capture `EXPLAIN (ANALYZE, BUFFERS)`. A migration is allowed only when that
evidence shows a missing narrow index; create its file with
`supabase migration new bound_live_workspace_queries`, run advisors, review
the SQL, and then use the normal migration workflow.

## Local release gate

```powershell
npm run typecheck
npm run lint
npm test -- --run
npm run test:e2e
npm run i18n:check
npm run format:check
npm run build
```

For the authenticated request-budget test, provide a temporary Playwright
storage-state file outside the repository:

```powershell
$env:MEND_EGRESS_TEST_BASE_URL='https://app.techneia.com.br'
$env:MEND_EGRESS_STORAGE_STATE='C:\secure\mend-playwright-state.json'
npx playwright test e2e/egress-budget.spec.ts --project=desktop
```

Never commit the storage-state file.

## Production releases

Deploy the exact immutable Git SHA to both Dokploy services.

### Release A — runner

Set on `mend-agent-runner`:

```text
MEND_WORKER_POLL_MS=2000
MEND_WORKER_MAX_IDLE_POLL_MS=30000
MEND_RUNNER_HEARTBEAT_MS=60000
```

After the runner has been idle for five minutes, compare the database call
counters over ten minutes. Require at most two claims and one heartbeat per
minute. Enqueue one normal test job and require claim latency <= 30 seconds.

Rollback: restore the prior runner deployment and prior environment values.

### Release B — bounded live workspace

Deploy the control plane with bounded bootstrap, conversation pagination and
coalesced reconciliation. Verify:

- initial `/inbox` produces <= 15 Data API requests;
- the shell transfers <= 500 KB in browser Network tooling;
- a healthy idle tab produces zero PostgREST requests over 15 minutes;
- a new inbound message appears within five seconds;
- an active run refreshes within 60 seconds;
- a controlled Realtime interruption uses 15/30/60-second reconciliation and
  stops after five minutes.

Rollback: redeploy Release A's control-plane SHA. Do not revert commit
`b2d6e63`, which keeps repository article bodies out of bootstrap.

### Release C — demand-driven media

Open a media-heavy conversation and verify in browser Network tooling:

- no Storage request occurs for offscreen media;
- visible images request `preview` and inline video/audio use `preload=none`;
- a document requests `original` only after an explicit click;
- repeated rendering reuses the same signed URL during its 15-minute window;
- media send, transcription and lightbox behavior remain functional.

Rollback: redeploy Release B's control-plane SHA.

## Immediate stop conditions

Rollback the latest slice when any condition occurs:

- a two-hour projection exceeds 16.7 MB/day;
- Inbox misses or duplicates a persisted message;
- active run state remains stale for more than 60 seconds;
- media error rate exceeds the previous release;
- `/api/health` or `/api/ready` is not healthy.

## Observation

For three consecutive complete days, capture Supabase Dashboard values for:

- Database Egress;
- Storage Egress Requests and Top Cache Misses;
- API Gateway Top Paths;
- Realtime and Auth;
- total Mend cached and uncached egress.

Success requires Mend <= 12 MB/day, Database <= 7 MB/day and Storage <= 4
MB/day for all three days. Between 12 and 16.7 MB/day, retain the release and
investigate the dominant component. Do not infer byte savings from request
counts alone.
