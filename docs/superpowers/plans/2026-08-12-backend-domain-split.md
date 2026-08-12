# Backend Domain Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes for tracking.

**Goal:** Turn the legacy Supabase adapter and live-worker files into small compatibility/composition facades backed by focused domain modules, without changing runtime behavior or public imports.

**Architecture:** Mend remains a TypeScript modular monolith. Supabase implementations move to `server/adapters/supabase/` by business domain; worker implementations move to `server/workers/`, while `server/supabase-api-adapters.ts` and `server/live-worker.ts` preserve their existing public API through imports and re-exports.

**Tech Stack:** TypeScript 5.9, Node.js, Express, Supabase JS, Vitest, ts-morph, Prettier.

## Global Constraints

- Preserve every existing public export and constructor signature.
- Do not change database queries, authorization, workspace scoping, job semantics, or external effects.
- Keep the modular monolith; do not add a service, queue, cache, package, or deployment unit.
- Use `server/adapters/supabase-mappers.ts` as the canonical row/result mapping boundary.
- Use red-green-refactor: structural tests fail before declarations move and all existing behavior tests stay green after every extraction batch.
- `server/supabase-api-adapters.ts` must finish below 450 lines and contain no adapter class implementation.
- `server/live-worker.ts` must finish below 950 lines and contain no Supabase worker adapter or Codex starter implementation.

---

### Task 1: Structural architecture guard

**Files:**

- Create: `server/backend-domain-split.test.ts`

**Interfaces:**

- Consumes: the two compatibility entrypoint source files.
- Produces: executable limits and forbidden-declaration checks that prevent the compositors from growing back into monoliths.

- [x] **Step 1: Write the failing structural test**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

describe("backend domain boundaries", () => {
  it("keeps the Supabase API entrypoint as composition and compatibility exports", async () => {
    const value = await source("./supabase-api-adapters.ts");
    expect(value.split("\n").length).toBeLessThan(450);
    expect(value).not.toMatch(/export class Supabase/);
  });

  it("keeps the live worker entrypoint focused on polling and assembly", async () => {
    const value = await source("./live-worker.ts");
    expect(value.split("\n").length).toBeLessThan(950);
    expect(value).not.toMatch(/export class SupabaseLiveWorker/);
    expect(value).not.toMatch(/export class SupabaseCodexStarter/);
  });
});
```

- [x] **Step 2: Verify the guard fails for the existing monoliths**

Run: `npx vitest run server/backend-domain-split.test.ts`

Expected: two failures showing the current 5,000+ and 2,000+ line entrypoints.

### Task 2: Supabase customer-support domains

**Files:**

- Create: `server/adapters/supabase/access.ts`
- Create: `server/adapters/supabase/messaging.ts`
- Create: `server/adapters/supabase/issues.ts`
- Create: `server/adapters/supabase/planning.ts`
- Modify: `server/supabase-api-adapters.ts`

**Interfaces:**

- Produces: `SupabaseMembershipAdapter`, `SupabaseWorkspaceAdapter`, `SupabaseChannelAdapter`, `SupabaseConversationAdapter`, `SupabaseIssueAdapter`, `SupabaseKanbanAdapter`, and `SupabasePersonalPlanningAdapter` from domain modules and re-exports them from the compatibility entrypoint.

- [x] **Step 1: Move each complete class and its private module helpers without editing method bodies**
- [x] **Step 2: Import the classes into the composition root and re-export their existing names**
- [x] **Step 3: Run `npx vitest run server/api-router.test.ts server/supabase-api-adapters.test.ts server/inbox-service.test.ts`**

Expected: all existing customer-support adapter behavior remains green.

### Task 3: Supabase engineering and integration domains

**Files:**

- Create: `server/adapters/supabase/repositories.ts`
- Create: `server/adapters/supabase/credentials.ts`
- Create: `server/adapters/supabase/coding-control-plane.ts`
- Create: `server/adapters/supabase/coding-runs.ts`
- Create: `server/adapters/supabase/google.ts`
- Create: `server/adapters/supabase/mcp.ts`
- Create: `server/adapters/supabase/types.ts`
- Modify: `server/supabase-api-adapters.ts`

**Interfaces:**

- Produces all remaining legacy adapter classes from domain modules and keeps `createSupabaseApiAdapters(options)` as the only construction root.

- [x] **Step 1: Move repository, credential, coding-control, coding-run, Google, and MCP declarations with their domain-local helpers**
- [x] **Step 2: Organize imports so dependencies flow from the composition root into domain modules and never between unrelated domains**
- [x] **Step 3: Run `npx vitest run server/supabase-api-adapters.test.ts server/supabase-mcp-adapter.test.ts server/codex-live.test.ts server/codex-service.test.ts`**
- [x] **Step 4: Run the structural guard and confirm the Supabase entrypoint is below 450 lines with no class implementation**

### Task 4: Worker domain implementations

**Files:**

- Create: `server/workers/channel-resolver.ts`
- Create: `server/workers/knowledge.ts`
- Create: `server/workers/automation.ts`
- Create: `server/workers/codex-starter.ts`
- Create: `server/workers/live-worker-shared.ts`
- Modify: `server/live-worker.ts`

**Interfaces:**

- Produces `SupabaseLiveWorkerChannelResolver`, `SupabaseLiveWorkerKnowledge`, `SupabaseLiveWorkerAutomation`, `SupabaseCodexStarter`, and `repositorySafeTools` from focused worker modules.
- Preserves the existing exports from `server/live-worker.ts` and leaves `LiveWorker` plus `createSupabaseLiveWorker` in that entrypoint.

- [x] **Step 1: Move the channel resolver and knowledge loader classes unchanged**
- [x] **Step 2: Move support automation and Codex-start logic into their owning modules unchanged**
- [x] **Step 3: Re-export every moved symbol and organize type-only imports to avoid runtime cycles**
- [x] **Step 4: Run `npx vitest run server/live-worker.test.ts server/index.test.ts server/automation/decision.test.ts`**
- [x] **Step 5: Run the structural guard and confirm the worker entrypoint is below 950 lines with no Supabase implementation class**

### Task 5: Documentation and full verification

**Files:**

- Modify: `docs/engineering/catalog.md`
- Modify: `docs/engineering/decisions/ADR-009-architecture-hardening.md`
- Modify: `docs/superpowers/plans/2026-08-12-backend-domain-split.md`

**Interfaces:**

- Documents the final ownership boundary and records the verified facade limits.

- [x] **Step 1: Update the catalog and ADR with the concrete module map**
- [x] **Step 2: Mark every completed plan checkbox and scan for placeholders or contradictory ownership rules**
- [x] **Step 3: Run `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run lint`, `npm run format:check`, and `npm run build`**
- [x] **Step 4: Run `git diff --check` and inspect the final file sizes, exports, and dependency directions**

Expected: all commands exit zero except the repository's already-known non-blocking lint warnings; both structural limits pass and all legacy imports compile unchanged.
