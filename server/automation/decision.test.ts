import { describe, expect, it } from "vitest";
import {
  aiStateInput,
  conversationReplyInput,
  issueIdentifierNumber,
  messageText,
  normalizeAiPolicy,
  policyDecision,
  relevantKnowledge,
  resolveAutomationRoute,
  safeKnowledgeContext,
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

  it("omits operator escalation sections from knowledge context", () => {
    const context = safeKnowledgeContext([
      {
        id: "mesas",
        title: "Mesas",
        category: "how_to",
        body: [
          "O módulo de Mesas é um add-on.",
          "",
          "Quando encaminhar para humano: mesa travada ou comanda que não fecha.",
          "",
          "Toque em uma mesa livre para abrir a comanda.",
        ].join("\n"),
      },
    ]);
    expect(context).toContain("add-on");
    expect(context).toContain("mesa livre");
    expect(context.toLowerCase()).not.toContain("quando encaminhar");
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

  it("follows triage auto-reply routes even when the intent allowlist is narrower", () => {
    const policy = normalizeAiPolicy({
      safe_auto_intents: ["status"],
      safe_auto_send_enabled: false,
    });

    expect(
      policyDecision("safe_auto", triage, policy, true, "knowledge_auto_reply"),
    ).toMatchObject({ action: "auto_reply", allowed: true });
    expect(
      aiStateInput(
        {
          binding: { workspaceId: "workspace-1" },
          persisted: { conversationId: "conversation-1", id: "message-1" },
        },
        triage,
        "safe_auto",
        policy,
        true,
        "knowledge_auto_reply",
      ),
    ).toMatchObject({
      last_decision: "auto_reply",
      needs_human: false,
    });
  });

  it("maps missing knowledge to clarifying auto-reply in safe_auto mode", () => {
    expect(
      resolveAutomationRoute({
        configuredRoute: "knowledge_auto_reply",
        mode: "safe_auto",
        requirePublishedKnowledge: true,
        hasKnowledgeOrMcp: false,
        fallbackRoute: "draft_for_review",
      }),
    ).toBe("safe_auto_reply");
    expect(
      resolveAutomationRoute({
        configuredRoute: "knowledge_auto_reply",
        mode: "draft",
        requirePublishedKnowledge: true,
        hasKnowledgeOrMcp: false,
        fallbackRoute: "draft_for_review",
      }),
    ).toBe("draft_for_review");
  });

  it("asks for clarification instead of silent human escalation when the product is ambiguous", () => {
    expect(
      resolveAutomationRoute({
        configuredRoute: "knowledge_auto_reply",
        mode: "safe_auto",
        requirePublishedKnowledge: true,
        hasKnowledgeOrMcp: true,
        fallbackRoute: "draft_for_review",
        productAmbiguous: true,
      }),
    ).toBe("safe_auto_reply");
    expect(
      resolveAutomationRoute({
        configuredRoute: "knowledge_auto_reply",
        mode: "draft",
        requirePublishedKnowledge: true,
        hasKnowledgeOrMcp: true,
        fallbackRoute: "draft_for_review",
        productAmbiguous: true,
      }),
    ).toBe("draft_for_review");
  });

  it("keeps founder human-escalation routes even when MCP fails or product is ambiguous", () => {
    expect(
      resolveAutomationRoute({
        configuredRoute: "human_escalation",
        mode: "safe_auto",
        requirePublishedKnowledge: true,
        hasKnowledgeOrMcp: false,
        fallbackRoute: "safe_auto_reply",
        mcpFailureRequiresReview: true,
        productAmbiguous: true,
      }),
    ).toBe("human_escalation");
  });

  it("lets Copilot draft greetings and knowledge gaps instead of blocking", () => {
    const policy = normalizeAiPolicy({});
    expect(
      policyDecision("draft", triage, policy, false, "knowledge_auto_reply"),
    ).toMatchObject({ action: "draft", allowed: true });
    expect(
      policyDecision(
        "draft",
        { ...triage, intent: "social", summary: "Greeting" },
        policy,
        false,
        "safe_auto_reply",
      ),
    ).toMatchObject({ action: "draft", allowed: true });
  });

  it("blocks policyDecision for incident and bug routes (handoff/ack bypass them in the worker)", () => {
    const policy = normalizeAiPolicy({});
    expect(
      policyDecision(
        "safe_auto",
        { ...triage, intent: "incident" },
        policy,
        false,
        "human_escalation",
      ),
    ).toMatchObject({ action: "blocked", allowed: false });
    expect(
      policyDecision(
        "safe_auto",
        { ...triage, intent: "bug" },
        policy,
        false,
        "bug_triage",
      ),
    ).toMatchObject({ action: "blocked", allowed: false });
  });

  it("blocks auto-reply when autonomy does not allow respond", () => {
    const policy = normalizeAiPolicy({
      allowed_actions: ["triage", "create_issue"],
    });

    expect(
      policyDecision("safe_auto", triage, policy, true, "knowledge_auto_reply"),
    ).toMatchObject({ action: "blocked", allowed: false });
  });

  it("keeps Copilot mode on drafts even when routes say auto-reply", () => {
    const policy = normalizeAiPolicy({});

    expect(
      policyDecision("draft", triage, policy, true, "knowledge_auto_reply"),
    ).toMatchObject({ action: "draft", allowed: true });
  });

  it("parses native issue identifiers without accepting invalid numbers", () => {
    expect(issueIdentifierNumber("TEC-42")).toBe(42);
    expect(() => issueIdentifierNumber("TEC-zero")).toThrow(
      "supabase_invalid_issue_identifier",
    );
  });
});
