# ADR-009: Tenant-safe automation and recoverable external effects

- Status: accepted
- Date: 2026-08-12

## Context

Mend's WhatsApp, AI and coding loops cross several trust and transaction
boundaries. RLS alone did not prevent service-role code from linking records
from different workspaces, a global OpenAI key could silently fund support
work, and GitHub/Dokploy effects could outlive a failed database checkpoint.

## Decision

Mend remains a PostgreSQL-backed modular monolith and adopts these invariants:

1. Provider instances bind exactly once and globally; unknown webhook
   instances produce digest-only quarantine records.
2. Tenant-owned relationships use composite `(resource_id, workspace_id)`
   foreign keys in addition to RLS and explicit query predicates.
3. Support completion, transcription and embeddings resolve an encrypted,
   workspace-owned API key and explicit task models. There is no process-wide
   support credential fallback.
4. Published knowledge is indexed into stable PostgreSQL chunks and queried
   with lexical plus vector scores. Results retain article/version citations;
   drafts cannot enter the retrieval function.
5. MCP connections resolve all DNS answers before use, reject non-public
   networks and do not follow unvalidated redirects.
6. Approve, publish, merge and deploy require admin or owner. External writes
   persist an intent and reconcile provider state before retry.
7. Append-only workflow facts are the source for Impact metrics. Founder
   intervention and policy-required human touch are distinct. Runner
   heartbeats participate in readiness.
8. Supabase implementations are owned by business-focused modules under
   `server/adapters/supabase/`; worker integrations are owned under
   `server/workers/`. The legacy entrypoints remain small composition and
   compatibility facades, preserving one deployable modular monolith.

## Consequences

- Migrations stop on existing cross-workspace or duplicate-provider data;
  operators repair that data rather than weaken the constraint.
- A workspace without complete support BYOK configuration pauses automation
  with an actionable notification and consumes no Mend-funded tokens.
- Retrieval can remain lexical during an embedding backfill, but automatic
  answers stay subject to the evidence threshold and workspace policy.
- The operation ledger makes non-transactional provider retries recoverable
  without adding a distributed queue or service.
- Domain changes can be reviewed and tested without navigating the complete
  persistence or worker implementation. Existing imports and runtime assembly
  remain backward-compatible.

## Rejected alternatives

- A separate vector database, event bus or microservice topology.
- Application-only tenant checks.
- Blind retries after timed-out external writes.
- Counting mandatory approval as founder intervention.
