import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  SUPPORT_EVENTS_API_KEY_ENV,
  SUPPORT_EVENTS_KEY_HEADER,
} from "./support-events.js";
import {
  deriveSupportIdempotencyKey,
  evaluateReplyGuard,
  registerInternalSupportSendRoute,
  SUPPORT_SEND_PATH,
  type SupportReplyGuard,
  type SupportSendConversation,
  type SupportSendResult,
} from "./support-send.js";

const KEY = "support-test-key";
const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const ready: SupportSendConversation = {
  workspaceId: WORKSPACE,
  aiMode: "safe_auto",
};

function setup(
  conversation: SupportSendConversation,
  guard?: SupportReplyGuard,
  sent: SupportSendResult = { messageId: "m1", providerMessageId: "p1" },
) {
  const port = {
    findConversation: vi.fn(async () => conversation),
    checkReplyGuard: vi.fn(async () => guard ?? {}),
    sendText: vi.fn(async (_input: { idempotencyKey?: string }) => sent),
  };
  const app = express();
  app.use(express.json());
  registerInternalSupportSendRoute(app, {
    port: port as never,
    env: { [SUPPORT_EVENTS_API_KEY_ENV]: KEY },
    internalWorkspace: { resolve: async () => WORKSPACE },
  });
  const post = (body: object) =>
    request(app)
      .post(SUPPORT_SEND_PATH)
      .set(SUPPORT_EVENTS_KEY_HEADER, KEY)
      .send(body);
  return { port, post };
}

describe("support send guards", () => {
  it("rejects group conversations with 409", async () => {
    const { port, post } = setup({ ...ready, isGroup: true });
    const response = await post({ conversationId: CONVERSATION, text: "Oi" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "group_conversation" });
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("rejects a superseded source message with 409", async () => {
    const { port, post } = setup(ready, { reject: "superseded" });
    const response = await post({
      conversationId: CONVERSATION,
      sourceMessageId: SOURCE,
      text: "Oi",
    });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "superseded" });
    expect(port.checkReplyGuard).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMessageId: SOURCE }),
    );
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("rejects with human_replied when a human wrote last", async () => {
    const { port, post } = setup(ready, { reject: "human_replied" });
    const response = await post({ conversationId: CONVERSATION, text: "Oi" });
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "human_replied" });
    expect(port.sendText).not.toHaveBeenCalled();
  });

  it("derives a stable idempotency key when none is sent", async () => {
    const { port, post } = setup(ready);
    const body = {
      conversationId: CONVERSATION,
      sourceMessageId: SOURCE,
      text: "Oi",
    };
    await post(body);
    await post(body);
    const keys = port.sendText.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toMatch(/^support-send:[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[0]).toBe(
      deriveSupportIdempotencyKey({
        conversationId: CONVERSATION,
        anchorMessageId: SOURCE,
        text: "Oi",
      }),
    );
    expect(
      deriveSupportIdempotencyKey({
        conversationId: CONVERSATION,
        anchorMessageId: SOURCE,
        text: "Outro",
      }),
    ).not.toBe(keys[0]);
  });

  it("keeps an explicit idempotency-key header", async () => {
    const { port, post } = setup(ready);
    await post({ conversationId: CONVERSATION, text: "Oi" }).set(
      "idempotency-key",
      "mine",
    );
    expect(port.sendText.mock.calls[0]?.[0].idempotencyKey).toBe("mine");
  });

  it("answers 201 with recorded:false instead of a 5xx", async () => {
    const { post } = setup(ready, undefined, {
      messageId: null,
      providerMessageId: "p",
      recorded: false,
    });
    const response = await post({ conversationId: CONVERSATION, text: "Oi" });
    expect(response.status).toBe(201);
    expect(response.body.recorded).toBe(false);
  });
});

describe("evaluateReplyGuard", () => {
  const msg = (id: string, direction: string, n: number, ai = false) => ({
    id,
    direction,
    aiGenerated: ai,
    createdAt: `2026-10-26T10:0${n}:00Z`,
  });

  it("passes when the source is the latest message", () => {
    expect(
      evaluateReplyGuard({
        sourceMessageId: "in1",
        messages: [msg("in1", "inbound", 1), msg("o0", "outbound", 0, true)],
      }),
    ).toEqual({ latestInboundId: "in1" });
  });

  it("is superseded by a later human outbound or inbound", () => {
    expect(
      evaluateReplyGuard({
        sourceMessageId: "in1",
        messages: [msg("in1", "inbound", 1), msg("h", "outbound", 2)],
      }).reject,
    ).toBe("superseded");
    expect(
      evaluateReplyGuard({
        sourceMessageId: "in1",
        messages: [msg("in1", "inbound", 1), msg("in2", "inbound", 2)],
      }).reject,
    ).toBe("superseded");
  });

  it("ignores a later AI outbound for the source check", () => {
    expect(
      evaluateReplyGuard({
        sourceMessageId: "in1",
        messages: [msg("in1", "inbound", 1), msg("a", "outbound", 2, true)],
      }).reject,
    ).toBeUndefined();
  });

  it("without a source, rejects only when a human wrote last", () => {
    expect(
      evaluateReplyGuard({
        messages: [msg("in1", "inbound", 1), msg("h", "outbound", 2)],
      }).reject,
    ).toBe("human_replied");
    expect(
      evaluateReplyGuard({
        messages: [msg("h", "outbound", 1), msg("in1", "inbound", 2)],
      }).reject,
    ).toBeUndefined();
  });

  it("honours a takeover newer than the latest inbound", () => {
    expect(
      evaluateReplyGuard({
        humanTakeoverAt: "2026-10-26T10:05:00Z",
        messages: [msg("in1", "inbound", 1)],
      }).reject,
    ).toBe("human_replied");
  });
});
