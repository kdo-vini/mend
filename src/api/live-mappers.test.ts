import { describe, expect, it } from "vitest";
import {
  toUiBugCase,
  toUiConversation,
  toUiMessage,
  toUiRun,
} from "./live-mappers";
import type {
  BugCaseEventRecord,
  BugCaseRecord,
  CodingRunRecord,
  ConversationRecord,
  MessageRecord,
} from "./workspace-data";

const baseMessage: MessageRecord = {
  id: "message-1",
  workspace_id: "workspace-1",
  channel_connection_id: "channel-1",
  conversation_id: "conversation-1",
  provider_message_id: "provider-1",
  participant_name: null,
  direction: "inbound",
  sender_type: "contact",
  message_type: "image",
  text: null,
  caption: "Screenshot",
  media_storage_path: null,
  media_asset_id: null,
  media_batch_id: null,
  media_error_code: null,
  media_status: "none",
  media_remote_url: "https://cdn.example.com/screenshot.png",
  origin: "whatsapp",
  mime_type: "image/png",
  file_name: "screenshot.png",
  file_size: 1024,
  duration_seconds: null,
  quoted_message_id: "message-0",
  ai_generated: false,
  read_at: null,
  sent_by_user_id: null,
  provider_status: "delivered",
  provider_timestamp: "2026-08-03T20:00:00.000Z",
  is_deleted: false,
  created_at: "2026-08-03T20:00:00.000Z",
  updated_at: "2026-08-03T20:00:00.000Z",
};

describe("live message mapper", () => {
  it("preserves media, reply and deletion metadata for the inbox", () => {
    const message = toUiMessage(baseMessage);
    expect(message.attachment).toEqual({
      name: "screenshot.png",
      meta: "image/png",
      url: "https://cdn.example.com/screenshot.png",
      sizeBytes: 1024,
    });
    expect(message.quotedMessageId).toBe("message-0");
    expect(message.deleted).toBe(false);

    expect(toUiMessage({ ...baseMessage, is_deleted: true }).deleted).toBe(
      true,
    );
  });

  it("uses the workspace contact name for direct messages", () => {
    expect(toUiMessage(baseMessage, "João")).toMatchObject({
      sender: "João",
      senderUserId: undefined,
    });
  });
});

describe("live conversation mapper", () => {
  it("keeps only the latest operator reaction after repeated sends", () => {
    const result = toUiConversation(
      {
        id: "conversation-1",
        workspace_id: "workspace-1",
        contact_id: "contact-1",
        channel_connection_id: "channel-1",
        status: "open",
        attention_state: "needs_attention",
        ai_mode: "draft",
        assigned_user_id: null,
        unread_count: 0,
        last_message_at: null,
        last_inbound_at: null,
        last_outbound_at: null,
        last_read_at: null,
        resolved_at: null,
        snoozed_until: null,
        created_at: "2026-08-03T00:00:00.000Z",
        support_flow_state_json: {},
        updated_at: "2026-08-03T00:00:00.000Z",
      },
      undefined,
      [
        { ...baseMessage, message_type: "text", quoted_message_id: null },
        {
          ...baseMessage,
          id: "reaction-1",
          message_type: "reaction",
          direction: "outbound",
          text: "👍",
          caption: null,
          quoted_message_id: "message-1",
          created_at: "2026-08-03T20:01:00.000Z",
        },
        {
          ...baseMessage,
          id: "reaction-2",
          message_type: "reaction",
          direction: "outbound",
          text: "✅",
          caption: null,
          quoted_message_id: "message-1",
          created_at: "2026-08-03T20:02:00.000Z",
        },
      ],
    );

    expect(result.messages[0]?.reactions).toEqual([
      { emoji: "✅", mine: true },
    ]);
  });

  it("exposes the latest AI decision and triage context", () => {
    const conversation = {
      id: "conversation-1",
      workspace_id: "workspace-1",
      contact_id: "contact-1",
      channel_connection_id: "channel-1",
      status: "open",
      attention_state: "needs_attention",
      ai_mode: "safe_auto",
      assigned_user_id: null,
      unread_count: 0,
      last_message_at: "2026-08-04T00:00:00.000Z",
      last_inbound_at: "2026-08-04T00:00:00.000Z",
      last_outbound_at: null,
      last_read_at: null,
      resolved_at: null,
      snoozed_until: null,
      created_at: "2026-08-03T00:00:00.000Z",
      support_flow_state_json: {},
      updated_at: "2026-08-04T00:00:00.000Z",
    } satisfies ConversationRecord;

    const result = toUiConversation(
      conversation,
      {
        id: "contact-1",
        workspace_id: "workspace-1",
        channel_connection_id: "channel-1",
        display_name: "Ana",
        phone_number: "5511999999999",
        company_name: "Acme",
        notes: null,
        profile_picture_url: null,
        provider_contact_id: null,
        created_at: "2026-08-03T00:00:00.000Z",
        updated_at: "2026-08-03T00:00:00.000Z",
      },
      [],
      undefined,
      {
        id: "state-1",
        workspace_id: "workspace-1",
        conversation_id: "conversation-1",
        automation_state: "ai_active",
        human_takeover_at: null,
        human_takeover_by: null,
        human_takeover_reason: null,
        last_human_message_id: null,
        last_triaged_message_id: "message-1",
        last_triaged_at: "2026-08-04T00:00:00.000Z",
        latest_intent: "status",
        latest_confidence: 0.94,
        current_summary: "Customer is asking about an open request.",
        needs_human: false,
        needs_human_reason: null,
        last_decision: "auto_reply",
        last_decision_reason: "High-confidence low-risk intent is eligible.",
        last_decision_at: "2026-08-04T00:00:00.000Z",
        paused_until: null,
        sentiment: "neutral",
        created_at: "2026-08-03T00:00:00.000Z",
        updated_at: "2026-08-04T00:00:00.000Z",
      },
    );

    expect(result).toMatchObject({
      aiDecision: "auto_reply",
      aiDecisionReason: "High-confidence low-risk intent is eligible.",
      aiIntent: "status",
      aiConfidence: 0.94,
      aiSummary: "Customer is asking about an open request.",
    });
  });

  it("classifies a group contact and shows the message participant", () => {
    const conversation = {
      id: "conversation-group",
      workspace_id: "workspace-1",
      contact_id: "contact-group",
      channel_connection_id: "channel-1",
      status: "open",
      attention_state: "needs_attention",
      ai_mode: "draft",
      assigned_user_id: null,
      unread_count: 1,
      last_message_at: "2026-08-05T20:30:04.000Z",
      last_inbound_at: "2026-08-05T20:30:04.000Z",
      last_outbound_at: null,
      last_read_at: null,
      resolved_at: null,
      snoozed_until: null,
      created_at: "2026-08-05T20:28:02.000Z",
      support_flow_state_json: {},
      updated_at: "2026-08-05T20:30:04.000Z",
    } satisfies ConversationRecord;

    const result = toUiConversation(
      conversation,
      {
        id: "contact-group",
        workspace_id: "workspace-1",
        channel_connection_id: "channel-1",
        display_name: "Guilherme Correa",
        phone_number: "120363426966918405",
        company_name: null,
        notes: null,
        profile_picture_url: null,
        provider_contact_id: "120363426966918405@g.us",
        created_at: "2026-08-05T20:28:02.000Z",
        updated_at: "2026-08-05T20:30:04.000Z",
      },
      [
        {
          ...baseMessage,
          conversation_id: "conversation-group",
          participant_name: "Guilherme Correa",
          text: "Até amanhã!",
          caption: null,
          message_type: "text",
        },
      ],
    );

    expect(result.chatType).toBe("group");
    expect(result.messages[0]?.sender).toBe("Guilherme Correa");
  });
});

describe("live Agent run mapper", () => {
  it("exposes persisted diff, files, checks and model summary for review", () => {
    const record = {
      id: "run-1",
      workspace_id: "workspace-1",
      issue_id: "issue-1",
      repository_id: "repository-1",
      mode: "implement_fix",
      status: "completed",
      progress: 100,
      branch_name: "ops/mend-1-fix",
      commit_sha: null,
      result_json: {
        files: [{ relativePath: "src/fix.ts", status: "modified" }],
        patch: "diff --git a/src/fix.ts b/src/fix.ts",
        checks: [{ name: "test", exitCode: 0, output: "passed" }],
        agent: {
          finalText: "Fixed safely.",
          report: {
            summary: "The regression reproduces in the checkout path.",
            verdict: "confirmed",
            recommendedAction: "propose_fix",
            evidence: [
              {
                kind: "code",
                label: "Missing payment confirmation action",
                detail: "The payment handler only refreshes the customer.",
              },
            ],
          },
        },
      },
      started_at: "2026-08-03T20:00:00.000Z",
      finished_at: "2026-08-03T20:01:05.000Z",
      created_by_user_id: "user-1",
      created_at: "2026-08-03T20:00:00.000Z",
      updated_at: "2026-08-03T20:01:05.000Z",
    } satisfies CodingRunRecord;

    expect(toUiRun(record, [], "MEND-1")).toMatchObject({
      issueIdentifier: "MEND-1",
      status: "completed",
      summary: "The regression reproduces in the checkout path.",
      files: ["src/fix.ts"],
      diff: "diff --git a/src/fix.ts b/src/fix.ts",
      checks: [{ name: "test", exitCode: 0, output: "passed" }],
      duration: "01:05",
      verdict: "confirmed",
      decision: "manual_fix",
      evidence: [
        {
          kind: "code",
          label: "Missing payment confirmation action",
          detail: "The payment handler only refreshes the customer.",
        },
      ],
    });
  });

  it.each([
    "queued",
    "running",
    "completed",
    "failed",
    "canceled",
    "approved",
    "rejected",
  ])("preserves the persisted %s status", (status) => {
    const record = {
      id: `run-${status}`,
      workspace_id: "workspace-1",
      issue_id: "issue-1",
      repository_id: null,
      mode: "propose_fix",
      status,
      progress: 0,
      branch_name: null,
      commit_sha: null,
      result_json: {},
      started_at: null,
      finished_at: null,
      created_by_user_id: "user-1",
      created_at: "2026-08-03T20:00:00.000Z",
      updated_at: "2026-08-03T20:00:00.000Z",
    } satisfies CodingRunRecord;

    expect(toUiRun(record).status).toBe(status);
  });

  it("keeps a bug case visible before its first coding run", () => {
    const record = {
      id: "case-1",
      workspace_id: "workspace-1",
      issue_id: "issue-1",
      conversation_id: "conversation-1",
      signal_message_id: "message-1",
      duplicate_of_issue_id: null,
      fingerprint: "checkout-plan-change",
      stage: "evidence",
      status: "active",
      suspicion_score: 0.82,
      evidence_json: [
        { kind: "trace", label: "Checkout error", detail: "POST /pay" },
      ],
      verdict: "pending",
      decision: "pending",
      investigation_agent_run_id: null,
      fix_agent_run_id: null,
      pr_url: null,
      pr_number: null,
      merge_sha: null,
      deployment_url: null,
      health_status: "pending",
      customer_response_status: "pending",
      last_error: null,
      started_at: "2026-08-07T14:00:00.000Z",
      completed_at: null,
      created_at: "2026-08-07T14:00:00.000Z",
      updated_at: "2026-08-07T14:01:00.000Z",
    } satisfies BugCaseRecord;
    const event = {
      id: "case-event-1",
      workspace_id: "workspace-1",
      bug_case_id: "case-1",
      stage: "evidence",
      event_type: "evidence.collected",
      message: "Trace attached",
      metadata_json: {},
      idempotency_key: "case-1:evidence",
      created_at: "2026-08-07T14:01:00.000Z",
    } satisfies BugCaseEventRecord;

    expect(toUiBugCase(record, [event], "MEND-184")).toMatchObject({
      id: "case:case-1",
      issueIdentifier: "MEND-184",
      caseOnly: true,
      stage: "evidence",
      suspicionScore: 0.82,
      evidence: [{ kind: "trace", label: "Checkout error" }],
      events: [{ label: "evidence.collected", detail: "Trace attached" }],
    });
  });

  it("surfaces durable investigation proof stored on the case event", () => {
    const record = {
      id: "case-2",
      workspace_id: "workspace-1",
      issue_id: "issue-2",
      conversation_id: null,
      signal_message_id: null,
      duplicate_of_issue_id: null,
      fingerprint: "proof",
      stage: "verdict",
      status: "awaiting_human",
      suspicion_score: 0.9,
      evidence_json: [],
      verdict: "confirmed",
      decision: "notify",
      investigation_agent_run_id: "run-2",
      fix_agent_run_id: null,
      pr_url: null,
      pr_number: null,
      merge_sha: null,
      deployment_url: null,
      health_status: "pending",
      customer_response_status: "pending",
      last_error: null,
      started_at: "2026-08-07T14:00:00.000Z",
      completed_at: null,
      created_at: "2026-08-07T14:00:00.000Z",
      updated_at: "2026-08-07T14:01:00.000Z",
    } satisfies BugCaseRecord;
    const event = {
      id: "case-event-2",
      workspace_id: "workspace-1",
      bug_case_id: "case-2",
      stage: "verdict",
      event_type: "investigation.completed",
      message: "Investigation finished",
      metadata_json: {
        summary: "The regression reproduces in checkout.",
        evidence: [
          {
            kind: "test",
            label: "Checkout regression",
            detail: "Fails on coupon path",
          },
        ],
      },
      idempotency_key: "case-2:investigation",
      created_at: "2026-08-07T14:01:00.000Z",
    } satisfies BugCaseEventRecord;

    expect(toUiBugCase(record, [event], "MEND-185")).toMatchObject({
      summary: "The regression reproduces in checkout.",
      evidence: [
        {
          kind: "test",
          label: "Checkout regression",
          detail: "Fails on coupon path",
        },
      ],
    });
  });
});
