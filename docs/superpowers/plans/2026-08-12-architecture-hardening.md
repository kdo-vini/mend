# Mend Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the audited Mend architecture production-safe and strategy-complete for tenant isolation, BYOK support AI, hybrid retrieval, safe integrations, recoverable release operations and product measurement.

**Architecture:** Preserve the modular monolith and PostgreSQL job worker. Add database-enforced invariants and append-only operational records, then route existing domain adapters through focused reusable boundaries.

**Tech Stack:** TypeScript 5.9, Express 5, React 19, Vitest, Playwright, Supabase/PostgreSQL 17, pgvector/FTS, Zod.

## Global Constraints

- Preserve all pre-existing user changes in the dirty worktree.
- Use Supabase CLI first for all database work.
- Production support AI is BYOK-only and never returns stored secrets.
- Every tenant-owned query and relationship is workspace-scoped.
- External writes require deterministic authorization, idempotency, audit and reconciliation.
- Do not add microservices, Redis, Kafka or a separate vector database.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Exact WhatsApp tenant binding

**Files:**

- Modify: `supabase/functions/whats-mend-webhook/index.ts`
- Modify: `server/live-worker.ts`
- Test: `server/live-worker.test.ts`
- Create: `supabase/migrations/20260812xxxxxx_architecture_hardening.sql`
- Test: `supabase/tests/architecture_hardening_test.sql`

**Interfaces:**

- Produce `resolveExactChannelBinding(client, instanceName)` semantics: zero or
  one exact binding, never fallback.
- Produce global unique `(provider, provider_instance_name)` database invariant.

- [x] Write regression tests proving an unknown instance cannot produce a
      workspace-scoped ingestion job and duplicate bindings are rejected.
- [x] Run focused tests and confirm the old fallback makes them fail.
- [x] Remove the open-channel fallback, store only a sanitized quarantine digest
      and add the global uniqueness constraint.
- [x] Run focused TypeScript and SQL tests until green.

### Task 2: Composite tenant relational integrity

**Files:**

- Modify: `supabase/migrations/20260812xxxxxx_architecture_hardening.sql`
- Test: `supabase/tests/architecture_hardening_test.sql`
- Modify: `server/supabase-security.test.ts`

**Interfaces:**

- Every child relation uses `FOREIGN KEY (<resource>_id, workspace_id)
REFERENCES <parent>(id, workspace_id)`.

- [x] Add adversarial two-workspace SQL cases for inbox, issue and agent graphs.
- [x] Run `supabase test db` and observe cross-tenant inserts succeed or lack the
      required constraint.
- [x] Add composite unique keys and `NOT VALID` foreign keys, validate them, and
      retain compatible legacy keys for rollout.
- [x] Regenerate database types and rerun SQL/security tests.

### Task 3: BYOK-only support AI and workspace-scoped legacy routes

**Files:**

- Modify: `server/providers.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/index.ts`
- Modify: `server/contracts/api-ports.ts`
- Modify: `server/supabase-api-adapters.ts`
- Test: `server/providers.test.ts`
- Test: `server/live-worker.test.ts`
- Test: `server/index.test.ts`

**Interfaces:**

- Add `SupportAiConfigurationError` with code
  `support_ai_credential_required`.
- Add `resolveSupportAiProvider(workspaceId): Promise<SupportAiProvider>` that
  requires a workspace-owned support connection and selected model.

- [x] Write tests proving no global key is used in production and `/api/ai/*`
      requires membership plus workspace scope.
- [x] Run focused tests and confirm failure.
- [x] Replace global fallbacks with the resolver and controlled
      configuration-needed outcomes.
- [x] Run focused tests and verify secrets remain absent from responses/events.

### Task 4: DNS-safe MCP networking and admin release gates

**Files:**

- Modify: `server/mcp.ts`
- Modify: `server/supabase-api-adapters.ts`
- Modify: `server/routes/coding-run-routes.ts`
- Test: `server/mcp.test.ts`
- Test: `server/api-router.test.ts`

**Interfaces:**

- Add `resolvePublicNetworkTarget(url, lookup): Promise<URL>` and
  `safeExternalFetch(url, options)` with bounded redirects.
- `approve`, `publish`, `merge`, `deploy` require role `admin`; investigate and
  cancel remain available to `agent`.

- [x] Write tests for DNS-to-loopback, link-local, redirect-to-private and agent
      release denial.
- [x] Run focused tests and confirm failure.
- [x] Implement resolved-address validation and stricter route roles.
- [x] Run focused tests until green.

### Task 5: Recoverable GitHub merge and Dokploy deployment

**Files:**

- Create: `server/external-operations.ts`
- Modify: `server/codex-service.ts`
- Modify: `server/deployment.ts`
- Modify: `server/contracts/api-ports.ts`
- Modify: `server/supabase-api-adapters.ts`
- Modify: `supabase/migrations/20260812xxxxxx_architecture_hardening.sql`
- Test: `server/codex-service.test.ts`
- Test: `server/deployment.test.ts`

**Interfaces:**

- `ExternalOperationPort.begin/get/complete/fail/markUncertain` keyed by
  `(workspaceId, kind, idempotencyKey)`.
- `CodexDeploymentPort.reconcile(input)` returns the known deployment or null.

- [x] Write crash-injection tests for merge and deploy where the provider effect
      happened but the run checkpoint did not.
- [x] Run tests and confirm duplicate effects occur or cannot be reconciled.
- [x] Persist operation intent before effects and reconcile before retries.
- [x] Run tests proving exactly one provider mutation.

### Task 6: Tenant-scoped hybrid knowledge retrieval

**Files:**

- Create: `server/knowledge-retrieval.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/providers.ts`
- Modify: `server/supabase-api-adapters.ts`
- Modify: `supabase/migrations/20260812xxxxxx_architecture_hardening.sql`
- Test: `server/knowledge-retrieval.test.ts`
- Test: `server/live-worker.test.ts`
- Test: `supabase/tests/architecture_hardening_test.sql`

**Interfaces:**

- `KnowledgeRetriever.retrieve({workspaceId, query, limit})` returns
  `{chunks, sufficient, indexVersion}` with citations and lexical/vector scores.
- `KnowledgeIndexer.syncPublishedArticle(article)` creates stable semantic
  chunks and removes chunks for drafts/deletes.

- [x] Write tests for deterministic chunking, draft exclusion, tenant filters,
      hybrid ordering, citations and insufficient evidence.
- [x] Run focused tests and confirm the current article loader fails them.
- [x] Add pgvector/FTS schema, hybrid RPC, indexer and worker integration.
- [x] Backfill published articles and run retrieval tests/evals.

### Task 7: Workflow facts, Impact API and runner readiness

**Files:**

- Create: `server/impact.ts`
- Create: `server/routes/impact-routes.ts`
- Modify: `server/contracts/api-ports.ts`
- Modify: `server/api-router.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/index.ts`
- Modify: `server/supabase-api-adapters.ts`
- Modify: `supabase/migrations/20260812xxxxxx_architecture_hardening.sql`
- Test: `server/impact.test.ts`
- Test: `server/api-router.test.ts`
- Test: `server/index.test.ts`

**Interfaces:**

- Append `WorkflowFact` values for eligibility, interventions, escalation,
  grounding, AI resolution, verified fix and cost.
- `ImpactPort.summary(context, {from,to})` returns rates with numerator,
  denominator, sample size and exact period.
- Runner heartbeat includes `workerId`, `lastSeenAt`, `currentJobType` and
  optional job id.

- [x] Write hand-derived metric and stale-heartbeat tests.
- [x] Run focused tests and confirm no current data/API satisfies them.
- [x] Implement append-only facts, aggregation API and readiness heartbeat.
- [x] Run focused tests and verify policy-required touches are excluded from the
      founder-free denominator penalty.

### Task 8: Domain-focused source split, ADRs and complete verification

**Files:**

- Create: `server/adapters/supabase/*.ts` as domain-owned adapter modules
- Create: `server/workers/*.ts` as focused worker processors
- Modify: `server/supabase-api-adapters.ts` to compatibility exports/composition
- Modify: `server/live-worker.ts` to compatibility exports/composition
- Modify: `docs/engineering/catalog.md`
- Create: `docs/engineering/decisions/ADR-009-architecture-hardening.md`
- Modify: `docs/engineering/decisions/README.md`

**Interfaces:**

- Preserve every public adapter and worker export used by routes/tests.
- No behavior change during source movement.

- [x] Move one domain at a time and run its existing tests after each move.
- [x] Update catalog and ADR with the final reusable boundaries and invariants.
- [x] Run Supabase migration/lint/tests, unit tests, E2E, i18n, typecheck, lint,
      format, build and dependency audit.
- [x] Review the complete audit requirement matrix against current files and
      runtime evidence; leave no item supported only by inference.
