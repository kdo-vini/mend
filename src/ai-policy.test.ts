import { describe, expect, it } from "vitest";
import {
  DEFAULT_AI_ROUTE_MAP,
  DEFAULT_WORKSPACE_AI_POLICY,
  normalizeWorkspaceAiPolicy,
  workspaceAiPolicyJson,
} from "./ai-policy";

describe("workspace AI policy", () => {
  it("provides a company-owned default route for every triage intent", () => {
    const policy = normalizeWorkspaceAiPolicy(null);

    expect(policy.routes).toEqual(DEFAULT_AI_ROUTE_MAP);
    expect(policy.fallbackRoute).toBe("draft_for_review");
    expect(policy.requirePublishedKnowledge).toBe(true);
    expect(policy.safeAutoIntents).toEqual(["question", "how_to", "status"]);
  });

  it("preserves valid company overrides and rejects invalid routes", () => {
    const policy = normalizeWorkspaceAiPolicy({
      automation_routes: {
        billing: "draft_for_review",
        bug: "not-a-route",
      },
      automation_fallback_route: "human_escalation",
      safe_auto_intents: ["question", "billing", "invalid"],
      notify_on_bug: false,
      bug_auto_deploy_enabled: true,
    });

    expect(policy.routes.billing).toBe("draft_for_review");
    expect(policy.routes.bug).toBe(DEFAULT_AI_ROUTE_MAP.bug);
    expect(policy.notifyOnBug).toBe(false);
    expect(policy.bugAutoDeployEnabled).toBe(true);
    expect(policy.safeAutoIntents).toEqual(["question", "billing"]);
  });

  it("serializes only the workspace policy contract", () => {
    const serialized = workspaceAiPolicyJson(DEFAULT_WORKSPACE_AI_POLICY);

    expect(serialized).toMatchObject({
      automation_fallback_route: "draft_for_review",
      notify_on_human_escalation: true,
      bug_auto_fix_enabled: false,
      safe_auto_intents: ["question", "how_to", "status"],
    });
    expect(serialized).not.toHaveProperty("totalConversations");
  });
});
