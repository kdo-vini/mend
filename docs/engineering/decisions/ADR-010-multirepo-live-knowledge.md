# ADR-010: Product-scoped live knowledge from multiple repositories

- Status: accepted
- Date: 2026-09-12

## Context

Mend supports workspaces that operate more than one product. At Téchne, the
same inbox receives questions about ZeloPDV, ZeloChat and ZeloMenu, and each
product may be implemented by several repositories. Manual knowledge articles
alone drift as software changes, while indexing the newest commit can describe
behavior that has not reached production.

Support answers therefore need two independent decisions: which products the
conversation concerns, and which repository revisions represent the behavior
currently available to customers. Both decisions must remain workspace-scoped
and auditable.

## Decision

1. A workspace owns a product catalog. Products and repositories have a
   many-to-many relationship; shared repositories may serve several products.
2. Manual articles may be shared or mapped to products. Repository sources are
   always reached through a product/repository mapping.
3. Repository indexing executes asynchronously in the existing durable worker.
   GitHub events enqueue exact-SHA jobs and never perform extraction inline.
4. Repository code is treated as untrusted input. Extraction is read-only,
   bounded by allowlists and size limits, and excludes secrets, dependencies,
   generated output, binaries and customer exports.
5. `observed_sha`, `indexed_sha` and `active_sha` are separate. Automatic
   customer replies may use repository evidence only when the indexed revision
   equals the active production revision and that sync completed successfully.
6. Product resolution precedes retrieval. Ambiguous product selection blocks
   auto-send and produces a clarification draft or human review.
7. Retrieval combines published manual knowledge and deterministic repository
   extracts using the existing PostgreSQL full-text and pgvector index. It is
   bounded per repository to prevent one codebase from crowding out the rest.
8. Customer replies receive opaque evidence keys and customer-safe facts. File
   paths, symbols and other implementation details remain in the operator trace.
9. Optional deep repository research uses isolated, read-only checkouts and can
   only create a reviewed draft until evaluation policy explicitly permits more.

## Consequences

- Knowledge follows released product behavior without requiring a second
  service, event bus or vector database.
- A failed or partial sync preserves the last complete revision.
- Operators can inspect why an answer was produced, including product, source,
  revision and immutable evidence snapshot.
- Workspaces must configure product mappings and an activation policy before
  repository evidence can participate in replies.
- Embedding cost scales with changed content rather than polling frequency or
  support-message volume.

## Rejected alternatives

- Giving the response model unrestricted repository or shell access for every
  customer message.
- Treating the default branch head as proof of production deployment.
- Maintaining one vector index or microservice per product.
- Hard-coding Téchne product names or repository IDs in retrieval logic.
- Replacing reviewed manual policies with generated repository prose.
