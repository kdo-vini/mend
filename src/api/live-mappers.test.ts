import { describe, expect, it } from "vitest";
import { toUiConversation, toUiMessage, toUiRun } from "./live-mappers";
import type {
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
  direction: "inbound",
  sender_type: "contact",
  message_type: "image",
  text: null,
  caption: "Screenshot",
  media_storage_path: null,
  media_remote_url: "https://cdn.example.com/screenshot.png",
  mime_type: "image/png",
  file_name: "screenshot.png",
  file_size: 1024,
  duration_seconds: null,
  quoted_message_id: "message-0",
  ai_generated: false,
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
    });
    expect(message.quotedMessageId).toBe("message-0");
    expect(message.deleted).toBe(false);

    expect(toUiMessage({ ...baseMessage, is_deleted: true }).deleted).toBe(
      true,
    );
  });
});

describe("live conversation mapper", () => {
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
      resolved_at: null,
      snoozed_until: null,
      created_at: "2026-08-03T00:00:00.000Z",
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
});

describe("live Codex run mapper", () => {
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
        agent: { finalText: "Fixed safely." },
      },
      started_at: "2026-08-03T20:00:00.000Z",
      finished_at: "2026-08-03T20:01:05.000Z",
      created_by_user_id: "user-1",
      created_at: "2026-08-03T20:00:00.000Z",
      updated_at: "2026-08-03T20:01:05.000Z",
    } satisfies CodingRunRecord;

    expect(toUiRun(record, [], "MEND-1")).toMatchObject({
      issueIdentifier: "MEND-1",
      summary: "Fixed safely.",
      files: ["src/fix.ts"],
      diff: "diff --git a/src/fix.ts b/src/fix.ts",
      checks: [{ name: "test", exitCode: 0, output: "passed" }],
      duration: "01:05",
    });
  });
});
