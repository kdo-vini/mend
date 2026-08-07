import { describe, expect, it } from "vitest";
import {
  aiStateInput,
  conversationReplyInput,
  issueIdentifierNumber,
  messageText,
  normalizeAiPolicy,
  policyDecision,
  relevantKnowledge,
  triageConversationInput,
  type LiveWorkerKnowledgeArticle,
} from "./decision.js";
import type { NormalizedWhatsmiauMessage } from "../whatsmiau.js";
import type { TriageResult } from "../triage.js";

const message: NormalizedWhatsmiauMessage = {
  instanceName: "mend-live",
  providerMessageId: "provider-1",
  remoteJid: "5511999999999@s.whatsapp.net",
  phoneNumber: "5511999999999",
  direction: "inbound",
  messageType: "text",
  text: "Como resolvo o checkout?",
  raw: {},
};

const triage: TriageResult = {
  intent: "question",
  priority: "low",
  confidence: 0.94,
  summary: "The customer asks about checkout.",
  unsafe: false,
};

const article: LiveWorkerKnowledgeArticle = {
  id: "article-1",
  title: "Checkout",
  category: "Support",
  body: "Use the checkout settings to resolve payment issues.",
};

describe("live worker automation decisions", () => {
  it("builds bounded customer and knowledge context", () => {
    expect(messageText(message)).toBe("Como resolvo o checkout?");
    expect(triageConversationInput(message, [article])).toContain(
      "<published_knowledge_reference>",
    );
  });

  it("uses outbound messages as context and targets only the inbound contact message", () => {
    const input = JSON.parse(
      conversationReplyInput(
        [
          { id: "in-1", direction: "inbound", text: "Qual é o contexto?" },
          {
            id: "out-1",
            direction: "outbound",
            text: "Queremos reposicionar a empresa como software house.",
          },
          {
            id: "in-2",
            direction: "inbound",
            text: "Podemos incluir naming no projeto.",
          },
        ],
        "in-2",
      ),
    ) as {
      conversation_messages: Array<{ direction: string; text: string }>;
      reply_target: { id: string; direction: string; text: string };
    };

    expect(input.conversation_messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: "outbound",
          text: expect.stringContaining("software house"),
        }),
      ]),
    );
    expect(input.reply_target).toEqual({
      id: "in-2",
      direction: "inbound",
      text: "Podemos incluir naming no projeto.",
    });
  });

  it("selects relevant published knowledge by normalized terms", () => {
    expect(relevantKnowledge(message, [article])).toEqual([article]);
    expect(
      relevantKnowledge(message, [
        {
          ...article,
          id: "article-2",
          title: "Billing",
          body: "Use the billing settings to update an invoice.",
        },
      ]),
    ).toEqual([]);
  });

  it("keeps safe automation behind policy and confidence gates", () => {
    const policy = normalizeAiPolicy({});
    expect(
      policyDecision("draft", triage, policy, true, "draft_for_review"),
    ).toMatchObject({ action: "draft", allowed: true });
    expect(
      policyDecision(
        "safe_auto",
        { ...triage, confidence: 0.2 },
        policy,
        true,
        "knowledge_auto_reply",
      ),
    ).toMatchObject({ action: "blocked", allowed: false });
    expect(
      aiStateInput(
        {
          binding: { workspaceId: "workspace-1" },
          persisted: { conversationId: "conversation-1", id: "message-1" },
        },
        triage,
        "draft",
        policy,
        true,
        "draft_for_review",
      ),
    ).toMatchObject({
      workspace_id: "workspace-1",
      conversation_id: "conversation-1",
      last_decision: "draft",
    });
  });

  it("allows knowledge-backed routes without knowledge when the requirement is disabled", () => {
    const policy = normalizeAiPolicy({
      require_published_knowledge: false,
      safe_auto_intents: ["question"],
    });

    expect(
      policyDecision(
        "safe_auto",
        triage,
        policy,
        false,
        "knowledge_auto_reply",
      ),
    ).toMatchObject({ action: "auto_reply", allowed: true });
  });

  it("allows a high-confidence social reply without published knowledge", () => {
    const policy = normalizeAiPolicy({
      safe_auto_intents: ["social"],
    });
    const social = {
      ...triage,
      intent: "social" as const,
      summary: "The customer says goodbye.",
    };

    expect(
      policyDecision("safe_auto", social, policy, false, "safe_auto_reply"),
    ).toMatchObject({
      action: "auto_reply",
      allowed: true,
      reason: "A low-risk social reply passed the workspace safety policy.",
    });
  });

  it("blocks safe auto-reply intents that are not allowlisted", () => {
    const policy = normalizeAiPolicy({ safe_auto_intents: ["status"] });

    expect(
      policyDecision("safe_auto", triage, policy, true, "knowledge_auto_reply"),
    ).toMatchObject({ action: "blocked", allowed: false });
  });

  it("parses native issue identifiers without accepting invalid numbers", () => {
    expect(issueIdentifierNumber("TEC-42")).toBe(42);
    expect(() => issueIdentifierNumber("TEC-zero")).toThrow(
      "supabase_invalid_issue_identifier",
    );
  });
});
