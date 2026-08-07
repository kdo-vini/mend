import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSupabaseApiAdapters,
  type WhatsmiauProviderPort,
} from "./supabase-api-adapters.js";
import { issueCreateSchema } from "./issue-service.js";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const conversationId = "44444444-4444-4444-8444-444444444444";

class FakeQuery implements PromiseLike<Result> {
  private filters: Array<{ kind: string; column?: string; value?: unknown }> =
    [];
  private operation: "select" | "insert" | "update" | "delete" | "upsert" =
    "select";
  private payload: unknown;
  private singleResult = false;
  private limitValue?: number;
  private orderColumn?: string;
  private ascending = true;

  constructor(
    private readonly client: FakeClient,
    private readonly table: string,
  ) {}

  select(_columns = "*") {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ kind: "in", column, value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ kind: "lt", column, value });
    return this;
  }
  gt(column: string, value: unknown) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }
  ilike(column: string, value: unknown) {
    this.filters.push({ kind: "ilike", column, value });
    return this;
  }
  or(_value: string) {
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderColumn = column;
    this.ascending = options.ascending ?? true;
    return this;
  }
  limit(value: number) {
    this.limitValue = value;
    return this;
  }
  maybeSingle() {
    this.singleResult = true;
    return this;
  }
  single() {
    this.singleResult = true;
    return this;
  }
  insert(value: unknown) {
    this.operation = "insert";
    this.payload = value;
    return this;
  }
  upsert(value: unknown) {
    this.operation = "upsert";
    this.payload = value;
    return this;
  }
  update(value: unknown) {
    this.operation = "update";
    this.payload = value;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private matches(row: Row): boolean {
    return this.filters.every((filter) => {
      const actual = row[filter.column ?? ""];
      if (filter.kind === "eq") return actual === filter.value;
      if (filter.kind === "in")
        return Array.isArray(filter.value) && filter.value.includes(actual);
      if (filter.kind === "lt")
        return String(actual ?? "") < String(filter.value ?? "");
      if (filter.kind === "gt")
        return String(actual ?? "") > String(filter.value ?? "");
      if (filter.kind === "ilike")
        return String(actual ?? "")
          .toLowerCase()
          .includes(
            String(filter.value ?? "")
              .replaceAll("%", "")
              .toLowerCase(),
          );
      return true;
    });
  }

  private run(): Result {
    this.client.calls.push({
      table: this.table,
      operation: this.operation,
      filters: [...this.filters],
    });
    const rows = this.client.rows.get(this.table) ?? [];
    let selected = rows.filter((row) => this.matches(row));
    if (this.operation === "insert" || this.operation === "upsert") {
      const values = Array.isArray(this.payload)
        ? this.payload
        : [this.payload];
      const inserted = values.map((value, index) => ({
        ...(value as Row),
        id:
          (value as Row).id ??
          `${this.table}-${this.client.sequence++}-${index}`,
        created_at: (value as Row).created_at ?? "2026-01-01T00:00:00.000Z",
        updated_at: (value as Row).updated_at ?? "2026-01-01T00:00:00.000Z",
      }));
      rows.push(...inserted);
      selected = inserted;
    } else if (this.operation === "update") {
      selected = selected.map((row) => Object.assign(row, this.payload as Row));
    } else if (this.operation === "delete") {
      const deleted = selected.slice();
      this.client.rows.set(
        this.table,
        rows.filter((row) => !this.matches(row)),
      );
      selected = deleted;
    }
    if (this.orderColumn)
      selected.sort((left, right) => {
        const a = String(left[this.orderColumn ?? ""] ?? "");
        const b = String(right[this.orderColumn ?? ""] ?? "");
        return a.localeCompare(b) * (this.ascending ? 1 : -1);
      });
    if (this.limitValue !== undefined)
      selected = selected.slice(0, this.limitValue);
    return {
      data: this.singleResult ? (selected[0] ?? null) : selected,
      error: null,
    };
  }
}

class FakeClient {
  readonly rows = new Map<string, Row[]>();
  readonly calls: Array<{
    table: string;
    operation: string;
    filters: Array<{ kind: string; column?: string; value?: unknown }>;
  }> = [];
  readonly rpcCalls: Array<{ name: string; args: Row }> = [];
  readonly uploads: Array<{
    path: string;
    data: Uint8Array;
    contentType?: string;
  }> = [];
  readonly storage = {
    from: (_bucket: string) => ({
      upload: async (
        path: string,
        data: Uint8Array,
        options: { contentType?: string },
      ) => {
        this.uploads.push({ path, data, contentType: options.contentType });
        return { data: { path }, error: null };
      },
      createSignedUrl: async (path: string, _expires: number) => ({
        data: {
          signedUrl: `https://signed.example.test/${encodeURIComponent(path)}`,
        },
        error: null,
      }),
    }),
  };
  sequence = 1;
  rpcResults = new Map<string, unknown>();

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed))
      this.rows.set(
        table,
        rows.map((row) => ({ ...row })),
      );
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
  rpc(name: string, args: Row) {
    this.rpcCalls.push({ name, args });
    return Promise.resolve({
      data: this.rpcResults.get(name) ?? {},
      error: null,
    });
  }
}

const fakeProvider = (): WhatsmiauProviderPort => ({
  createInstance: async (input) => ({
    instanceName: input.instanceName,
    state: "closed",
  }),
  connectInstance: async () => ({ qrcode: "qr" }),
  getQrCode: async () => Buffer.from("qr"),
  getConnectionState: async () => ({ state: "open" }),
  disconnect: async () => undefined,
  sendText: async () => ({ key: { id: "provider-message-1" } }),
  sendMedia: async () => ({ key: { id: "provider-message-2" } }),
  sendAudio: async () => ({ key: { id: "provider-message-3" } }),
  markAsRead: async () => undefined,
});

function adapters(
  client: FakeClient,
  whatsMiau: WhatsmiauProviderPort = fakeProvider(),
) {
  return createSupabaseApiAdapters({
    client: client as unknown as SupabaseClient,
    whatsMiau,
    aiProvider: {
      name: "openai",
      draftReply: async () => "draft",
      triage: async () => "{}",
    },
  });
}

describe("Supabase API adapters", () => {
  it("does not resolve an auto-fix case before a healthy deployment", async () => {
    const client = new FakeClient({
      issues: [
        {
          id: "issue-health-gate",
          workspace_id: workspaceId,
          identifier: "MEND-HEALTH",
          conversation_id: null,
          customer_notified_at: null,
          status: "in_progress",
        },
      ],
      bug_cases: [
        {
          id: "bug-case-health-gate",
          workspace_id: workspaceId,
          issue_id: "issue-health-gate",
          stage: "health_check",
          decision: "autofix",
          health_status: "unhealthy",
          customer_response_status: "pending",
        },
      ],
    });
    const dependencies = adapters(client);

    await expect(
      dependencies.issues.resolveAndNotify(
        { userId, workspaceId, role: "agent" },
        "MEND-HEALTH",
        { notifyCustomer: true, message: "The fix is live." },
      ),
    ).rejects.toThrow("bug_loop_health_required:health_check:unhealthy");
    expect(client.rows.get("issues")?.[0]?.status).toBe("in_progress");
  });

  it("does not delete inbound messages for everyone", async () => {
    const deleteMessageForEveryone = vi.fn(async () => undefined);
    const provider = {
      ...fakeProvider(),
      deleteMessageForEveryone,
    };
    const client = new FakeClient({
      messages: [
        {
          id: "message-inbound",
          workspace_id: workspaceId,
          conversation_id: conversationId,
          provider_message_id: "provider-inbound",
          direction: "inbound",
          is_deleted: false,
        },
      ],
    });

    await expect(
      adapters(client, provider).conversations.deleteMessage(
        { workspaceId, userId, role: "agent" },
        conversationId,
        "message-inbound",
      ),
    ).resolves.toBeNull();
    expect(deleteMessageForEveryone).not.toHaveBeenCalled();
    expect(client.rows.get("messages")).toEqual(
      expect.arrayContaining([expect.objectContaining({ is_deleted: false })]),
    );
  });

  it("keeps membership and workspace reads scoped to the requested user/workspace", async () => {
    const client = new FakeClient({
      workspace_members: [
        {
          workspace_id: workspaceId,
          user_id: userId,
          role: "agent",
          workspaces: { id: workspaceId, name: "Mend" },
        },
      ],
      workspaces: [
        { id: workspaceId, name: "Mend", slug: "mend", issue_prefix: "MEN" },
      ],
    });
    const dependencies = adapters(client);
    await expect(
      dependencies.membership.getMembership(userId, workspaceId),
    ).resolves.toEqual({ workspaceId, role: "agent" });
    await expect(
      dependencies.workspaces.get(
        { userId, workspaceId, role: "agent" },
        otherWorkspaceId,
      ),
    ).resolves.toBeNull();
    await expect(dependencies.workspaces.list(userId)).resolves.toEqual([
      {
        id: workspaceId,
        name: "Mend",
        slug: "",
        issuePrefix: "MEND",
        timezone: "UTC",
        defaultLanguage: "en-US",
        createdAt: null,
        updatedAt: null,
        role: "agent",
      },
    ]);
    expect(
      client.calls.some(
        (call) =>
          call.table === "workspace_members" &&
          call.filters.some(
            (filter) => filter.column === "user_id" && filter.value === userId,
          ),
      ),
    ).toBe(true);
  });

  it("uses the create_workspace RPC instead of trusting a client-supplied owner", async () => {
    const client = new FakeClient();
    client.rpcResults.set("create_workspace", {
      id: workspaceId,
      name: "Techne",
      slug: "techne",
      issue_prefix: "TEC",
    });
    const dependencies = adapters(client);
    await expect(
      dependencies.workspaces.create(userId, {
        name: "Techne",
        slug: "techne",
        issuePrefix: "TEC",
        timezone: "UTC",
        defaultLanguage: "pt-BR",
      }),
    ).resolves.toMatchObject({ id: workspaceId, role: "owner" });
    expect(client.rpcCalls).toEqual([
      {
        name: "create_workspace",
        args: {
          p_name: "Techne",
          p_slug: "techne",
          p_issue_prefix: "TEC",
          p_timezone: "UTC",
          p_default_language: "pt-BR",
        },
      },
    ]);
  });

  it("keeps member and audit reads explicitly scoped to the request workspace", async () => {
    const client = new FakeClient({
      workspace_members: [
        {
          id: "member-1",
          workspace_id: workspaceId,
          user_id: userId,
          role: "agent",
        },
        {
          id: "member-2",
          workspace_id: otherWorkspaceId,
          user_id: userId,
          role: "owner",
        },
      ],
      audit_log: [
        {
          id: "audit-1",
          workspace_id: workspaceId,
          action: "issue.created",
          entity_type: "issue",
          metadata_json: {},
        },
        {
          id: "audit-2",
          workspace_id: otherWorkspaceId,
          action: "secret",
          entity_type: "issue",
          metadata_json: {},
        },
      ],
    });
    client.rpcResults.set("list_workspace_members_with_email", [
      {
        id: "member-1",
        workspace_id: workspaceId,
        user_id: userId,
        role: "agent",
        display_name: "Agent",
        email: "agent@example.com",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const dependencies = adapters(client);
    const context = { userId, workspaceId, role: "owner" as const };
    await expect(
      dependencies.workspaces.listMembers(context, { limit: 20 }),
    ).resolves.toEqual([
      expect.objectContaining({ workspaceId, userId, role: "agent" }),
    ]);
    await expect(
      dependencies.workspaces.listAuditLog(context, { limit: 20 }),
    ).resolves.toEqual([
      expect.objectContaining({ workspaceId, action: "issue.created" }),
    ]);
    expect(
      client.calls
        .filter(
          (call) =>
            call.table === "workspace_members" || call.table === "audit_log",
        )
        .every((call) =>
          call.filters.some(
            (filter) =>
              filter.column === "workspace_id" && filter.value === workspaceId,
          ),
        ),
    ).toBe(true);
  });

  it("maps an issue through claim_issue_number and keeps the insert in the request workspace", async () => {
    const client = new FakeClient({
      issues: [],
      labels: [],
      issue_labels: [],
      issue_comments: [],
      evidence: [],
      timeline_events: [],
    });
    client.rpcResults.set("claim_issue_number", "TEC-42");
    const dependencies = adapters(client);
    const input = issueCreateSchema.parse({
      title: "Checkout fails",
      type: "bug",
      labels: [],
    });
    const result = await dependencies.issues.create(
      { userId, workspaceId, role: "agent" },
      input,
    );
    expect(result).toMatchObject({
      identifier: "TEC-42",
      number: 42,
      title: "Checkout fails",
      workspaceId,
    });
    expect(client.rows.get("issues")).toHaveLength(1);
    expect(client.rows.get("issues")?.[0]).toMatchObject({
      workspace_id: workspaceId,
      number: 42,
      identifier: "TEC-42",
      created_by_user_id: userId,
    });
    expect(client.rpcCalls[0]).toEqual({
      name: "claim_issue_number",
      args: { target_workspace_id: workspaceId },
    });
  });

  it("applies relation-backed issue filters inside the workspace scope", async () => {
    const client = new FakeClient({
      issues: [
        {
          id: "issue-1",
          workspace_id: workspaceId,
          identifier: "TEC-1",
          title: "Checkout",
          type: "bug",
          source: "conversation",
          contact_id: "contact-1",
          conversation_id: conversationId,
        },
        {
          id: "issue-2",
          workspace_id: otherWorkspaceId,
          identifier: "OTH-1",
          title: "Other",
          type: "bug",
          source: "conversation",
        },
      ],
      labels: [{ id: "label-1", workspace_id: workspaceId, name: "checkout" }],
      issue_labels: [{ issue_id: "issue-1", label_id: "label-1" }],
      coding_runs: [{ issue_id: "issue-1", workspace_id: workspaceId }],
    });
    const dependencies = adapters(client);
    const result = await dependencies.issues.list(
      { userId, workspaceId, role: "agent" },
      {
        limit: 20,
        type: "bug",
        source: "conversation",
        label: "checkout",
        contactId: "contact-1",
        conversationId,
        hasCodex: true,
      } as never,
    );
    expect(result).toEqual([
      expect.objectContaining({ id: "issue-1", workspaceId }),
    ]);
    expect(
      client.calls.find(
        (call) => call.table === "issues" && call.operation === "select",
      )?.filters,
    ).toEqual(
      expect.arrayContaining([
        { kind: "eq", column: "workspace_id", value: workspaceId },
      ]),
    );
  });

  it("uses inbox_set_conversation_state for snooze and never drops the workspace id", async () => {
    const client = new FakeClient({
      conversations: [
        {
          id: conversationId,
          workspace_id: workspaceId,
          status: "open",
          attention_state: "needs_attention",
          ai_mode: "draft",
          unread_count: 1,
          contact: {
            id: "contact-1",
            phone_number: "5511999999999",
            display_name: "Customer",
          },
          channel: {
            id: "channel-1",
            provider: "whatsmiau",
            name: "Support",
            provider_instance_name: "instance-1",
            status: "open",
          },
        },
      ],
      messages: [],
    });
    client.rpcResults.set("inbox_set_conversation_state", {
      id: conversationId,
      workspace_id: workspaceId,
      status: "snoozed",
      attention_state: "none",
      unread_count: 1,
      snoozed_until: "2099-01-01T00:00:00.000Z",
    });
    const dependencies = adapters(client);
    await dependencies.conversations.snooze(
      { userId, workspaceId, role: "agent" },
      conversationId,
      { until: "2099-01-01T00:00:00.000Z" },
    );
    expect(client.rpcCalls).toContainEqual(
      expect.objectContaining({
        name: "inbox_set_conversation_state",
        args: expect.objectContaining({
          p_workspace_id: workspaceId,
          p_conversation_id: conversationId,
          p_action: "snooze",
        }),
      }),
    );
  });

  it("filters knowledge articles by workspace and status before they can ground AI", async () => {
    const client = new FakeClient({
      knowledge_articles: [
        {
          id: "article-1",
          workspace_id: workspaceId,
          title: "Published",
          category: "Support",
          body: "Use the runbook.",
          status: "published",
        },
        {
          id: "article-2",
          workspace_id: workspaceId,
          title: "Draft",
          category: "Support",
          body: "Not ready.",
          status: "draft",
        },
        {
          id: "article-3",
          workspace_id: otherWorkspaceId,
          title: "Other",
          category: "Support",
          body: "Other tenant.",
          status: "published",
        },
      ],
    });
    const dependencies = adapters(client);
    await expect(
      dependencies.knowledge.list(
        { userId, workspaceId, role: "agent" },
        { status: "published", limit: 20 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "article-1",
        workspaceId,
        title: "Published",
      }),
    ]);
  });

  it("does not send a localhost webhook URL to Whatsmiau during local setup", async () => {
    const client = new FakeClient({ channel_connections: [] });
    const provider = fakeProvider();
    const createInput: Array<Record<string, unknown>> = [];
    const originalCreate = provider.createInstance;
    provider.createInstance = async (input) => {
      createInput.push(input);
      return originalCreate(input);
    };
    const previousBaseUrl = process.env.APP_BASE_URL;
    const previousSecret = process.env.WHATSMIAU_WEBHOOK_SECRET;
    const previousWebhookUrl = process.env.WHATSMIAU_WEBHOOK_URL;
    process.env.APP_BASE_URL = "http://localhost:5173";
    process.env.WHATSMIAU_WEBHOOK_SECRET = "test-secret";
    delete process.env.WHATSMIAU_WEBHOOK_URL;

    try {
      const dependencies = createSupabaseApiAdapters({
        client: client as unknown as SupabaseClient,
        whatsMiau: provider,
        aiProvider: {
          name: "openai",
          draftReply: async () => "draft",
          triage: async () => "{}",
        },
      });
      await expect(
        dependencies.channels.createWhatsmiau(
          { userId, workspaceId, role: "agent" },
          { name: "Support", providerInstanceName: "mend-local" },
        ),
      ).resolves.toMatchObject({
        name: "Support",
        providerInstanceName: "mend-local",
      });
      expect(createInput).toEqual([
        { instanceName: "mend-local", qrcode: true, syncFullHistory: true },
      ]);
    } finally {
      if (previousBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previousBaseUrl;
      if (previousSecret === undefined)
        delete process.env.WHATSMIAU_WEBHOOK_SECRET;
      else process.env.WHATSMIAU_WEBHOOK_SECRET = previousSecret;
      if (previousWebhookUrl === undefined)
        delete process.env.WHATSMIAU_WEBHOOK_URL;
      else process.env.WHATSMIAU_WEBHOOK_URL = previousWebhookUrl;
    }
  });

  it("treats repeated channel setup as idempotent within the workspace", async () => {
    const client = new FakeClient({
      channel_connections: [
        {
          id: "channel-existing",
          workspace_id: workspaceId,
          provider: "whatsmiau",
          name: "Support",
          provider_instance_name: "mend-existing",
          status: "open",
        },
      ],
    });
    const provider = fakeProvider();
    const create = vi.fn(provider.createInstance);
    provider.createInstance = create;
    const dependencies = createSupabaseApiAdapters({
      client: client as unknown as SupabaseClient,
      whatsMiau: provider,
      aiProvider: {
        name: "openai",
        draftReply: async () => "draft",
        triage: async () => "{}",
      },
    });

    await expect(
      dependencies.channels.createWhatsmiau(
        { userId, workspaceId, role: "agent" },
        { name: "Renamed support", providerInstanceName: "mend-existing" },
      ),
    ).resolves.toMatchObject({
      id: "channel-existing",
      name: "Support",
      providerInstanceName: "mend-existing",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("merges support flow settings without dropping existing channel settings", async () => {
    const client = new FakeClient({
      channel_connections: [
        {
          id: "channel-settings",
          workspace_id: workspaceId,
          settings_json: {
            aiPolicy: { mode: "safe_auto" },
            timezone: "America/Sao_Paulo",
          },
        },
      ],
    });
    const dependencies = adapters(client);

    await dependencies.channels.updateSettings(
      { userId, workspaceId, role: "admin" },
      "channel-settings",
      { supportFlow: { enabled: true } },
    );

    expect(client.rows.get("channel_connections")?.[0].settings_json).toEqual({
      aiPolicy: { mode: "safe_auto" },
      timezone: "America/Sao_Paulo",
      supportFlow: { enabled: true },
    });
  });

  it("repairs an existing channel webhook during setup, connect and refresh", async () => {
    const client = new FakeClient({
      channel_connections: [
        {
          id: "channel-existing",
          workspace_id: workspaceId,
          provider: "whatsmiau",
          name: "Support",
          provider_instance_name: "mend-existing",
          status: "open",
        },
      ],
    });
    const provider = fakeProvider();
    const configureWebhook = vi.fn(async () => undefined);
    provider.configureWebhook = configureWebhook;
    const previousSecret = process.env.WHATSMIAU_WEBHOOK_SECRET;
    const previousWebhookUrl = process.env.WHATSMIAU_WEBHOOK_URL;
    process.env.WHATSMIAU_WEBHOOK_SECRET = "test-secret";
    process.env.WHATSMIAU_WEBHOOK_URL =
      "https://hooks.example.test/mend/webhooks/whatsmiau";

    try {
      const dependencies = createSupabaseApiAdapters({
        client: client as unknown as SupabaseClient,
        whatsMiau: provider,
        aiProvider: {
          name: "openai",
          draftReply: async () => "draft",
          triage: async () => "{}",
        },
      });
      const context = { userId, workspaceId, role: "agent" as const };

      await dependencies.channels.createWhatsmiau(context, {
        name: "Renamed support",
        providerInstanceName: "mend-existing",
      });
      await dependencies.channels.connect(context, "channel-existing");
      await dependencies.channels.refresh(context, "channel-existing");

      expect(configureWebhook).toHaveBeenCalledTimes(3);
      expect(configureWebhook).toHaveBeenCalledWith({
        instanceName: "mend-existing",
        url: "https://hooks.example.test/mend/webhooks/whatsmiau",
        secret: "test-secret",
      });
    } finally {
      if (previousSecret === undefined)
        delete process.env.WHATSMIAU_WEBHOOK_SECRET;
      else process.env.WHATSMIAU_WEBHOOK_SECRET = previousSecret;
      if (previousWebhookUrl === undefined)
        delete process.env.WHATSMIAU_WEBHOOK_URL;
      else process.env.WHATSMIAU_WEBHOOK_URL = previousWebhookUrl;
    }
  });

  it("accepts a bounded browser data URL, stores it privately, and sends only an expiring provider URL", async () => {
    const client = new FakeClient({
      conversations: [
        {
          id: conversationId,
          workspace_id: workspaceId,
          channel_connection_id: "channel-1",
          contact_id: "contact-1",
          status: "open",
        },
      ],
      contacts: [
        {
          id: "contact-1",
          workspace_id: workspaceId,
          phone_number: "5511999999999",
          display_name: "Customer",
        },
      ],
      channel_connections: [
        {
          id: "channel-1",
          workspace_id: workspaceId,
          provider_instance_name: "mend-main",
          status: "open",
        },
      ],
      messages: [],
    });
    const provider = fakeProvider();
    const sendMedia = vi.fn(provider.sendMedia);
    provider.sendMedia = sendMedia;
    const dependencies = createSupabaseApiAdapters({
      client: client as unknown as SupabaseClient,
      whatsMiau: provider,
      aiProvider: {
        name: "openai",
        draftReply: async () => "draft",
        triage: async () => "{}",
      },
    });

    await dependencies.conversations.sendMessage(
      { userId, workspaceId, role: "agent" },
      conversationId,
      {
        messageType: "image",
        mediaDataUrl: "data:image/png;base64,aGVsbG8=",
        fileName: "hello.png",
        mimeType: "image/png",
      },
    );

    expect(client.uploads).toHaveLength(1);
    expect(client.uploads[0]).toMatchObject({
      path: expect.stringMatching(
        new RegExp(`^${workspaceId}/${conversationId}/`),
      ),
      contentType: "image/png",
    });
    expect(sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        media: expect.stringContaining("https://signed.example.test/"),
      }),
    );
    expect(sendMedia.mock.calls[0]?.[0].media).not.toContain("data:image/png");
  });
});
