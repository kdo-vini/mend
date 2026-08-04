import { describe, expect, it } from "vitest";
import {
  TicketingService,
  type TicketIssue,
  type TicketingPort,
  type UpsertTicketInput,
} from "./ticketing.js";

const input: UpsertTicketInput = {
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  title: "Checkout fails on the last order",
  summary: "The register cannot close after the last order.",
  triage: { intent: "bug", priority: "urgent" },
  dedupeKey: "checkout-last-order",
};

function issue(overrides: Partial<TicketIssue> = {}): TicketIssue {
  return {
    id: "issue-1",
    workspaceId: "workspace-1",
    title: input.title,
    summary: input.summary,
    intent: "bug",
    priority: "high",
    status: "triage",
    conversationId: input.conversationId,
    dedupeKey: input.dedupeKey,
    updatedAt: "old",
    ...overrides,
  };
}

function memoryPort(candidates: TicketIssue[]): TicketingPort & {
  updates: string[];
  creates: number;
  transactions: number;
} {
  const state = { updates: [] as string[], creates: 0, transactions: 0 };
  return {
    get updates() {
      return state.updates;
    },
    get creates() {
      return state.creates;
    },
    get transactions() {
      return state.transactions;
    },
    async transaction(callback) {
      state.transactions += 1;
      return callback({
        async findCandidates() {
          return candidates;
        },
        async createIssue(createInput) {
          state.creates += 1;
          return issue({ id: "issue-new", ...createInput });
        },
        async updateIssue(id, patch) {
          state.updates.push(id);
          return issue({ id, ...patch });
        },
      });
    },
  };
}

describe("ticketing service", () => {
  it("updates an open issue matched by conversation inside one transaction", async () => {
    const port = memoryPort([issue()]);
    const result = await new TicketingService(port, {
      now: () => "now",
    }).upsertFromTriage({
      ...input,
      triage: { intent: "incident", priority: "urgent" },
    });

    expect(result).toMatchObject({
      operation: "updated",
      matchedBy: "conversation",
      issue: { id: "issue-1", priority: "urgent", updatedAt: "now" },
    });
    expect(port.transactions).toBe(1);
    expect(port.updates).toEqual(["issue-1"]);
    expect(port.creates).toBe(0);
  });

  it("creates a new issue when there is no duplicate", async () => {
    const port = memoryPort([]);
    const result = await new TicketingService(port, {
      now: () => "now",
    }).upsertFromTriage(input);

    expect(result).toMatchObject({
      operation: "created",
      issue: { id: "issue-new", status: "triage", updatedAt: "now" },
    });
    expect(port.creates).toBe(1);
  });

  it("does not resurrect a closed duplicate", async () => {
    const port = memoryPort([issue({ status: "done" })]);
    const result = await new TicketingService(port, {
      now: () => "now",
    }).upsertFromTriage(input);

    expect(result.operation).toBe("created");
    expect(port.creates).toBe(1);
    expect(port.updates).toHaveLength(0);
  });

  it("matches similar open issues by normalized text when no key exists", async () => {
    const port = memoryPort([
      issue({
        conversationId: undefined,
        dedupeKey: undefined,
        title: "Checkout closes on last order",
        summary: "Register fails to close after final order.",
      }),
    ]);
    const result = await new TicketingService(port).upsertFromTriage({
      ...input,
      conversationId: undefined,
      dedupeKey: undefined,
    });

    expect(result).toMatchObject({ operation: "updated", matchedBy: "text" });
  });
});
