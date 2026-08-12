# Mend Architecture Hardening Design

## Objective

Close every material gap identified by the 2026-08-12 architecture audit while
preserving Mend's modular-monolith topology, current production behavior and
product strategy. The finished system must make tenant isolation, BYOK,
retrieval grounding, release recovery and product measurement enforceable and
observable.

## Architectural decisions

1. Mend remains a React/Vite and Express modular monolith backed by
   PostgreSQL/Supabase, with a public control process and a private runner.
2. WhatsApp events bind only through an exact, globally unique provider
   instance identifier. Unknown identifiers are quarantined; they are never
   assigned to an available channel.
3. Every tenant-owned relationship in the operational graph is protected by a
   composite `(id, workspace_id)` foreign key. RLS remains a second independent
   boundary.
4. Production support AI is BYOK-only. Absence of a workspace credential is a
   controlled `awaiting_configuration` outcome, never a global-key fallback.
5. MCP network access validates resolved addresses and every redirect before a
   connection is attempted. Custom MCP can be disabled without affecting the
   official Supabase connector.
6. Code publication, merge and deploy require an admin or owner. Every external
   write has a durable operation intent and a reconciliation path.
7. Knowledge retrieval stays in PostgreSQL. Published articles are divided into
   stable chunks and searched with tenant-scoped lexical ranking plus optional
   vector similarity. Retrieval results carry sources, scores and index/model
   versions.
8. Product metrics are derived from append-only case facts. Percentages always
   include sample size and period; policy-required intervention is distinct
   from avoidable founder intervention.
9. Existing large infrastructure modules are split by domain only after their
   behavior is protected. This is source organization, not service extraction.

## Components and data flow

```text
WhatsApp -> exact webhook binding -> durable jobs -> private runner
                                              |-> support AI (workspace BYOK)
                                              |-> hybrid retrieval (Postgres)
                                              |-> issue / bug case / agent run

React -> Express API -> domain ports -> Supabase adapters -> PostgreSQL
                                  |-> GitHub App / Dokploy operation ledger

PostgreSQL -> workflow facts -> Impact query/API
```

## Data model

- Add global uniqueness for `(provider, provider_instance_name)`.
- Add composite unique keys and foreign keys for channels, contacts,
  conversations, messages, issues, labels, evidence, bug cases, repositories,
  agent runs, artifacts and their association tables.
- Add `webhook_quarantine_events` for authenticated but unmapped provider
  events, with a digest instead of raw customer content.
- Add `knowledge_chunks` with `workspace_id`, `article_id`, `ordinal`,
  `content`, `content_hash`, `search_vector`, optional embedding, and version
  columns.
- Add `external_operations` keyed by workspace, operation type and idempotency
  key. It records intent, uncertain/completed/failed status and sanitized
  provider references.
- Add `workflow_facts` for eligible case, founder touch, policy-required touch,
  human escalation, AI resolution, grounded answer, verified fix and cost.
- Add `runner_heartbeats` so readiness and operations can distinguish configured
  from actively consuming workers.

## Failure behavior

- Unknown WhatsApp binding: return `202`, record a sanitized quarantine fact,
  and do not enqueue message ingestion.
- Missing BYOK: do not call a model; persist an AI configuration-needed state
  and surface a reviewable operator notification.
- Retrieval unavailable or below threshold: policy falls back to human review
  or a directed clarification, never an ungrounded auto-reply.
- External write timeout: mark the operation `uncertain`; reconciliation reads
  provider state before any retry.
- Runner outage: public readiness reports degraded worker state while webhook
  ingestion remains durable.

## Security model

- Authentication proves identity; membership and minimum role authorize each
  workspace action server-side.
- Composite database constraints prevent relationships crossing workspaces even
  through direct Data API writes.
- Support and coding credentials remain encrypted in service-role-only tables.
- MCP URL validation rejects private, loopback, link-local, multicast,
  documentation and unspecified ranges after DNS resolution and redirect.
- Admin/owner approval is mandatory for publish, merge and deploy.

## Verification

- SQL adversarial tests create two tenants and prove cross-tenant references
  fail.
- Webhook tests cover unknown, duplicate and exact instance binding.
- Provider tests prove production never uses a global API key.
- MCP tests use controlled DNS and redirect responses.
- Release tests inject crashes after external effects and prove reconciliation
  prevents duplication.
- Retrieval tests cover tenant filtering, draft exclusion, chunk stability,
  lexical/vector ranking and insufficient-evidence fallback.
- Impact tests use hand-derived fixtures for numerator, denominator, period and
  policy-required cases.
- Full repository gates remain mandatory.

## Rollout and rollback

Use expand/validate/switch/contract migrations. New tables and constraints are
additive; behavior changes use workspace or environment flags where rollback is
operationally necessary. No rollback re-enables guessed tenant binding, silent
global-key fallback or cross-tenant relationships.

## Explicit non-goals

- No microservices, Kafka, Redis or separate vector database.
- No enterprise RBAC expansion.
- No sophisticated analytics dashboard before the facts are trustworthy.
- No broad UI redesign.
