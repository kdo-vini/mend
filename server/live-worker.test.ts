import { describe, expect, it, vi } from "vitest";
import { InMemoryJobStore, type JobRecord } from "./jobs.js";
import {
  LiveWorker,
  repositorySafeTools,
  SupabaseCodexStarter,
  SupabaseLiveWorkerAutomation,
  type LiveChannelBinding,
  type LiveWorkerAutomation,
  type LiveWorkerAutomationInput,
  type LiveWorkerChannelResolver,
  type LiveWorkerCodexStarter,
  type LiveWorkerInbox,
  type LiveWorkerKnowledge,
  type LiveWorkerSendAiReplyInput,
} from "./live-worker.js";
import type { InboxContext, InboxMessageRecord } from "./inbox-service.js";
import type { NormalizedWhatsmiauMessage } from "./whatsmiau.js";
import type { WhatsmiauMessageJobPayload } from "./worker.js";
import type { SupportAiProvider } from "./providers.js";

const message: NormalizedWhatsmiauMessage = {
  instanceName: "mend-live",
  providerMessageId: "provider-1",
  remoteJid: "5511999999999@s.whatsapp.net",
  phoneNumber: "5511999999999",
  direction: "inbound",
  messageType: "text",
  text: "Checkout is failing",
  raw: {},
};

const binding: LiveChannelBinding = {
  channelConnectionId: "channel-1",
  instanceName: "mend-live",
  workspaceId: "workspace-1",
};

function jobPayload(): WhatsmiauMessageJobPayload {
  return { event: "messages.upsert", message };
}

class FakeResolver implements LiveWorkerChannelResolver {
  constructor(private readonly value: LiveChannelBinding | null) {}

  resolve(): Promise<LiveChannelBinding | null> {
    return Promise.resolve(this.value);
  }
}

class FakeKnowledge implements LiveWorkerKnowledge {
  calls = 0;

  async listPublished(): Promise<
    readonly { id: string; title: string; category: string; body: string }[]
  > {
    this.calls += 1;
    return [
      {
        id: "article-1",
        title: "Checkout",
        category: "Support",
        body: "Checkout is available until 18:00.",
      },
    ];
  }
}

class FakeInbox implements LiveWorkerInbox {
  calls: Array<{
    context: InboxContext;
    channelConnectionId: string;
    message: NormalizedWhatsmiauMessage;
  }> = [];
  displayNames: Array<{
    context: InboxContext;
    contactId: string;
    displayName: string;
  }> = [];
  private index = 0;

  constructor(private readonly failures: Error[] = []) {}

  async persistNormalizedMessage(
    context: InboxContext,
    channelConnectionId: string,
    incoming: NormalizedWhatsmiauMessage,
  ): Promise<InboxMessageRecord> {
    this.calls.push({ context, channelConnectionId, message: incoming });
    const failure = this.failures[this.index++];
    if (failure) throw failure;
    return {
      id: "message-1",
      workspaceId: context.workspaceId,
      conversationId: "conversation-1",
      contactId: "contact-1",
      providerMessageId: incoming.providerMessageId,
      direction: incoming.direction,
      messageType: incoming.messageType,
      unreadCount: 1,
      inserted: this.calls.length === 1,
    };
  }

  async setContactDisplayName(
    context: InboxContext,
    contactId: string,
    displayName: string,
  ): Promise<void> {
    this.displayNames.push({ context, contactId, displayName });
  }
}

class IdempotentAutomation implements LiveWorkerAutomation {
  calls: LiveWorkerAutomationInput[] = [];
  private readonly completed = new Set<string>();

  isComplete(
    input: Omit<LiveWorkerAutomationInput, "knowledge">,
  ): Promise<boolean> {
    return Promise.resolve(this.completed.has(input.idempotencyKey));
  }

  async process(input: LiveWorkerAutomationInput): Promise<void> {
    this.calls.push(input);
    this.completed.add(input.idempotencyKey);
  }
}

class ResultAutomation implements LiveWorkerAutomation {
  async process(input: LiveWorkerAutomationInput) {
    return {
      issue: {
        id: "issue-1",
        identifier: "TEC-1",
        operation: "created" as const,
      },
      draft: {
        conversationId: input.persisted.conversationId,
        messageId: input.persisted.id,
        idempotencyKey: input.idempotencyKey,
        body: "Draft only",
        knowledgeArticleIds: [],
        triage: {
          intent: "question" as const,
          priority: "low" as const,
          confidence: 0.99,
          summary: "Question",
          unsafe: false,
        },
      },
    };
  }
}

class SendStageAutomation implements LiveWorkerAutomation {
  sent: LiveWorkerSendAiReplyInput[] = [];

  async process(input: LiveWorkerAutomationInput) {
    return {
      send: {
        binding,
        conversationId: input.persisted.conversationId,
        sourceMessageId: input.persisted.id,
        idempotencyKey: input.idempotencyKey,
        body: "Approved reply",
        triage: {
          intent: "question" as const,
          priority: "low" as const,
          confidence: 0.99,
          summary: "Question",
          unsafe: false,
        },
      },
    };
  }

  async sendAiReply(input: LiveWorkerSendAiReplyInput) {
    this.sent.push(input);
  }
}

class FakeSupabaseHandoff {
  state: Record<string, unknown> | null = null;
  issue: Record<string, unknown> | null = null;
  policy: Record<string, unknown> | null = null;
  bugCase: Record<string, unknown> | null = null;
  bugCaseEvents: Record<string, unknown>[] = [];
  notifications: Record<string, unknown>[] = [];
  messages: Record<string, unknown>[] = [];
  draftId = "draft-1";

  from(table: string) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        if (table === "conversations")
          return { data: { ai_mode: "draft" }, error: null };
        if (table === "workspaces")
          return { data: { ai_policy_json: this.policy }, error: null };
        if (table === "conversation_ai_state")
          return { data: this.state, error: null };
        if (table === "ai_drafts")
          return { data: { id: this.draftId }, error: null };
        if (table === "ai_draft_knowledge")
          return { data: { draft_id: this.draftId }, error: null };
        if (table === "issues") return { data: this.issue, error: null };
        if (table === "bug_cases") return { data: this.bugCase, error: null };
        return { data: null, error: null };
      },
      insert: (values: Record<string, unknown>) => {
        if (table === "issues")
          this.issue = { id: "issue-1", identifier: values.identifier };
        if (table === "bug_cases")
          this.bugCase = {
            id: "bug-case-1",
            issue_id: values.issue_id,
            workspace_id: values.workspace_id,
            stage: values.stage,
            duplicate_of_issue_id: null,
            ...values,
          };
        if (table === "bug_case_events") this.bugCaseEvents.push(values);
        if (table === "notifications") this.notifications.push(values);
        return builder;
      },
      update: () => builder,
      upsert: (values: Record<string, unknown>) => {
        this.state = values;
        return Promise.resolve({ error: null });
      },
      then: (
        resolve: (result: {
          data: Record<string, unknown>[];
          error: null;
        }) => unknown,
      ) =>
        Promise.resolve(
          resolve({
            data: table === "messages" ? this.messages : [],
            error: null,
          }),
        ),
      single: async () => ({
        data:
          table === "bug_cases"
            ? this.bugCase
            : (this.issue ?? { id: "issue-1", identifier: "TEC-1" }),
        error: null,
      }),
    };
    return builder;
  }

  rpc(name: string, args?: Record<string, unknown>) {
    if (name === "claim_issue_number")
      return Promise.resolve({ data: "TEC-1", error: null });
    if (name === "advance_bug_case") {
      this.bugCase = {
        ...(this.bugCase ?? {}),
        stage: args?.p_stage,
        status: args?.p_status ?? this.bugCase?.status ?? "active",
        verdict: args?.p_verdict ?? this.bugCase?.verdict ?? "pending",
        decision: args?.p_decision ?? this.bugCase?.decision ?? "pending",
        investigation_agent_run_id:
          args?.p_investigation_agent_run_id ??
          this.bugCase?.investigation_agent_run_id ??
          null,
        fix_agent_run_id:
          args?.p_fix_agent_run_id ?? this.bugCase?.fix_agent_run_id ?? null,
      };
      return Promise.resolve({ data: this.bugCase, error: null });
    }
    return Promise.resolve({ data: { inserted: true }, error: null });
  }
}

async function enqueue(
  store: InMemoryJobStore<WhatsmiauMessageJobPayload>,
  dedupeKey: string,
  maxAttempts = 3,
): Promise<JobRecord<WhatsmiauMessageJobPayload>> {
  return store.enqueue({
    type: "whatsmiau.message.received",
    payload: jobPayload(),
    dedupeKey,
    maxAttempts,
  });
}

describe("live Whatsmiau worker", () => {
  it("deduplicates coding runs by mode and recovers a completed run", async () => {
    const filters: Array<[string, unknown]> = [];
    const completedRun = {
      id: "run-fix-existing",
      workspace_id: "workspace-1",
      issue_id: "issue-1",
      repository_id: "repo-1",
      mode: "implement_fix",
      status: "completed",
      progress: 100,
      branch_name: "ops/tec-1-fix",
      commit_sha: null,
      result_json: { agent: { report: { verdict: "confirmed" } } },
      started_at: "2026-08-07T10:00:00.000Z",
      finished_at: "2026-08-07T10:01:00.000Z",
      created_by_user_id: null,
      created_at: "2026-08-07T10:00:00.000Z",
      updated_at: "2026-08-07T10:01:00.000Z",
    };
    const client = {
      from: vi.fn(() => {
        let selected = "";
        const builder = {
          select(columns: string) {
            selected = columns;
            return builder;
          },
          eq(column: string, value: unknown) {
            filters.push([column, value]);
            return builder;
          },
          in() {
            return builder;
          },
          order() {
            return builder;
          },
          limit() {
            return builder;
          },
          async maybeSingle() {
            return {
              data:
                selected === "*"
                  ? completedRun
                  : { id: completedRun.id, status: completedRun.status },
              error: null,
            };
          },
        };
        return builder;
      }),
    };
    const starter = new SupabaseCodexStarter(client as never);

    const recovered = await starter.start({
      workspaceId: "workspace-1",
      bugCaseId: "bug-case-1",
      issueId: "issue-1",
      issueIdentifier: "TEC-1",
      issueTitle: "Checkout fails",
      summary: "Checkout fails",
      customerMessage: "The checkout button does nothing.",
      mode: "implement_fix",
    });

    expect(filters).toContainEqual(["mode", "implement_fix"]);
    expect(recovered?.runId).toBe("run-fix-existing");
    await expect(recovered?.completion).resolves.toMatchObject({
      run: {
        id: "run-fix-existing",
        mode: "implement_fix",
        status: "completed",
      },
    });
  });

  it("maps repository command names to executable safe tools", () => {
    expect(repositorySafeTools(["install", "lint", "test"])).toEqual([
      { kind: "command", name: "lint" },
      { kind: "command", name: "test" },
    ]);
  });

  it("persists duplicate deliveries once and does not retrigger triage/knowledge", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const inbox = new FakeInbox();
    const knowledge = new FakeKnowledge();
    const automation = new IdempotentAutomation();
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox,
      knowledge,
      automation,
    });
    await enqueue(store, "delivery-1");
    await enqueue(store, "delivery-2");

    expect(await worker.poll()).toBe(true);
    expect(await worker.poll()).toBe(true);
    expect(await worker.poll()).toBe(true);
    expect(inbox.calls).toHaveLength(2);
    expect(automation.calls).toHaveLength(1);
    expect(knowledge.calls).toBe(1);
  });

  it("delays inbound automation jobs for the batching window", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const worker = new LiveWorker({
      jobStore: store,
      channelResolver: new FakeResolver(binding),
      inbox: new FakeInbox(),
      automation: { process: vi.fn(async () => undefined) },
    });
    await enqueue(store, "batch-window");

    expect(await worker.poll()).toBe(true);
    const stage = (await store.list()).find(
      (job) => job.type === "mend.process_inbound_message",
    );
    expect(stage?.status).toBe("queued");
    expect(
      (stage?.availableAt.getTime() ?? 0) - (stage?.createdAt.getTime() ?? 0),
    ).toBeGreaterThanOrEqual(1_300);
  });

  it("acks an event without a channel mapping and never guesses a workspace", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const inbox = new FakeInbox();
    const unmapped: string[] = [];
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(null),
      inbox,
      onUnmappedMessage: (input) =>
        unmapped.push(`${input.instanceName}:${input.providerMessageId}`),
    });
    await enqueue(store, "unmapped");

    expect(await worker.poll()).toBe(true);
    expect(inbox.calls).toHaveLength(0);
    expect(unmapped).toEqual(["mend-live:provider-1"]);
    expect((await store.list())[0].status).toBe("completed");
    expect(await store.listDeadLetters()).toHaveLength(0);
  });

  it("uses provider metadata for a group title without blocking ingestion", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const inbox = new FakeInbox();
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox,
      groupDirectory: {
        getGroupInfo: vi.fn(async () => ({
          subject: "[CAÇADOR PRO] Téchne Soluções",
        })),
      },
    });
    await store.enqueue({
      type: "whatsmiau.message.received",
      payload: {
        event: "messages.upsert",
        message: {
          ...message,
          remoteJid: "120363426966918405@g.us",
          phoneNumber: "120363426966918405",
          chatType: "group",
        },
      },
      dedupeKey: "group-title",
    });

    expect(await worker.poll()).toBe(true);
    expect(inbox.displayNames).toEqual([
      {
        context: { workspaceId: "workspace-1", actorType: "system" },
        contactId: "contact-1",
        displayName: "[CAÇADOR PRO] Téchne Soluções",
      },
    ]);
  });

  it("lets persistence errors fail the job so the store schedules a retry", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox: new FakeInbox([new Error("database temporarily unavailable")]),
    });
    await enqueue(store, "retry-me", 3);

    expect(await worker.poll()).toBe(true);
    const retried = (await store.list())[0];
    expect(retried.status).toBe("queued");
    expect(retried.attempts).toBe(1);
    expect(retried.lastError).toBe("database temporarily unavailable");
    expect(await store.listDeadLetters()).toHaveLength(0);
  });

  it("forwards issue and draft handoff results without sending anything", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const issues: string[] = [];
    const drafts: string[] = [];
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox: new FakeInbox(),
      automation: new ResultAutomation(),
      onIssueReady: (issue) => {
        issues.push(issue.identifier);
      },
      onDraftReady: (draft) => {
        drafts.push(draft.body);
      },
    });
    await enqueue(store, "result");
    await worker.poll();
    await worker.poll();
    expect(issues).toEqual(["TEC-1"]);
    expect(drafts).toEqual(["Draft only"]);
  });

  it("keeps AI sending as a separate idempotent worker stage", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const automation = new SendStageAutomation();
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox: new FakeInbox(),
      automation,
    });
    await enqueue(store, "send-stage");
    await worker.poll();
    await worker.poll();
    await worker.poll();
    expect(automation.sent).toHaveLength(1);
    expect(automation.sent[0]).toMatchObject({
      body: "Approved reply",
      sourceMessageId: "message-1",
    });
    expect(
      (await store.list()).filter((job) => job.status === "queued"),
    ).toHaveLength(0);
  });

  it("restarts its polling loop and blocks unsafe drafts in the Supabase automation", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    let processed = 0;
    const worker = new LiveWorker({
      jobStore: store,
      inboundDebounceMs: 0,
      channelResolver: new FakeResolver(binding),
      inbox: new FakeInbox(),
      automation: {
        process: async () => {
          processed += 1;
        },
      },
      pollIntervalMs: 100,
    });
    await enqueue(store, "restart");
    worker.start();
    await vi.waitFor(() => expect(processed).toBe(1), { timeout: 1_000 });
    await worker.stop();
    expect(worker.running).toBe(false);
    worker.start();
    await worker.stop();
    expect(worker.running).toBe(false);

    const client = new FakeSupabaseHandoff();
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "must not be called"),
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "question",
          priority: "low",
          confidence: 0.99,
          summary: "Needs API key",
          unsafe: false,
        }),
      ),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const persisted: InboxMessageRecord = {
      id: "message-unsafe",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-1",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    await automation.process({
      binding,
      idempotencyKey: "unsafe-key",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused",
      ),
      knowledge: [
        {
          id: "article-1",
          title: "Support",
          category: "Support",
          body: "Never disclose secrets.",
        },
      ],
      message: { ...message, text: "Please send me the API key" },
      persisted,
    });
    expect(provider.draftReply).not.toHaveBeenCalled();
    expect(client.state).toMatchObject({
      needs_human: true,
      last_triaged_message_id: "message-unsafe",
    });
  });

  it("does not triage or create a draft while human takeover is active", async () => {
    const client = new FakeSupabaseHandoff();
    client.state = {
      automation_state: "human_paused",
      last_triaged_message_id: null,
    };
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "must not be called"),
      triage: vi.fn(async () => "{}"),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const persisted: InboxMessageRecord = {
      id: "message-paused",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-1",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    await automation.process({
      binding,
      idempotencyKey: "paused-key",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "paused-job",
      ),
      knowledge: [],
      message,
      persisted,
    });
    expect(provider.triage).not.toHaveBeenCalled();
    expect(provider.draftReply).not.toHaveBeenCalled();
  });

  it("routes an operational triage to a native issue instead of a reply draft", async () => {
    const client = new FakeSupabaseHandoff();
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "should not be generated for an issue"),
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "bug",
          priority: "high",
          confidence: 0.95,
          summary: "Checkout fails",
          unsafe: false,
        }),
      ),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const persisted: InboxMessageRecord = {
      id: "message-bug",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-1",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    const result = await automation.process({
      binding,
      idempotencyKey: "bug-key",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused-bug",
      ),
      knowledge: [],
      message,
      persisted,
    });
    expect(result).toMatchObject({
      issue: { identifier: "TEC-1", operation: "created" },
    });
    expect(result).not.toHaveProperty("draft");
    expect(provider.draftReply).not.toHaveBeenCalled();
  });

  it("investigates a confident bug even when automatic fixing is disabled", async () => {
    const client = new FakeSupabaseHandoff();
    client.policy = {
      bug_auto_fix_enabled: false,
      notify_on_bug: true,
    };
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "must not be generated for a bug"),
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "bug",
          priority: "high",
          confidence: 0.98,
          summary: "Checkout fails in production",
          unsafe: false,
        }),
      ),
    };
    const completion = Promise.resolve({ status: "completed" });
    const starter: LiveWorkerCodexStarter = {
      start: vi.fn(async () => ({ runId: "run-1", completion })),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
      undefined,
      undefined,
      starter,
    );
    const persisted: InboxMessageRecord = {
      id: "message-auto-fix",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-1",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    await automation.process({
      binding,
      idempotencyKey: "bug-auto-fix",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused-auto-fix",
      ),
      knowledge: [],
      message,
      persisted,
    });
    await vi.waitFor(() =>
      expect(client.notifications.map((item) => item.kind)).toEqual(
        expect.arrayContaining(["ai.agent_started", "ai.agent_ready"]),
      ),
    );
    expect(starter.start).toHaveBeenCalledWith(
      expect.objectContaining({
        bugCaseId: "bug-case-1",
        issueIdentifier: "TEC-1",
      }),
    );
    expect(client.bugCase).toMatchObject({
      stage: "decision",
      status: "awaiting_human",
      verdict: "needs_human",
      decision: "notify",
    });
  });

  it("starts a separate implement run after a confirmed investigation", async () => {
    const client = new FakeSupabaseHandoff();
    client.policy = {
      bug_auto_fix_enabled: true,
      notify_on_bug: true,
      allowed_actions: [
        "respond",
        "triage",
        "create_issue",
        "investigate",
        "propose_fix",
        "implement_fix",
      ],
    };
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "unused"),
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "bug",
          priority: "high",
          confidence: 0.99,
          summary: "Checkout fails in production",
          unsafe: false,
        }),
      ),
    };
    const start = vi
      .fn()
      .mockResolvedValueOnce({
        runId: "run-investigate",
        completion: Promise.resolve({
          run: {
            result: {
              provider: "anthropic",
              agent: {
                report: {
                  verdict: "confirmed",
                  summary: "A missing guard reproduces the complaint.",
                  evidence: [{ kind: "test" }],
                },
              },
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        runId: "run-fix",
        completion: Promise.resolve({ status: "completed" }),
      });
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
      undefined,
      undefined,
      { start },
    );
    await automation.process({
      binding,
      idempotencyKey: "confirmed-auto-fix",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "confirmed-auto-fix-job",
      ),
      knowledge: [],
      message,
      persisted: {
        id: "message-confirmed-fix",
        workspaceId: binding.workspaceId,
        conversationId: "conversation-1",
        contactId: "contact-1",
        providerMessageId: message.providerMessageId,
        direction: "inbound",
        messageType: "text",
        unreadCount: 1,
        inserted: true,
      },
    });

    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(start.mock.calls[0]?.[0]).toMatchObject({ mode: "investigate" });
    expect(start.mock.calls[1]?.[0]).toMatchObject({
      mode: "implement_fix",
      bugCaseId: "bug-case-1",
    });
    await vi.waitFor(() =>
      expect(client.bugCase).toMatchObject({
        stage: "verification",
        status: "awaiting_human",
        verdict: "confirmed",
        decision: "autofix",
        fix_agent_run_id: "run-fix",
      }),
    );
  });

  it("answers a known question without creating an issue", async () => {
    const client = new FakeSupabaseHandoff();
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply: vi.fn(async () => "O preço está no artigo publicado."),
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "billing",
          priority: "low",
          confidence: 0.98,
          summary: "Customer asks about ZeloPDV pricing",
          unsafe: false,
        }),
      ),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const persisted: InboxMessageRecord = {
      id: "message-price",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-price",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    const result = await automation.process({
      binding,
      idempotencyKey: "price-key",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused-price",
      ),
      knowledge: [
        {
          id: "article-price",
          title: "Preço e planos do ZeloPDV",
          category: "Comercial",
          body: "Consulte os preços e planos do ZeloPDV.",
        },
      ],
      message: { ...message, text: "Qual o preço do ZeloPDV?" },
      persisted,
    });
    expect(result).toMatchObject({
      draft: { knowledgeArticleIds: ["article-price"] },
    });
    expect(client.issue).toBeNull();
    expect(client.notifications).toEqual([]);
  });

  it("drafts an unanswered question without escalating it", async () => {
    const client = new FakeSupabaseHandoff();
    client.messages = [
      {
        id: "message-later",
        direction: "inbound",
        text: "Esta mensagem chegou enquanto a IA processava.",
        caption: null,
        created_at: new Date(Date.now() + 5_000).toISOString(),
      },
      {
        id: "message-unknown",
        direction: "inbound",
        text: "Como funciona a integração de estoque?",
        caption: null,
        created_at: new Date(Date.now() - 1_000).toISOString(),
      },
      {
        id: "message-context",
        direction: "outbound",
        text: "Nosso estoque é sincronizado pelo ERP.",
        caption: null,
        created_at: new Date(Date.now() - 2_000).toISOString(),
      },
    ];
    const draftReply = vi.fn(
      async () => "I will check that and get back to you.",
    );
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply,
      triage: vi.fn(async () =>
        JSON.stringify({
          intent: "question",
          priority: "low",
          confidence: 0.98,
          summary: "Customer asks about an undocumented product",
          unsafe: false,
        }),
      ),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const persisted: InboxMessageRecord = {
      id: "message-unknown",
      workspaceId: binding.workspaceId,
      conversationId: "conversation-unknown",
      contactId: "contact-1",
      providerMessageId: message.providerMessageId,
      direction: "inbound",
      messageType: "text",
      unreadCount: 1,
      inserted: true,
    };
    const result = await automation.process({
      binding,
      idempotencyKey: "unknown-key",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused-unknown",
      ),
      knowledge: [
        {
          id: "article-price",
          title: "Preço e planos do ZeloPDV",
          category: "Comercial",
          body: "Consulte os preços e planos do ZeloPDV.",
        },
      ],
      message: { ...message, text: "Como funciona a integração de estoque?" },
      persisted,
    });
    expect(result).toMatchObject({
      draft: {
        conversationId: "conversation-unknown",
      },
    });
    expect(client.issue).toBeNull();
    expect(client.notifications).toEqual([]);
    expect(draftReply).toHaveBeenCalledWith(
      expect.stringContaining(
        '"direction":"outbound","text":"Nosso estoque é sincronizado pelo ERP."',
      ),
      expect.any(String),
      "pt-BR",
    );
    expect(draftReply.mock.calls[0]?.[0]).toContain(
      '"reply_target":{"id":"message-unknown","direction":"inbound"',
    );
    expect(draftReply.mock.calls[0]?.[0]).not.toContain("message-later");
  });

  it("batches consecutive inbound messages into one AI reply", async () => {
    const client = new FakeSupabaseHandoff();
    const triageInput = vi.fn();
    const draftReply = vi.fn(
      async () => "Perfeito, vou considerar as duas mensagens.",
    );
    client.messages = [
      {
        id: "message-second",
        direction: "inbound",
        text: "Obrigada",
        caption: null,
        created_at: new Date(Date.now() - 100).toISOString(),
      },
      {
        id: "message-first",
        direction: "inbound",
        text: "Vou fazer o teste agora",
        caption: null,
        created_at: new Date(Date.now() - 200).toISOString(),
      },
    ];
    const provider: SupportAiProvider = {
      name: "openai",
      draftReply,
      triage: vi.fn(async (input) => {
        triageInput(input);
        return JSON.stringify({
          intent: "question",
          priority: "low",
          confidence: 0.98,
          summary: "Customer confirms a test and thanks the team",
          unsafe: false,
        });
      }),
    };
    const automation = new SupabaseLiveWorkerAutomation(
      client as never,
      provider,
    );
    const result = await automation.process({
      binding,
      idempotencyKey: "whatsapp:channel-1:message-first",
      job: await enqueue(
        new InMemoryJobStore<WhatsmiauMessageJobPayload>(),
        "unused-batch",
      ),
      knowledge: [],
      message: { ...message, text: "Vou fazer o teste agora" },
      persisted: {
        id: "message-first",
        workspaceId: binding.workspaceId,
        conversationId: "conversation-batch",
        contactId: "contact-1",
        providerMessageId: message.providerMessageId,
        direction: "inbound",
        messageType: "text",
        unreadCount: 2,
        inserted: true,
      },
    });

    expect(result).toMatchObject({
      draft: {
        messageId: "message-second",
        idempotencyKey: "whatsapp:channel-1:message-second",
      },
    });
    expect(triageInput).toHaveBeenCalledWith(
      expect.stringContaining("Vou fazer o teste agora\nObrigada"),
    );
    expect(draftReply).toHaveBeenCalledTimes(1);
    expect(draftReply.mock.calls[0]?.[0]).toContain(
      '"reply_target":{"id":"message-second","direction":"inbound"',
    );
    expect(draftReply.mock.calls[0]?.[0]).toContain("Vou fazer o teste agora");
    expect(draftReply.mock.calls[0]?.[0]).toContain("Obrigada");
  });
});
