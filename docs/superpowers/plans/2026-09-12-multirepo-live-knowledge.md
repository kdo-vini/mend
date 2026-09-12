# Mend Multirepo Live Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mend continuously learn the currently deployed behavior of every product in a workspace from multiple repositories, existing knowledge articles and approved read-only runtime sources, while producing concise customer-facing answers with traceable evidence and no cross-product or cross-tenant leakage.

**Architecture:** Preserve the modular monolith, Supabase/PostgreSQL job queue and existing hybrid RAG. Add a workspace-owned product catalog, many-to-many product/repository mappings, versioned repository knowledge sources and an active-release gate. GitHub events enqueue incremental indexing; the support worker resolves one or more products for each message, retrieves only current evidence for those products plus shared knowledge, and passes a bounded evidence bundle to the existing support provider for customer-facing rendering.

**Tech Stack:** TypeScript 5.9, Express 5, React 19, Vitest, Playwright, Supabase/PostgreSQL 17, pgvector, PostgreSQL full-text search, Zod, GitHub App API, existing durable `jobs` worker.

**Spec:** `docs/product/MEND_PRODUCT_STRATEGY_V1.md`, especially sections 5, 6.2, 6.3, 8 and 9.

## Global Constraints

- Support multiple products and multiple repositories per product; a repository may support more than one product.
- The first Techne product catalog is `ZeloPDV`, `ZeloChat` and `ZeloMenu`; names and repository IDs remain workspace configuration, never hard-coded domain rules.
- Manual articles remain supported. An article with no product mapping is shared across the workspace; an article with product mappings is eligible only for those products.
- Only `published` knowledge is eligible for support answers. Machine-generated prose remains `draft` until reviewed; deterministic extracts from an active repository revision may be marked `published` with trust level `deterministic`.
- Indexing a commit and activating a commit are separate operations. Auto-replies must never describe unshipped code as current product behavior.
- A repository-derived chunk is current only when its `source_revision` equals the source's `active_sha` and the most recent sync for that SHA completed successfully.
- Repository content, customer messages and tool output are untrusted data. They cannot override system policy or authorize actions.
- Never index `.env*`, credentials, private keys, build output, dependency directories, generated bundles, binary files, customer exports or files above the configured size limit.
- Repository access is read-only and uses the existing `GitHubControlPlane` installation-token boundary. Tokens never enter prompts, the browser or persisted job payloads.
- All product, repository, source, article, chunk, conversation-context and evidence relationships are workspace-scoped and protected by composite foreign keys plus RLS.
- Retrieval may combine several repositories only after resolving the associated product or products. Ambiguous product routing blocks automatic sending and produces a clarification draft or human escalation.
- The customer reply must use the workspace language and tone, avoid internal file paths and implementation jargon, and make only claims linked to retrieved evidence.
- Keep one control-plane API and one existing runner. Do not add Redis, Kafka, a second vector database or a dedicated indexing microservice.
- Use Supabase CLI first for schema changes, type generation and SQL verification.
- Follow red-green-refactor. Each task ends with focused tests and a separate Conventional Commit.
- Before deployment run `npm run typecheck`, `npm test -- --run`, `npm run lint`, `npm run format:check`, `npm run i18n:check`, `npm run i18n:frontend`, `npm run build`, `supabase test db` and the relevant Playwright scenarios.

---

## Product and knowledge model

```text
Workspace
  ├── Product: ZeloPDV
  │     ├── Repository A: application/backend
  │     ├── Repository B: web client
  │     └── Product-specific manual articles
  ├── Product: ZeloChat
  │     ├── Repository C: application
  │     ├── Repository B: shared web client
  │     └── Product-specific manual articles
  ├── Product: ZeloMenu
  │     ├── Repository D: storefront
  │     ├── Repository A: shared catalog API
  │     └── Product-specific manual articles
  └── Shared articles: company tone, billing rules, escalation policy
```

```text
GitHub push/default-branch observation
  -> authenticated webhook
  -> deduplicated repository-knowledge job
  -> exact-SHA archive
  -> safe file inventory
  -> deterministic extraction and content hashes
  -> embeddings only for changed chunks
  -> atomic source revision promotion

Successful production release proof
  -> source.active_sha = released SHA
  -> source becomes current when indexed_sha = active_sha

Customer message
  -> product resolver
  -> current product repositories + product articles + shared articles
  -> hybrid retrieval
  -> evidence bundle with citations and confidence
  -> policy gate
  -> customer-facing reply renderer
  -> draft/auto-reply plus immutable evidence snapshot
```

## Planned file map

### New files

- `supabase/migrations/20260912090000_multirepo_live_knowledge.sql` — product catalog, repository/source mappings, source revisions, conversation product context, evidence snapshots, constraints, indexes and RLS.
- `supabase/tests/multirepo_live_knowledge_test.sql` — cross-workspace, cross-product, active-revision and RLS regression coverage.
- `server/knowledge-products.ts` — product resolution contracts and deterministic alias/retrieval-score rules.
- `server/knowledge-source-extractor.ts` — safe repository inventory, allowlist/exclusion policy and deterministic source-document extraction.
- `server/knowledge-source-indexer.ts` — exact-SHA checkout orchestration, incremental article/chunk replacement and source revision promotion.
- `server/knowledge-sync.ts` — sync job payloads, source state machine and service-level orchestration.
- `server/github-knowledge-webhook.ts` — signed GitHub event parsing, repository lookup and idempotent job enqueueing.
- `server/routes/knowledge-source-routes.ts` — product/source mapping, sync and active-revision endpoints.
- `server/workers/knowledge-sync.ts` — runner adapter that executes `mend.knowledge.repository_sync` jobs.
- `server/support-evidence.ts` — bounded evidence bundle, customer-facing validation and persisted citation DTOs.
- `server/knowledge-products.test.ts`
- `server/knowledge-source-extractor.test.ts`
- `server/knowledge-source-indexer.test.ts`
- `server/knowledge-sync.test.ts`
- `server/github-knowledge-webhook.test.ts`
- `server/support-evidence.test.ts`
- `src/features/knowledge/components/KnowledgeProductBar.tsx` — product/shared filtering and conversation-independent product labels.
- `src/features/knowledge/components/KnowledgeSourcesPanel.tsx` — repository mappings, revision state, sync action and freshness explanation.
- `src/features/knowledge/components/KnowledgeProductDialog.tsx` — create/edit/archive product metadata and aliases.
- `docs/engineering/decisions/ADR-010-multirepo-live-knowledge.md` — source-of-truth, freshness and customer-facing evidence decision.
- `docs/engineering/multirepo-knowledge-operations.md` — GitHub/Dokploy configuration, backfill, failure recovery and rollback runbook.

### Existing files to modify

- `server/knowledge-service.ts` — article product mappings and source-safe write rules.
- `server/knowledge-retrieval.ts` — product-aware search contract and richer evidence results.
- `server/workers/knowledge.ts` — current-revision, multi-product retrieval.
- `server/automation/decision.ts` — structured evidence context and ambiguity behavior.
- `server/workers/automation.ts` — product resolution, evidence persistence and customer-facing gate.
- `server/providers.ts` — grounded customer-reply contract and structured provider output.
- `server/live-worker.ts` — knowledge sync job dispatch and message product context.
- `server/workers/live-worker-shared.ts` — new durable job type constants.
- `server/contracts/api-ports.ts` — product, knowledge source and sync ports.
- `server/adapters/supabase/knowledge.ts` — product/source CRUD, version-safe indexing and current retrieval.
- `server/adapters/supabase/repositories.ts` — exact repository/source lookup for GitHub events.
- `server/adapters/supabase-mappers.ts` — sanitized product/source/article mappings.
- `server/supabase-api-adapters.ts` — compose new adapters without direct route/database coupling.
- `server/api-router.ts` — register knowledge source routes and exempt only the signed GitHub webhook path from bearer authentication.
- `server/index.ts` — preserve raw GitHub body before JSON parsing and compose the sync worker.
- `server/github-control-plane.ts` — reuse `verifyGitHubWebhookSignature`, `getBranchSha` and `checkoutRepositoryArchive`; add no second GitHub client.
- `server/api-router.test.ts`, `server/live-worker.test.ts`, `server/providers.test.ts` — API, routing and reply regressions.
- `src/types.ts` — sanitized product/source/article DTOs.
- `src/api/live-actions.ts` — authenticated product/source/sync API calls.
- `src/api/live-mappers.ts` — map source metadata without exposing internal errors or repository tokens.
- `src/features/knowledge/api.ts` — feature-level product/source operations.
- `src/features/knowledge/pages/KnowledgeWorkspacePage.tsx` — multirepo knowledge workspace.
- `src/features/knowledge/components/KnowledgeCollection.tsx` — source, product and freshness metadata.
- `src/i18n/locales/pt-BR/knowledge.json`, `src/i18n/locales/en-US/knowledge.json` — bilingual copy.
- `e2e/knowledge-refactor.spec.ts` — multirepo configuration and responsive UI coverage.
- `src/lib/database.types.ts` — regenerate from the linked Supabase schema after migration.
- `docs/engineering/catalog.md` — register the source indexer, product resolver and evidence bundle.
- `docs/engineering/decisions/README.md` — add ADR-010.
- `.env.example` — document GitHub webhook secret and bounded indexing configuration.

---

### Task 1: Record the architecture decision and invariants

**Files:**

- Create: `docs/engineering/decisions/ADR-010-multirepo-live-knowledge.md`
- Modify: `docs/engineering/decisions/README.md`
- Modify: `docs/engineering/catalog.md`

**Interfaces:**

- Defines `support_products` as the workspace product catalog.
- Defines many-to-many product/repository and article/product relationships.
- Defines `active_sha` as the only repository revision eligible to describe current behavior in automatic customer replies.
- Defines manual reviewed, deterministic repository and generated draft trust levels.

- [ ] **Step 1: Write ADR-010 with the accepted decision**

Use this exact decision statement:

```markdown
## Decisão

Mend stores support products separately from repositories. Products and
repositories have a many-to-many workspace-scoped relationship. Manual and
repository-derived knowledge share the existing article/chunk retrieval path,
but every derived item records its source repository, path and revision.

Repository indexing follows observed commits, while customer-facing freshness
follows an independently recorded active production revision. Automatic
customer replies may use a repository-derived item only when the item revision
equals the active revision and the source sync completed successfully. Shared
manual articles remain eligible without a product mapping.

Repository content is internal evidence. The support provider receives a
bounded evidence bundle and returns customer-facing prose; it never receives a
whole repository and never exposes paths, symbols, secrets or implementation
details unless the customer supplied and needs that exact technical term.
```

- [ ] **Step 2: Document rejected alternatives**

Record these alternatives and reasons:

```markdown
- Sending every repository to the model per message: stale, expensive and too broad.
- Treating one repository as one product: fails for shared clients/backends and future monorepos.
- Indexing only the latest default-branch commit: can describe code that is not deployed.
- Replacing manual articles: loses reviewed policies, prices, tone and escalation rules.
- Creating a separate indexing service: unnecessary while the existing durable runner can process bounded jobs.
```

- [ ] **Step 3: Register the ADR and planned reusable boundaries**

Add ADR-010 to `docs/engineering/decisions/README.md`. Add catalog entries for `KnowledgeSourceIndexer`, `resolveSupportProducts` and `buildSupportEvidenceBundle`, including the rule that no route or React component accesses source tables directly.

- [ ] **Step 4: Validate documentation formatting**

Run:

```bash
npx prettier --check docs/engineering/decisions/ADR-010-multirepo-live-knowledge.md docs/engineering/decisions/README.md docs/engineering/catalog.md
```

Expected: all three files pass.

- [ ] **Step 5: Commit**

```bash
git add docs/engineering/decisions/ADR-010-multirepo-live-knowledge.md docs/engineering/decisions/README.md docs/engineering/catalog.md
git commit -m "docs: define multirepo live knowledge architecture"
```

---

### Task 2: Add the workspace-safe multirepo data model

**Files:**

- Create: `supabase/migrations/20260912090000_multirepo_live_knowledge.sql`
- Create: `supabase/tests/multirepo_live_knowledge_test.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**

- Produces tables `support_products`, `support_product_repositories`, `knowledge_sources`, `knowledge_sync_runs` and `conversation_product_context`.
- Extends `knowledge_articles` with source/trust metadata and creates `knowledge_article_products`.
- Creates `ai_draft_evidence` for immutable article and deep-research evidence while preserving `ai_draft_knowledge` as the article-level compatibility link.

- [ ] **Step 1: Write failing SQL tests for the required invariants**

Cover these exact cases in `supabase/tests/multirepo_live_knowledge_test.sql`:

```sql
select plan(16);

-- Same product key is allowed in different workspaces and rejected twice in one workspace.
-- A product cannot link to a repository from another workspace.
-- A knowledge source cannot reference a repository from another workspace.
-- A knowledge article cannot map to a product from another workspace.
-- A conversation cannot receive product context from another workspace.
-- Only one primary product context may exist per conversation.
-- Source SHAs reject malformed values.
-- Machine-managed articles require source_id, source_path and source_revision.
-- Authenticated members can read their workspace products and sources.
-- Authenticated members cannot read another workspace products or sources.
-- Only service_role can write sync runs and machine-managed article fields.
-- Shared articles have zero rows in knowledge_article_products.
-- Product-specific articles can map to more than one product.
-- Deleting a repository removes source/mapping records but preserves manual articles.
-- Draft evidence cannot link a draft, product, article or chunk from another workspace.
-- Article evidence requires article/chunk IDs while repository-research evidence rejects them.

select * from finish();
```

- [ ] **Step 2: Run the SQL test and confirm the schema is missing**

Run:

```bash
supabase test db supabase/tests/multirepo_live_knowledge_test.sql
```

Expected: FAIL because `support_products` does not exist.

- [ ] **Step 3: Create the tables and article metadata**

Implement the following columns and checks in the migration:

```sql
create table public.support_products (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_key text not null check (product_key ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  aliases text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, product_key),
  unique (id, workspace_id)
);

create table public.support_product_repositories (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id uuid not null,
  repository_id uuid not null,
  repository_role text not null default 'primary'
    check (repository_role in ('primary', 'frontend', 'backend', 'mobile', 'docs', 'shared')),
  knowledge_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, repository_id),
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade,
  foreign key (repository_id, workspace_id)
    references public.repositories(id, workspace_id) on delete cascade
);

create table public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  repository_id uuid not null,
  source_type text not null default 'github_repository'
    check (source_type = 'github_repository'),
  ref_name text not null check (char_length(btrim(ref_name)) between 1 and 255),
  include_patterns jsonb not null default '["README.md","docs/**/*.md","docs/**/*.mdx","openapi*.json","src/i18n/locales/**/*.json"]'::jsonb,
  exclude_patterns jsonb not null default '["**/.env*","**/node_modules/**","**/dist/**","**/build/**","**/coverage/**","**/*.pem","**/*.key","**/*.p12","**/*.sqlite","**/*.db","**/secrets/**"]'::jsonb,
  sync_mode text not null default 'event' check (sync_mode in ('event', 'manual', 'paused')),
  observed_sha text,
  indexed_sha text,
  active_sha text,
  active_sha_source text check (active_sha_source in ('manual', 'github_deployment', 'dokploy', 'follow_ref')),
  sync_state text not null default 'idle'
    check (sync_state in ('idle', 'queued', 'running', 'ready', 'stale', 'failed')),
  last_error_code text,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, repository_id),
  unique (id, workspace_id),
  foreign key (repository_id, workspace_id)
    references public.repositories(id, workspace_id) on delete cascade,
  check (observed_sha is null or observed_sha ~ '^[a-f0-9]{40,64}$'),
  check (indexed_sha is null or indexed_sha ~ '^[a-f0-9]{40,64}$'),
  check (active_sha is null or active_sha ~ '^[a-f0-9]{40,64}$')
);

create table public.knowledge_sync_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_id uuid not null,
  requested_sha text not null check (requested_sha ~ '^[a-f0-9]{40,64}$'),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'superseded')),
  files_scanned integer not null default 0 check (files_scanned >= 0),
  files_indexed integer not null default 0 check (files_indexed >= 0),
  files_skipped integer not null default 0 check (files_skipped >= 0),
  chunks_written integer not null default 0 check (chunks_written >= 0),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, requested_sha),
  foreign key (source_id, workspace_id)
    references public.knowledge_sources(id, workspace_id) on delete cascade
);
```

Add `source_id`, `source_path`, `source_revision`, `managed_by_sync`, `trust_level`, `audience` and `source_metadata_json` to `knowledge_articles`. Use these checks:

```sql
alter table public.knowledge_articles
  add column source_id uuid,
  add column source_path text,
  add column source_revision text,
  add column managed_by_sync boolean not null default false,
  add column trust_level text not null default 'reviewed'
    check (trust_level in ('reviewed', 'deterministic', 'generated')),
  add column audience text not null default 'customer'
    check (audience in ('customer', 'internal')),
  add column source_metadata_json jsonb not null default '{}'::jsonb;

alter table public.knowledge_articles
  add constraint knowledge_articles_source_workspace_fkey
  foreign key (source_id, workspace_id)
  references public.knowledge_sources(id, workspace_id) on delete cascade;

alter table public.knowledge_articles
  add constraint knowledge_articles_managed_source_check check (
    managed_by_sync = false or (
      source_id is not null and
      nullif(btrim(source_path), '') is not null and
      source_revision ~ '^[a-f0-9]{40,64}$'
    )
  );

create unique index knowledge_articles_source_path_uidx
  on public.knowledge_articles(source_id, source_path)
  where managed_by_sync = true;
```

Create `knowledge_article_products` and `conversation_product_context` with composite workspace foreign keys:

```sql
create table public.knowledge_article_products (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  article_id uuid not null,
  product_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (article_id, product_id),
  foreign key (article_id, workspace_id)
    references public.knowledge_articles(id, workspace_id) on delete cascade,
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade
);

create table public.conversation_product_context (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  conversation_id uuid not null,
  product_id uuid not null,
  is_primary boolean not null default false,
  confidence real not null check (confidence between 0 and 1),
  resolution_source text not null
    check (resolution_source in ('manual', 'explicit_name', 'alias', 'retrieval')),
  last_message_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (conversation_id, product_id),
  foreign key (conversation_id, workspace_id)
    references public.conversations(id, workspace_id) on delete cascade,
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id) on delete cascade,
  foreign key (last_message_id, workspace_id)
    references public.messages(id, workspace_id) on delete set null
);

create unique index conversation_product_context_primary_uidx
  on public.conversation_product_context(conversation_id)
  where is_primary = true;
```

- [ ] **Step 4: Add immutable evidence snapshots without overloading article links**

Keep `ai_draft_knowledge` unchanged for existing article-level UI compatibility. Create a generic evidence table because bounded repository research can produce cited facts without creating a knowledge article:

```sql
create unique index knowledge_chunks_id_workspace_uidx
  on public.knowledge_chunks(id, workspace_id);

create table public.ai_draft_evidence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  draft_id uuid not null,
  evidence_key text not null check (evidence_key ~ '^[a-z][a-z0-9_-]{1,31}:[a-zA-Z0-9:_-]{1,180}$'),
  source_kind text not null check (source_kind in ('manual', 'repository', 'repository_research')),
  knowledge_article_id uuid,
  knowledge_chunk_id uuid,
  product_id uuid,
  article_version text,
  source_revision text,
  source_path text,
  retrieval_score real check (retrieval_score is null or retrieval_score between 0 and 1),
  evidence_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (draft_id, evidence_key),
  foreign key (draft_id, workspace_id)
    references public.ai_drafts(id, workspace_id) on delete cascade,
  foreign key (knowledge_article_id, workspace_id)
    references public.knowledge_articles(id, workspace_id),
  foreign key (knowledge_chunk_id, workspace_id)
    references public.knowledge_chunks(id, workspace_id),
  foreign key (product_id, workspace_id)
    references public.support_products(id, workspace_id),
  check (
    (source_kind in ('manual', 'repository') and knowledge_article_id is not null and knowledge_chunk_id is not null)
    or (source_kind = 'repository_research' and knowledge_article_id is null and knowledge_chunk_id is null)
  )
);

create index ai_draft_evidence_article_idx
  on public.ai_draft_evidence(knowledge_article_id)
  where knowledge_article_id is not null;
create index ai_draft_evidence_product_idx
  on public.ai_draft_evidence(workspace_id, product_id)
  where product_id is not null;
```

- [ ] **Step 5: Add RLS and role grants**

Grant authenticated users workspace-scoped read access to products, mappings, sources, completed sync metadata and `ai_draft_evidence`. Restrict writes to products/mappings/source configuration to workspace admins through API routes. Keep `knowledge_sync_runs`, machine-managed article columns and evidence snapshots service-role writable only.

- [ ] **Step 6: Apply locally, run SQL tests and regenerate types**

Run:

```bash
supabase db reset
supabase test db
supabase gen types typescript --local > src/lib/database.types.ts
```

Expected: all SQL tests pass and generated types include the new tables/columns.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260912090000_multirepo_live_knowledge.sql supabase/tests/multirepo_live_knowledge_test.sql src/lib/database.types.ts
git commit -m "feat: add workspace-safe multirepo knowledge schema"
```

---

### Task 3: Define product, source and evidence domain contracts

**Files:**

- Create: `server/knowledge-products.ts`
- Create: `server/knowledge-sync.ts`
- Create: `server/support-evidence.ts`
- Modify: `server/knowledge-service.ts`
- Modify: `server/knowledge-retrieval.ts`
- Modify: `server/contracts/api-ports.ts`
- Test: `server/knowledge-products.test.ts`
- Test: `server/knowledge-sync.test.ts`
- Test: `server/support-evidence.test.ts`

**Interfaces:**

```ts
export interface SupportProduct {
  id: string;
  workspaceId: string;
  key: string;
  name: string;
  description: string;
  aliases: readonly string[];
  status: "active" | "archived";
}

export interface KnowledgeSource {
  id: string;
  workspaceId: string;
  repositoryId: string;
  refName: string;
  syncMode: "event" | "manual" | "paused";
  observedSha?: string;
  indexedSha?: string;
  activeSha?: string;
  syncState: "idle" | "queued" | "running" | "ready" | "stale" | "failed";
}

export interface ProductResolution {
  productIds: readonly string[];
  primaryProductId?: string;
  confidence: number;
  source: "manual" | "conversation" | "alias" | "retrieval" | "shared";
  ambiguous: boolean;
}

export interface SupportKnowledgeEvidence {
  evidenceKey: string;
  articleId?: string;
  chunkId?: string;
  articleVersion?: string;
  productIds: readonly string[];
  sourceKind: "manual" | "repository" | "repository_research";
  sourceRevision?: string;
  sourcePath?: string;
  title: string;
  heading: string;
  content: string;
  trustLevel: "reviewed" | "deterministic" | "generated";
  audience: "customer" | "internal";
  score: number;
}

export interface SupportEvidenceBundle {
  resolution: ProductResolution;
  evidence: readonly SupportKnowledgeEvidence[];
  sufficient: boolean;
  stale: boolean;
  citations: readonly string[];
}
```

- [ ] **Step 1: Write failing domain tests**

Test exact behavior:

```ts
it("resolves every explicitly named product without choosing an unrelated primary", () => {
  const result = resolveSupportProducts("Uso o ZeloPDV e o ZeloMenu", products);
  expect(result.productIds).toEqual([pdv.id, menu.id]);
  expect(result.ambiguous).toBe(false);
});

it("does not resolve the generic word zelo to all products", () => {
  const result = resolveSupportProducts("meu Zelo não abriu", products);
  expect(result.productIds).toEqual([]);
  expect(result.ambiguous).toBe(true);
});

it("rejects stale repository evidence from an automatic reply bundle", () => {
  const bundle = buildSupportEvidenceBundle({
    resolution,
    candidates: [
      repositoryEvidence({
        sourceRevision: "a".repeat(40),
        activeSha: "b".repeat(40),
      }),
    ],
    mode: "safe_auto",
  });
  expect(bundle.sufficient).toBe(false);
  expect(bundle.stale).toBe(true);
});
```

- [ ] **Step 2: Run tests and confirm missing contracts**

Run:

```bash
npm test -- --run server/knowledge-products.test.ts server/knowledge-sync.test.ts server/support-evidence.test.ts
```

Expected: FAIL because the new modules do not exist.

- [ ] **Step 3: Implement schemas and ports**

Add strict Zod schemas for product keys, aliases, repository roles, sync commands and active revisions. Add these ports to `server/contracts/api-ports.ts`:

```ts
export interface KnowledgeProductPort {
  list(context: RequestContext): Promise<readonly SupportProduct[]>;
  create(
    context: RequestContext,
    input: SupportProductInput,
  ): Promise<SupportProduct>;
  update(
    context: RequestContext,
    productId: string,
    input: SupportProductPatch,
  ): Promise<SupportProduct | null>;
  replaceRepositories(
    context: RequestContext,
    productId: string,
    links: readonly ProductRepositoryLinkInput[],
  ): Promise<readonly ProductRepositoryLink[]>;
}

export interface KnowledgeSourcePort {
  list(context: RequestContext): Promise<readonly KnowledgeSource[]>;
  ensureForRepository(
    context: RequestContext,
    input: KnowledgeSourceInput,
  ): Promise<KnowledgeSource>;
  requestSync(
    context: RequestContext,
    sourceId: string,
    requestedSha?: string,
  ): Promise<KnowledgeSyncRun>;
  activateRevision(
    context: RequestContext,
    sourceId: string,
    sha: string,
    source: ActiveShaSource,
  ): Promise<KnowledgeSource>;
}

export interface ConversationProductPort {
  get(
    workspaceId: string,
    conversationId: string,
  ): Promise<readonly ConversationProductContext[]>;
  replace(input: ReplaceConversationProductContextInput): Promise<void>;
}
```

Keep GitHub fetch/checkout out of these ports; it remains behind `GitHubControlPlane`.

- [ ] **Step 4: Extend article schemas safely**

Allow user-created articles to accept `productIds: string[]` and `audience`. Reject `sourceId`, `sourceRevision`, `managedBySync` and `trustLevel` from public create/patch bodies so users cannot impersonate deterministic repository evidence.

- [ ] **Step 5: Implement evidence bounding**

`buildSupportEvidenceBundle` must:

- discard cross-product candidates unless they are shared manual articles;
- discard generated evidence in `safe_auto` mode;
- discard repository evidence with missing or mismatched active revision;
- deduplicate identical `contentHash` values;
- cap at 12 chunks, 4 chunks per repository and 24,000 total characters;
- report `stale=true` when relevant candidates existed but none matched the active revision;
- create stable citation keys shaped as `k:<articleId>:<articleVersion>:<chunkId>`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-products.test.ts server/knowledge-sync.test.ts server/support-evidence.test.ts server/knowledge-retrieval.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/knowledge-products.ts server/knowledge-sync.ts server/support-evidence.ts server/knowledge-service.ts server/knowledge-retrieval.ts server/contracts/api-ports.ts server/knowledge-products.test.ts server/knowledge-sync.test.ts server/support-evidence.test.ts
git commit -m "feat: define multirepo knowledge domain contracts"
```

---

### Task 4: Implement Supabase product and source adapters

**Files:**

- Modify: `server/adapters/supabase/knowledge.ts`
- Modify: `server/adapters/supabase/repositories.ts`
- Modify: `server/adapters/supabase-mappers.ts`
- Modify: `server/supabase-api-adapters.ts`
- Test: `server/supabase-api-adapters.test.ts`
- Test: `server/supabase-security.test.ts`

**Interfaces:**

- Consumes `KnowledgeProductPort`, `KnowledgeSourcePort` and `ConversationProductPort` from Task 3.
- Produces `SupabaseKnowledgeProductAdapter`, `SupabaseKnowledgeSourceAdapter` and `SupabaseConversationProductAdapter`.
- Adds `findByGitHubRepository(installationId, owner, repo)` to the privileged repository lookup boundary.

- [ ] **Step 1: Write failing adapter tests**

Cover:

- product list/create/update always includes `.eq("workspace_id", context.workspaceId)`;
- replacing repository links rejects cross-workspace rows through the composite FK;
- article product mappings are replaced only after article write succeeds;
- source list returns sanitized SHAs/status and no GitHub token;
- sync request creates one `knowledge_sync_runs` row and one deduplicated job;
- activation rejects a SHA that has no completed sync run;
- GitHub repository lookup requires installation ID, owner and repo.

- [ ] **Step 2: Run tests and observe missing adapters**

Run:

```bash
npm test -- --run server/supabase-api-adapters.test.ts server/supabase-security.test.ts
```

Expected: FAIL on missing adapter exports and missing source tables.

- [ ] **Step 3: Implement one mapper per row type**

Add `supportProduct`, `productRepositoryLink`, `knowledgeSource` and `knowledgeSyncRun` to `server/adapters/supabase-mappers.ts`. Expose only IDs, names, roles, refs, SHAs, timestamps, state and stable error codes. Do not expose `source_metadata_json`, raw job payloads or repository installation tokens.

- [ ] **Step 4: Implement transactional replacement RPCs**

Add private/security-definer RPCs in the migration for `replace_product_repositories` and `replace_article_products`. Each RPC accepts `p_workspace_id`, validates the authenticated admin or service role, deletes only links for the exact parent, inserts validated workspace-scoped links and returns the final set.

- [ ] **Step 5: Compose adapters**

Extend `SupabaseApiPortDependencies` with:

```ts
knowledgeProducts: KnowledgeProductPort;
knowledgeSources: KnowledgeSourcePort;
conversationProducts: ConversationProductPort;
```

Construct them in `createSupabaseApiAdapters` with the request-scoped client for reads and the privileged client only for service-owned sync operations.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npm test -- --run server/supabase-api-adapters.test.ts server/supabase-security.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/adapters/supabase/knowledge.ts server/adapters/supabase/repositories.ts server/adapters/supabase-mappers.ts server/supabase-api-adapters.ts server/supabase-api-adapters.test.ts server/supabase-security.test.ts supabase/migrations/20260912090000_multirepo_live_knowledge.sql
git commit -m "feat: persist multirepo knowledge configuration"
```

---

### Task 5: Add authenticated product and source APIs

**Files:**

- Create: `server/routes/knowledge-source-routes.ts`
- Modify: `server/routes/knowledge-routes.ts`
- Modify: `server/api-router.ts`
- Modify: `server/contracts/api-ports.ts`
- Test: `server/api-router.test.ts`

**Interfaces:**

```text
GET    /api/knowledge/products
POST   /api/knowledge/products
PATCH  /api/knowledge/products/:id
PUT    /api/knowledge/products/:id/repositories
GET    /api/knowledge/sources
POST   /api/knowledge/sources
POST   /api/knowledge/sources/:id/sync
POST   /api/knowledge/sources/:id/activate
```

- [ ] **Step 1: Write failing API tests**

Assert:

- viewers can list products/sources;
- agents can create/edit manual articles and assign product IDs;
- only admins can create/archive products, map repositories, create sources, request sync or activate a revision;
- source-managed fields in article payloads return `400 invalid_input`;
- cross-workspace product/source IDs return `404`;
- sync returns `202` with sanitized run metadata;
- activation of an unindexed SHA returns `409 knowledge_revision_not_indexed`.

- [ ] **Step 2: Run the API tests and confirm routes return 404**

Run:

```bash
npm test -- --run server/api-router.test.ts
```

Expected: FAIL because the product/source routes are absent.

- [ ] **Step 3: Implement strict route schemas and role gates**

Use `scoped(request, response, "admin")` for all configuration mutations. Use `knowledgeCreateSchema`/`knowledgePatchSchema` for article writes and call `replaceArticleProducts` inside the adapter after the article row exists.

- [ ] **Step 4: Register routes through `ApiRouteModuleContext`**

Add product/source services to the route context rather than importing Supabase adapters in route files. Return stable errors:

```text
knowledge_product_not_found
knowledge_source_not_found
knowledge_repository_not_mapped
knowledge_revision_not_indexed
knowledge_sync_already_queued
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- --run server/api-router.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/routes/knowledge-source-routes.ts server/routes/knowledge-routes.ts server/api-router.ts server/contracts/api-ports.ts server/api-router.test.ts
git commit -m "feat: expose multirepo knowledge management API"
```

---

### Task 6: Build the safe repository source extractor

**Files:**

- Create: `server/knowledge-source-extractor.ts`
- Create: `server/knowledge-source-extractor.test.ts`
- Modify: `.env.example`

**Interfaces:**

```ts
export interface ExtractedKnowledgeDocument {
  relativePath: string;
  title: string;
  body: string;
  contentHash: string;
  audience: "customer" | "internal";
  trustLevel: "deterministic";
  metadata: {
    format: "markdown" | "json" | "typescript" | "text";
    extractorVersion: "v1";
  };
}

export async function extractRepositoryKnowledge(input: {
  repositoryRoot: string;
  includePatterns: readonly string[];
  excludePatterns: readonly string[];
  maxFileBytes?: number;
  maxTotalBytes?: number;
}): Promise<{
  documents: readonly ExtractedKnowledgeDocument[];
  scanned: number;
  skipped: number;
}>;
```

- [ ] **Step 1: Write adversarial extractor tests**

Create temporary fixture trees proving:

- Markdown headings and paragraphs are retained;
- locale JSON is flattened into `key: visible text` lines;
- OpenAPI paths, summaries, response descriptions and schemas are retained;
- TypeScript exports and adjacent comments are internal evidence, while imports and generated maps are omitted;
- `.env`, private keys, `node_modules`, `dist`, source maps, binaries and files over 512 KiB are skipped;
- symlinks escaping the checkout are rejected;
- total extracted bytes stop at 20 MiB with a stable `knowledge_source_size_limit` error;
- identical content produces identical hashes regardless of checkout directory.

- [ ] **Step 2: Run the test and confirm the module is missing**

Run:

```bash
npm test -- --run server/knowledge-source-extractor.test.ts
```

Expected: FAIL because `extractRepositoryKnowledge` does not exist.

- [ ] **Step 3: Implement deterministic extraction**

Use Node filesystem APIs and `path.relative`/`realpath`; do not execute repository code. Use a closed extension allowlist:

```ts
const allowedExtensions = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".ts",
  ".tsx",
]);
const defaultMaxFileBytes = 512 * 1024;
const defaultMaxTotalBytes = 20 * 1024 * 1024;
```

For TypeScript, include only exported declarations, route/schema literals, user-visible messages and adjacent comments. Never run a package script, TypeScript compiler plugin or repository-supplied extractor.

- [ ] **Step 4: Document safe limits**

Add to `.env.example`:

```dotenv
MEND_KNOWLEDGE_MAX_FILE_BYTES=524288
MEND_KNOWLEDGE_MAX_TOTAL_BYTES=20971520
MEND_KNOWLEDGE_MAX_FILES=5000
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-source-extractor.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/knowledge-source-extractor.ts server/knowledge-source-extractor.test.ts .env.example
git commit -m "feat: safely extract support knowledge from repositories"
```

---

### Task 7: Implement exact-SHA incremental indexing

**Files:**

- Create: `server/knowledge-source-indexer.ts`
- Create: `server/knowledge-source-indexer.test.ts`
- Modify: `server/adapters/supabase/knowledge.ts`
- Modify: `server/knowledge-retrieval.ts`
- Test: `server/knowledge-retrieval.test.ts`

**Interfaces:**

```ts
export interface KnowledgeSourceIndexPort {
  begin(input: BeginKnowledgeSyncInput): Promise<KnowledgeSyncRun>;
  loadCurrentManifest(
    sourceId: string,
    workspaceId: string,
  ): Promise<readonly IndexedSourceDocument[]>;
  replaceRevision(
    input: ReplaceKnowledgeRevisionInput,
  ): Promise<KnowledgeSyncSummary>;
  fail(runId: string, workspaceId: string, errorCode: string): Promise<void>;
}

export class KnowledgeSourceIndexer {
  sync(input: {
    workspaceId: string;
    sourceId: string;
    repository: GitHubRepositoryRef;
    sha: string;
  }): Promise<KnowledgeSyncSummary>;
}
```

- [ ] **Step 1: Write failing incremental-index tests**

Prove:

- checkout always uses the requested SHA, never a mutable branch name;
- unchanged source paths/content hashes are not re-embedded;
- changed content replaces chunks and records the new `source_revision`;
- removed files are deleted only during successful revision promotion;
- a failed extraction or embedding run leaves the previously indexed revision readable;
- a newer queued SHA marks an older unfinished run `superseded`;
- two deliveries for the same source/SHA result in one sync run;
- temporary checkouts are deleted in `finally` after path validation.

- [ ] **Step 2: Run tests and confirm the indexer is missing**

Run:

```bash
npm test -- --run server/knowledge-source-indexer.test.ts server/knowledge-retrieval.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Reuse existing GitHub and embedding boundaries**

Construct the indexer with:

```ts
new KnowledgeSourceIndexer({
  github: createGitHubControlPlaneFromEnv(),
  extractor: extractRepositoryKnowledge,
  index: sourceIndexPort,
  embeddings: new OpenAiKnowledgeEmbeddings(apiKey, embeddingModel),
});
```

Use `GitHubControlPlane.checkoutRepositoryArchive(repository, sha, checkoutRoot)`. Do not mint tokens or call GitHub directly from the indexer.

- [ ] **Step 4: Make revision replacement atomic**

Add a private Supabase RPC `replace_knowledge_source_revision` that:

1. locks the `knowledge_sources` row;
2. verifies `requested_sha` still matches the active run;
3. upserts changed machine-managed articles by `(source_id, source_path)`;
4. replaces their chunks using existing `chunkPublishedArticle` output;
5. deletes managed articles absent from the new manifest;
6. sets `indexed_sha`, `sync_state`, counters and timestamps;
7. completes the sync run in the same transaction.

Embedding vectors must be computed before the RPC. The RPC receives bounded validated article/chunk JSON and never performs external calls.

- [ ] **Step 5: Preserve manual article behavior**

Keep `SupabaseKnowledgeAdapter.syncChunks` for manual create/update. Repository sync uses the new bulk port and never changes an article where `managed_by_sync=false`.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-source-indexer.test.ts server/knowledge-retrieval.test.ts server/supabase-api-adapters.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/knowledge-source-indexer.ts server/knowledge-source-indexer.test.ts server/adapters/supabase/knowledge.ts server/knowledge-retrieval.ts server/knowledge-retrieval.test.ts supabase/migrations/20260912090000_multirepo_live_knowledge.sql
git commit -m "feat: index repository knowledge by exact commit"
```

---

### Task 8: Enqueue syncs from signed GitHub events

**Files:**

- Create: `server/github-knowledge-webhook.ts`
- Create: `server/github-knowledge-webhook.test.ts`
- Modify: `server/workers/live-worker-shared.ts`
- Modify: `server/index.ts`
- Modify: `server/github-control-plane.ts`
- Modify: `server/adapters/supabase/repositories.ts`
- Modify: `.env.example`
- Test: `server/index.test.ts`

**Interfaces:**

```ts
export const KNOWLEDGE_REPOSITORY_SYNC_JOB_TYPE =
  "mend.knowledge.repository_sync";

export interface KnowledgeRepositorySyncJobPayload {
  stage: "knowledge_repository_sync";
  workspaceId: string;
  sourceId: string;
  repositoryId: string;
  owner: string;
  repo: string;
  installationId: number;
  requestedSha: string;
  deliveryId: string;
}
```

Define this job constant and payload in `server/workers/live-worker-shared.ts`; import them from the webhook and the live worker so the queue producer and consumer share one contract.

- [ ] **Step 1: Write webhook tests**

Cover:

- `ping` returns `204` after valid signature;
- invalid or missing signature returns `401` before JSON parsing;
- unsupported events return `204` without a job;
- default-ref `push` resolves every matching workspace repository/source and enqueues one job per source;
- non-configured branches update nothing;
- duplicate `X-GitHub-Delivery`/source/SHA deliveries return `202` and one queued job;
- deleted refs and missing installation IDs are ignored safely;
- no raw payload, commit message or token is written to logs/jobs.

- [ ] **Step 2: Run tests and confirm the route is absent**

Run:

```bash
npm test -- --run server/github-knowledge-webhook.test.ts server/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Mount the raw-body route before `express.json`**

In `server/index.ts`, mount only this path with a 1 MiB body limit:

```ts
app.post(
  "/webhooks/github/knowledge",
  express.raw({ type: "application/json", limit: "1mb" }),
  githubKnowledgeWebhookHandler,
);
```

The handler must call existing `verifyGitHubWebhookSignature(rawBody, header, secret)` before parsing JSON.

- [ ] **Step 4: Use durable dedupe keys**

Enqueue with:

```ts
dedupeKey: `mend:knowledge-sync:${source.id}:${requestedSha}`,
maxAttempts: 5,
```

Set `knowledge_sources.observed_sha=requestedSha` and `sync_state='queued'` only after the sync run and job are durably recorded.

- [ ] **Step 5: Document webhook configuration**

Add to `.env.example`:

```dotenv
MEND_GITHUB_WEBHOOK_SECRET=
MEND_GITHUB_KNOWLEDGE_WEBHOOK_PATH=/webhooks/github/knowledge
```

The operations guide must state that the GitHub App subscribes to `push`, `ping`, `deployment` and `deployment_status` events with repository contents read permission.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/github-knowledge-webhook.test.ts server/github-control-plane.test.ts server/index.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/github-knowledge-webhook.ts server/github-knowledge-webhook.test.ts server/workers/live-worker-shared.ts server/index.ts server/index.test.ts server/github-control-plane.ts server/adapters/supabase/repositories.ts .env.example
git commit -m "feat: queue knowledge sync from signed GitHub events"
```

---

### Task 9: Gate knowledge against the active production revision

**Files:**

- Modify: `server/github-knowledge-webhook.ts`
- Modify: `server/knowledge-sync.ts`
- Modify: `server/routes/knowledge-source-routes.ts`
- Modify: `server/adapters/supabase/knowledge.ts`
- Modify: `server/deployment.ts`
- Test: `server/github-knowledge-webhook.test.ts`
- Test: `server/knowledge-sync.test.ts`
- Test: `server/deployment.test.ts`

**Interfaces:**

- `activateRevision` accepts only a successfully indexed SHA.
- GitHub `deployment_status=success` may activate the referenced SHA when repository/environment mapping is exact.
- Workspaces without reliable deployment events use explicit `follow_ref` or manual activation configured by an admin.

- [ ] **Step 1: Write freshness-gate tests**

Test:

- indexing a new main commit changes `observed_sha/indexed_sha` but not `active_sha`;
- successful deployment status activates the exact payload SHA;
- failed/inactive deployment status never activates;
- a deployment for another repository/workspace is ignored;
- manual activation requires admin and a completed sync run;
- `follow_ref` activates only after the corresponding sync completes and is visibly labeled as branch-following rather than deployment-verified;
- source state is `stale` when `active_sha != indexed_sha`, `ready` when equal.

- [ ] **Step 2: Run tests and observe the current schema cannot distinguish indexed/live**

Run:

```bash
npm test -- --run server/knowledge-sync.test.ts server/github-knowledge-webhook.test.ts server/deployment.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement activation policies**

Use this state rule:

```ts
export function sourceFreshness(
  source: KnowledgeSource,
): "empty" | "stale" | "current" {
  if (!source.indexedSha || !source.activeSha) return "empty";
  return source.indexedSha === source.activeSha ? "current" : "stale";
}
```

Do not infer production state from the newest commit. For Techne repositories with verified automatic deployment of the configured ref, an admin may select `follow_ref`; other repositories remain manual or deployment-event driven.

- [ ] **Step 4: Connect successful Mend-owned deployments**

Extend `CodexDeploymentInput` with the workspace-scoped `repositoryId: string`. When `DokployDeployment.deploy` receives that repository ID and a commit SHA and the reconciled deployment succeeds, call an injected `KnowledgeReleasePort.recordSuccessfulRelease({workspaceId, repositoryId, commitSha, provider:"dokploy"})`. Keep the port optional so existing deployment behavior remains compatible, and require the deployment caller to prove that the repository belongs to the same workspace before invoking the adapter.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-sync.test.ts server/github-knowledge-webhook.test.ts server/deployment.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/github-knowledge-webhook.ts server/knowledge-sync.ts server/routes/knowledge-source-routes.ts server/adapters/supabase/knowledge.ts server/deployment.ts server/github-knowledge-webhook.test.ts server/knowledge-sync.test.ts server/deployment.test.ts
git commit -m "feat: gate knowledge by active product revision"
```

---

### Task 10: Process repository syncs in the existing runner

**Files:**

- Create: `server/workers/knowledge-sync.ts`
- Modify: `server/workers/live-worker-shared.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/index.ts`
- Test: `server/live-worker.test.ts`
- Test: `server/knowledge-source-indexer.test.ts`

**Interfaces:**

- Consumes `KnowledgeRepositorySyncJobPayload` from Task 8.
- Produces `LiveWorkerOptions.knowledgeSync?: { process(payload): Promise<void> }`.
- Reuses the same `SupabaseJobStore`; no independent polling process is added.

- [ ] **Step 1: Write failing worker tests**

Assert:

- the worker accepts `mend.knowledge.repository_sync` and passes exact workspace/source/repository/SHA to the processor;
- malformed payloads fail with `invalid_knowledge_repository_sync_job`;
- processing errors use existing exponential retry/dead-letter behavior;
- a retry after completed revision is idempotent;
- WhatsApp ingestion continues while a sync job exists;
- source failure stores a stable error code and no raw provider response.

- [ ] **Step 2: Run worker tests and confirm unsupported job type**

Run:

```bash
npm test -- --run server/live-worker.test.ts server/knowledge-source-indexer.test.ts
```

Expected: FAIL with `unsupported_job_type:mend.knowledge.repository_sync`.

- [ ] **Step 3: Add the job type to the union and dispatcher**

Extend `LiveWorkerJobPayload` and `processJob` with a strict stage/type check. Keep source-indexing logic in `server/workers/knowledge-sync.ts`; `server/live-worker.ts` remains composition/dispatch only.

- [ ] **Step 4: Compose workspace credentials at processing time**

Resolve the workspace support embedding credential inside the processor immediately before embedding. Never persist the key in `jobs`. If the credential/model is absent, fail with `support_ai_configuration_required` or `support_ai_model_missing` so the normal retry/dead-letter path records a safe code.

- [ ] **Step 5: Add bounded concurrency**

Keep one repository sync per job and embed batches of at most 64 chunks. Do not process multiple repositories concurrently inside a single job. The existing runner may claim the next job after completion.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/live-worker.test.ts server/knowledge-source-indexer.test.ts server/persistence.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/workers/knowledge-sync.ts server/workers/live-worker-shared.ts server/live-worker.ts server/index.ts server/live-worker.test.ts server/knowledge-source-indexer.test.ts
git commit -m "feat: process knowledge syncs in the Mend runner"
```

---

### Task 11: Resolve products without mixing ZeloPDV, ZeloChat and ZeloMenu

**Files:**

- Modify: `server/knowledge-products.ts`
- Modify: `server/triage.ts`
- Modify: `server/providers.ts`
- Modify: `server/workers/automation.ts`
- Modify: `server/adapters/supabase/knowledge.ts`
- Test: `server/knowledge-products.test.ts`
- Test: `server/providers.test.ts`
- Test: `server/live-worker.test.ts`

**Interfaces:**

```ts
export interface ProductResolutionInput {
  message: string;
  products: readonly SupportProduct[];
  persistedContext: readonly ConversationProductContext[];
  retrievalScores?: Readonly<Record<string, number>>;
}

export function resolveSupportProducts(
  input: ProductResolutionInput,
): ProductResolution;
```

- [ ] **Step 1: Add failing Techne routing fixtures**

Use these product fixtures:

```ts
const products = [
  {
    key: "zelopdv",
    name: "ZeloPDV",
    aliases: ["pdv", "caixa", "fiado", "estoque", "mesa"],
  },
  {
    key: "zelochat",
    name: "ZeloChat",
    aliases: ["chat", "whatsapp", "bot", "atendimento"],
  },
  {
    key: "zelomenu",
    name: "ZeloMenu",
    aliases: ["menu", "cardápio digital", "link do cardápio"],
  },
];
```

Cover explicit single-product, explicit multi-product, persisted manual selection, weak generic aliases, conflicting aliases and ambiguous text. Verify a ZeloMenu question cannot retrieve a ZeloChat-only article.

- [ ] **Step 2: Run tests and observe current retrieval is workspace-wide**

Run:

```bash
npm test -- --run server/knowledge-products.test.ts server/providers.test.ts server/live-worker.test.ts
```

Expected: FAIL because no product scope exists.

- [ ] **Step 3: Implement deterministic-first resolution**

Apply precedence:

1. admin/manual primary product context;
2. exact product name or configured multi-word alias in the current inbound message;
3. high-confidence persisted conversation context updated by a recent message;
4. grouped retrieval scores where top score is at least `0.18` and exceeds second place by at least `0.05`;
5. ambiguous with no product IDs.

Never match the generic token `zelo` by itself. Normalize accents and punctuation using the same deterministic tokenizer style as `knowledgeTokens`.

- [ ] **Step 4: Persist only confident context**

Write `conversation_product_context` after manual selection, explicit names/aliases or decisive grouped retrieval. Store `last_message_id`, source and confidence. Do not persist an ambiguous result as a guessed primary product.

- [ ] **Step 5: Gate automation on ambiguity**

When product resolution is ambiguous and only product-specific knowledge could answer, force `draft_for_review` or `human_escalation` according to the workspace fallback route. A safe draft may ask one plain-language question such as “Isso aconteceu no ZeloPDV, no atendimento do WhatsApp ou no cardápio digital?”.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-products.test.ts server/providers.test.ts server/live-worker.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/knowledge-products.ts server/triage.ts server/providers.ts server/workers/automation.ts server/adapters/supabase/knowledge.ts server/knowledge-products.test.ts server/providers.test.ts server/live-worker.test.ts
git commit -m "feat: route support knowledge by product"
```

---

### Task 12: Make hybrid retrieval product- and revision-aware

**Files:**

- Modify: `supabase/migrations/20260912090000_multirepo_live_knowledge.sql`
- Modify: `server/knowledge-retrieval.ts`
- Modify: `server/workers/knowledge.ts`
- Modify: `server/automation/decision.ts`
- Test: `server/knowledge-retrieval.test.ts`
- Test: `server/automation/decision.test.ts`
- Test: `supabase/tests/multirepo_live_knowledge_test.sql`

**Interfaces:**

```ts
KnowledgeRetriever.retrieve({
  workspaceId,
  query,
  productIds,
  mode,
  limit,
}): Promise<{
  chunks: readonly SupportKnowledgeEvidence[];
  sufficient: boolean;
  stale: boolean;
  productScores: Readonly<Record<string, number>>;
}>;
```

- [ ] **Step 1: Write failing retrieval tests**

Prove:

- shared manual knowledge is returned for every product;
- ZeloPDV-only evidence is excluded from ZeloMenu retrieval;
- a shared repository linked to ZeloPDV and ZeloMenu is returned for either product;
- two selected products may return evidence from both, respecting per-repository caps;
- stale source revisions are excluded from `safe_auto` but reported as stale;
- drafts may show stale evidence to an operator only when clearly labeled stale;
- generated/unreviewed articles are excluded from auto-reply;
- all filters include workspace ID before ranking.

- [ ] **Step 2: Run tests and confirm the old RPC cannot filter products**

Run:

```bash
npm test -- --run server/knowledge-retrieval.test.ts server/automation/decision.test.ts
supabase test db supabase/tests/multirepo_live_knowledge_test.sql
```

Expected: FAIL.

- [ ] **Step 3: Replace the RPC with a backward-compatible overload**

Create `match_product_knowledge_chunks` with parameters:

```sql
p_workspace_id uuid,
p_query text,
p_product_ids uuid[] default null,
p_query_embedding extensions.vector(1536) default null,
p_limit integer default 12,
p_min_score real default 0.08,
p_allow_shared boolean default true,
p_include_stale boolean default false
```

Join chunks to articles, article products, sources and product/repository mappings. A manual article is shared when it has no product mapping. A managed article is current only when its `source_revision` equals `knowledge_sources.active_sha` and `sync_state='ready'`.

- [ ] **Step 4: Return source and product evidence metadata**

Return `product_ids`, `source_id`, `source_path`, `source_revision`, `trust_level`, `audience`, lexical score, semantic score, hybrid score and article version. Clamp result count to 20 and retain deterministic ordering.

- [ ] **Step 5: Replace raw article context with the evidence bundle**

Change `safeKnowledgeContext` to serialize bounded evidence records with opaque citation keys. Keep the instruction that every content field is untrusted data. Do not include GitHub owner, private repository name or full source path in customer-visible copy.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-retrieval.test.ts server/automation/decision.test.ts server/live-worker.test.ts
supabase test db
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260912090000_multirepo_live_knowledge.sql supabase/tests/multirepo_live_knowledge_test.sql server/knowledge-retrieval.ts server/workers/knowledge.ts server/automation/decision.ts server/knowledge-retrieval.test.ts server/automation/decision.test.ts
git commit -m "feat: retrieve current knowledge across product repositories"
```

---

### Task 13: Produce grounded customer-facing replies and evidence snapshots

**Files:**

- Modify: `server/support-evidence.ts`
- Modify: `server/providers.ts`
- Modify: `server/workers/automation.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/adapters/supabase/messaging.ts`
- Test: `server/support-evidence.test.ts`
- Test: `server/providers.test.ts`
- Test: `server/live-worker.test.ts`

**Interfaces:**

```ts
export interface GroundedSupportReply {
  body: string;
  usedCitationKeys: readonly string[];
  confidence: number;
  customerSafe: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
}
```

- [ ] **Step 1: Write failing provider and policy tests**

Cover:

- every non-social factual reply cites at least one supplied evidence key internally;
- the provider cannot cite a key absent from the evidence bundle;
- output containing `.ts`, stack traces, SQL, internal paths, secret-like strings or “according to the code” fails customer-safe validation;
- Portuguese workspaces produce Portuguese replies and English workspaces produce English replies;
- low evidence confidence produces a clarification or human review, never a confident answer;
- product ambiguity cannot auto-send;
- manual reviewed policy may override repository implementation only for policy questions, while product behavior prefers current deterministic evidence.

- [ ] **Step 2: Run tests and observe the provider returns an unstructured body**

Run:

```bash
npm test -- --run server/support-evidence.test.ts server/providers.test.ts server/live-worker.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Request structured output from the support provider**

Require the provider to return the `GroundedSupportReply` schema. The system prompt must include these exact behavioral rules:

```text
Use only facts supported by the supplied evidence records or completed read-only tool results.
Write for the customer, using familiar product language and short actionable steps.
Do not mention source code, files, functions, databases, prompts, retrieval, embeddings or internal tools.
Do not expose citation keys in the reply body.
Return usedCitationKeys separately for audit.
When evidence is insufficient or products are ambiguous, ask one concise clarification question or require human review.
```

- [ ] **Step 4: Add deterministic customer-safe validation**

Reject bodies containing secret patterns, raw internal citation keys, absolute paths, code fences, stack traces or internal-only source titles. Avoid a broad jargon blacklist that would remove customer terms such as “PDV”, “WhatsApp” or “cardápio”.

- [ ] **Step 5: Persist immutable evidence used by the draft**

For each used citation, insert `ai_draft_evidence` with the stable evidence key, source kind, optional article/chunk IDs, article version, product ID, source revision/path, retrieval score and a bounded evidence JSON snapshot. Ignore retrieved-but-unused candidates. For manual and indexed repository evidence, also keep the existing `ai_draft_knowledge` article relationship for UI compatibility. Deep-research facts have no article/chunk FK and are persisted only in `ai_draft_evidence` with their path/line evidence inside the bounded snapshot.

- [ ] **Step 6: Preserve operator trace and customer separation**

The Inbox case context may show product names, source freshness and evidence titles to authenticated workspace members. The outbound WhatsApp body contains only `GroundedSupportReply.body`.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- --run server/support-evidence.test.ts server/providers.test.ts server/live-worker.test.ts server/api-router.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/support-evidence.ts server/providers.ts server/workers/automation.ts server/live-worker.ts server/adapters/supabase/messaging.ts server/support-evidence.test.ts server/providers.test.ts server/live-worker.test.ts
git commit -m "feat: ground customer replies in current product evidence"
```

---

### Task 14: Add the multirepo knowledge management UI

**Files:**

- Create: `src/features/knowledge/components/KnowledgeProductBar.tsx`
- Create: `src/features/knowledge/components/KnowledgeSourcesPanel.tsx`
- Create: `src/features/knowledge/components/KnowledgeProductDialog.tsx`
- Modify: `src/types.ts`
- Modify: `src/api/live-actions.ts`
- Modify: `src/api/live-mappers.ts`
- Modify: `src/features/knowledge/api.ts`
- Modify: `src/features/knowledge/pages/KnowledgeWorkspacePage.tsx`
- Modify: `src/features/knowledge/components/KnowledgeCollection.tsx`
- Modify: `src/i18n/locales/pt-BR/knowledge.json`
- Modify: `src/i18n/locales/en-US/knowledge.json`
- Modify: `e2e/knowledge-refactor.spec.ts`

**Interfaces:**

- Product filter: `Todos`, `Compartilhado`, configured products.
- Source card: product names, repository display name, configured ref, observed/indexed/active short SHA, freshness, last sync and stable error message.
- Article editor: multi-select product mappings; empty selection means shared.

- [ ] **Step 1: Write failing Playwright scenarios**

Add tests for desktop and mobile:

- create ZeloPDV, ZeloChat and ZeloMenu products with aliases;
- map two repositories to one product and one shared repository to two products;
- filter articles by product/shared scope;
- create a shared article and a product-specific article;
- request sync and observe queued/running/ready states;
- stale state explains that indexed knowledge is not yet the active release;
- activate a completed revision through the shared confirmation dialog;
- viewers see status but no mutation controls;
- all controls remain usable at 390×844 without horizontal page overflow.

- [ ] **Step 2: Run E2E and confirm missing UI**

Run:

```bash
npx playwright test e2e/knowledge-refactor.spec.ts --project=chromium
```

Expected: FAIL because product/source controls do not exist.

- [ ] **Step 3: Add sanitized frontend types and APIs**

Define:

```ts
export interface KnowledgeProduct {
  id: string;
  key: string;
  name: string;
  description: string;
  aliases: string[];
  status: "active" | "archived";
}

export interface KnowledgeSourceSummary {
  id: string;
  repositoryId: string;
  repositoryName: string;
  productIds: string[];
  refName: string;
  observedSha?: string;
  indexedSha?: string;
  activeSha?: string;
  freshness: "empty" | "stale" | "current";
  syncState: "idle" | "queued" | "running" | "ready" | "stale" | "failed";
  lastSyncAt?: string;
  errorCode?: string;
}
```

All mutations use `apiRequest` through feature `api.ts`; components do not call Supabase directly.

- [ ] **Step 4: Implement the page hierarchy**

Use the existing page header and knowledge collection. Place the product filter directly above the article/source switch. Use two views inside the same page: `Conteúdo` and `Fontes`. Keep article reading as the primary view and source configuration as an admin operation.

- [ ] **Step 5: Use app-native confirmations and bilingual copy**

Use `useConfirmation`/`ConfirmDialog` before archiving a product, disabling a source or activating a revision. Add every string to both locale files and avoid repository jargon in general-user descriptions.

- [ ] **Step 6: Run UI and localization checks**

Run:

```bash
npx playwright test e2e/knowledge-refactor.spec.ts --project=chromium
npm run i18n:check
npm run i18n:frontend
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/knowledge/components/KnowledgeProductBar.tsx src/features/knowledge/components/KnowledgeSourcesPanel.tsx src/features/knowledge/components/KnowledgeProductDialog.tsx src/types.ts src/api/live-actions.ts src/api/live-mappers.ts src/features/knowledge/api.ts src/features/knowledge/pages/KnowledgeWorkspacePage.tsx src/features/knowledge/components/KnowledgeCollection.tsx src/i18n/locales/pt-BR/knowledge.json src/i18n/locales/en-US/knowledge.json e2e/knowledge-refactor.spec.ts
git commit -m "feat: manage multirepo knowledge sources"
```

---

### Task 15: Add on-demand deep repository research for insufficient knowledge

**Files:**

- Create: `server/support-repository-research.ts`
- Create: `server/support-repository-research.test.ts`
- Modify: `server/workers/live-worker-shared.ts`
- Modify: `server/live-worker.ts`
- Modify: `server/workers/automation.ts`
- Modify: `server/coding-agent-cli.ts`
- Modify: `server/coding-control-plane.ts`
- Test: `server/live-worker.test.ts`
- Test: `server/coding-agent-cli.test.ts`

**Interfaces:**

```ts
export const SUPPORT_REPOSITORY_RESEARCH_JOB_TYPE =
  "mend.support.repository_research";

export interface SupportRepositoryResearchArtifact {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  productIds: readonly string[];
  repositories: readonly { repositoryId: string; activeSha: string }[];
  facts: readonly {
    statement: string;
    repositoryId: string;
    activeSha: string;
    relativePath: string;
    lineStart: number;
    lineEnd: number;
  }[];
  confidence: number;
  contentHash: string;
}
```

- [ ] **Step 1: Write failing deep-research tests**

Prove:

- deep research runs only when normal retrieval is insufficient and the conversation is in draft/human-review mode;
- all repositories are mapped to the resolved product and use active SHAs;
- the agent receives isolated read-only checkouts and a closed set of search/read tools;
- the agent cannot run package scripts, network calls, Git writes or read files outside the checkout;
- at most five repositories, 200 file reads and 120,000 extracted characters are allowed per case;
- facts without file/line evidence are rejected;
- the artifact is content-addressed and reused for retries of the same message/revision set;
- auto-send remains blocked until the deep-research evaluation gate is explicitly enabled by policy.

- [ ] **Step 2: Run tests and confirm the support research path is missing**

Run:

```bash
npm test -- --run server/support-repository-research.test.ts server/live-worker.test.ts server/coding-agent-cli.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Reuse the isolated coding-agent boundary in read-only mode**

Add a support-specific prompt and result schema to `CodingAgentCli`; do not reuse bug-fix instructions or grant mutation tools. The task is to produce support facts, uncertainty and citations, never a patch.

- [ ] **Step 4: Queue research without blocking WhatsApp webhook ingestion**

Persist a draft placeholder/state, enqueue a deduplicated research job and update the same case/draft after the artifact completes. Use the key:

```ts
`mend:support-research:${workspaceId}:${messageId}:${revisionSetHash}`;
```

- [ ] **Step 5: Feed facts through the same customer-facing renderer**

Convert artifact facts into `SupportKnowledgeEvidence` with source kind `repository_research`. Keep file/line citations internal and apply the exact validation/policy gates from Task 13.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npm test -- --run server/support-repository-research.test.ts server/live-worker.test.ts server/coding-agent-cli.test.ts server/support-evidence.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/support-repository-research.ts server/support-repository-research.test.ts server/workers/live-worker-shared.ts server/live-worker.ts server/workers/automation.ts server/coding-agent-cli.ts server/coding-control-plane.ts server/live-worker.test.ts server/coding-agent-cli.test.ts
git commit -m "feat: research active product repositories for support"
```

---

### Task 16: Add observability, cost accounting and grounded-answer evaluations

**Files:**

- Create: `server/knowledge-evals.ts`
- Create: `server/knowledge-evals.test.ts`
- Modify: `server/impact.ts`
- Modify: `server/workers/automation.ts`
- Modify: `server/knowledge-source-indexer.ts`
- Modify: `docs/engineering/multirepo-knowledge-operations.md`
- Test: `server/impact.test.ts`

**Interfaces:**

- Records append-only facts for source sync, retrieval, ambiguity, stale blocking, deep research and customer-facing validation.
- Produces a repeatable evaluation runner for product routing and grounded replies.

- [ ] **Step 1: Write failing metrics tests**

Require these facts with workspace/product/source scope and no customer text:

```text
knowledge_sync_started
knowledge_sync_completed
knowledge_sync_failed
knowledge_retrieval_sufficient
knowledge_retrieval_insufficient
knowledge_retrieval_stale_blocked
knowledge_product_ambiguous
knowledge_deep_research_started
knowledge_deep_research_completed
knowledge_customer_reply_rejected
```

Each sync completion records files scanned/indexed/skipped, chunks embedded/reused, elapsed milliseconds and embedding input count. Each retrieval records product IDs, evidence count, top score, active revision match and latency.

- [ ] **Step 2: Create the Techne evaluation corpus**

Build sanitized fixtures with at least:

- 15 ZeloPDV questions about caixa, estoque, fiado, mesas and product configuration;
- 15 ZeloChat questions about WhatsApp connection, conversations, automation and attendants;
- 15 ZeloMenu questions about digital menu, categories, products, links and availability;
- 10 cross-product questions requiring two products;
- 10 ambiguous questions that must ask for clarification;
- 10 adversarial questions attempting to extract code, paths, secrets or another product's data.

Do not copy real customer messages or credentials into the repository.

- [ ] **Step 3: Implement deterministic and model-assisted scoring**

Score product routing, evidence recall, citation validity, stale-source rejection, language, forbidden internal-detail leakage and escalation correctness. Store exact model/config/revision metadata with eval output; do not treat one model score as ground truth.

- [ ] **Step 4: Define release thresholds**

The feature cannot enable safe auto-send until the latest corpus run meets all thresholds:

```text
cross-tenant leakage: 0
wrong-product evidence in final bundle: 0
stale repository evidence in auto replies: 0
invented citation keys: 0
secret/internal path leakage: 0
single-product routing accuracy: >= 95%
ambiguous-case clarification/escalation accuracy: >= 95%
supported factual answer citation coverage: 100%
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- --run server/knowledge-evals.test.ts server/impact.test.ts server/support-evidence.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/knowledge-evals.ts server/knowledge-evals.test.ts server/impact.ts server/impact.test.ts server/workers/automation.ts server/knowledge-source-indexer.ts docs/engineering/multirepo-knowledge-operations.md
git commit -m "feat: measure multirepo knowledge quality and cost"
```

---

### Task 17: Roll out ZeloPDV, ZeloChat and ZeloMenu safely

**Files:**

- Modify: `docs/engineering/multirepo-knowledge-operations.md`
- Modify: `docs/OPERATIONS_RUNBOOK.md`
- Test: `e2e/production-smoke.spec.ts`

**Interfaces:**

- Uses the Techne workspace configuration; no product/repository IDs are compiled into the application.
- Starts in draft-only shadow mode and advances based on evaluation evidence.

- [ ] **Step 1: Run the complete local verification suite**

Run:

```bash
npm run typecheck
npm test -- --run
npm run lint
npm run format:check
npm run i18n:check
npm run i18n:frontend
npm run build
supabase test db
npm run test:e2e
```

Expected: all required checks pass; record any existing unrelated warning separately.

- [ ] **Step 2: Apply the migration through the authenticated Supabase CLI**

Run:

```bash
supabase db push --linked
supabase migration list --linked
supabase gen types typescript --linked > src/lib/database.types.ts
```

Expected: migration `20260912090000` is present locally and remotely; generated types match the committed file.

- [ ] **Step 3: Configure the three Techne products**

In the Mend Knowledge UI create:

```text
ZeloPDV  key=zelopdv   aliases=pdv, caixa, fiado, estoque, mesa
ZeloChat key=zelochat  aliases=chat, WhatsApp, bot, atendimento
ZeloMenu key=zelomenu  aliases=menu, cardápio digital, link do cardápio
```

List the workspace's existing repositories, verify their exact GitHub owner/repo and map each to every product it actually implements. Mark shared libraries with repository role `shared`. Do not guess a mapping from repository name alone; verify README/package metadata and the configured production service.

- [ ] **Step 4: Classify existing manual articles**

Review every published article and assign ZeloPDV, ZeloChat, ZeloMenu or multiple products. Leave company tone, billing policy and general escalation articles shared. Do not auto-classify and publish existing content without review.

- [ ] **Step 5: Configure and test GitHub delivery**

Set `MEND_GITHUB_WEBHOOK_SECRET` in both Mend control-plane and runner environments, configure the GitHub App webhook URL and send a `ping`. Push a documentation-only commit to a disposable branch, confirm it does not sync the configured ref, then merge it to the configured ref and confirm exactly one sync run.

- [ ] **Step 6: Establish active revisions**

For each mapped repository, verify the production commit through its deployment provider. Activate that exact indexed SHA. If the repository is configured to follow an auto-deployed ref, document the evidence that every successful push to that ref reaches production before enabling `follow_ref`.

- [ ] **Step 7: Run an initial full sync and inspect evidence**

For every source:

1. request sync;
2. confirm `files_scanned`, `files_indexed`, `files_skipped` and `chunks_written` are plausible;
3. confirm `indexed_sha=active_sha` and state `ready`;
4. sample at least five documents;
5. verify no secret, customer export, generated bundle or irrelevant dependency content was indexed.

- [ ] **Step 8: Run shadow evaluation against real operator questions**

Keep `safe_auto_send_enabled=false`. For at least 30 eligible dogfooding conversations, compare the generated draft with the answer an operator would send. Record wrong-product, stale-source, missing-evidence, unnecessary-jargon and escalation outcomes without copying private message bodies into source-controlled fixtures.

- [ ] **Step 9: Enable one product at a time**

Enable safe auto-answer eligibility first for ZeloMenu how-to questions, then ZeloChat connection/how-to questions, then ZeloPDV operational questions. Each product advances only after its latest evaluation meets Task 16 thresholds and at least ten shadow drafts have been reviewed without a factual correction.

- [ ] **Step 10: Validate production behavior**

Run production smoke coverage and manually verify:

- a ZeloPDV question cites only ZeloPDV/shared evidence;
- a ZeloChat question cites only ZeloChat/shared evidence;
- a ZeloMenu question cites only ZeloMenu/shared evidence;
- a cross-product question can cite two mapped products;
- an ambiguous question asks which product is involved;
- customer copy contains no internal path, code symbol or citation key;
- operator context shows product, source revision and evidence title;
- disconnecting GitHub or pausing a source makes it stale/disabled without deleting manual knowledge.

- [ ] **Step 11: Document rollback**

Rollback order:

1. disable safe auto-send for knowledge routes;
2. set repository sources to `paused`;
3. continue serving reviewed manual articles;
4. leave indexed rows for diagnosis;
5. revert application code if needed;
6. remove schema only in a later reviewed migration after data export.

- [ ] **Step 12: Commit the operational handoff**

```bash
git add docs/engineering/multirepo-knowledge-operations.md docs/OPERATIONS_RUNBOOK.md e2e/production-smoke.spec.ts src/lib/database.types.ts
git commit -m "docs: add Techne multirepo knowledge rollout"
```

---

## Definition of done

- [ ] A workspace can create ZeloPDV, ZeloChat and ZeloMenu as separate support products.
- [ ] Each product can map to several repositories and a repository can map to several products.
- [ ] Manual articles can be shared or assigned to one or more products.
- [ ] A signed GitHub event queues one idempotent sync per configured repository source and commit.
- [ ] Sync reads an exact SHA through the GitHub App, executes no repository code and excludes sensitive/irrelevant files.
- [ ] Unchanged content is not re-embedded; failed syncs preserve the last good index.
- [ ] Indexed and active production revisions are distinct and visible.
- [ ] Auto-replies cannot use stale, generated-unreviewed or wrong-product evidence.
- [ ] Ambiguous product selection cannot auto-send.
- [ ] Multi-product questions may retrieve from all explicitly resolved products.
- [ ] The customer receives plain, actionable language without code paths, symbols, prompts or citation keys.
- [ ] Operators can inspect products, source freshness, evidence titles and immutable draft citations.
- [ ] Deep repository research is read-only, bounded, content-addressed and used only after normal retrieval is insufficient.
- [ ] Cross-tenant, wrong-product, stale-source, secret-leak and invented-citation eval counts are zero.
- [ ] Cost and latency are measurable per sync, retrieval and deep-research case.
- [ ] The system can fall back to reviewed manual articles by pausing repository sources without deleting data.

## Expected steady-state cost model

- Repository sync cost occurs on relevant commits, not on a polling loop and not on every support message.
- Embedding cost applies only to changed content hashes; unchanged chunks reuse stored vectors.
- Normal support retrieval adds one query embedding and one bounded hybrid database query.
- Customer-facing generation remains the existing support response call with a smaller, better-scoped context.
- Deep repository research is the expensive path and runs only when retrieval is insufficient, the products are resolved and policy allows a reviewed draft.
- The first operational dashboard must report embedding input count, changed/reused chunks, retrieval latency, generation usage and deep-research frequency before any pricing assumption is made.

## Implementation sequence and release gates

```text
Tasks 1-5   -> model, RLS and management API; no answer behavior changes
Tasks 6-10  -> safe indexing and revision freshness; sources remain disabled
Tasks 11-13 -> product-aware retrieval and customer-facing evidence; draft only
Task 14     -> admin/operator UI
Task 15     -> optional deep research after ordinary RAG is proven
Task 16     -> measurable quality/cost gates
Task 17     -> Techne rollout one product at a time
```

No task requires a big-bang cutover. At every deployment before Task 17, the existing reviewed article path remains the production fallback.
