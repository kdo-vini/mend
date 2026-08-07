import type { AiMode } from "./types.js";
import type { Json } from "./lib/database.types.js";

export const triageIntentValues = [
  "question",
  "how_to",
  "status",
  "bug",
  "incident",
  "billing",
  "feature",
  "social",
  "other",
] as const;

export type TriageIntent = (typeof triageIntentValues)[number];

export const aiTriageRouteValues = [
  "knowledge_auto_reply",
  "safe_auto_reply",
  "draft_for_review",
  "human_escalation",
  "bug_triage",
  "no_action",
] as const;

export type AiTriageRoute = (typeof aiTriageRouteValues)[number];
export type AiRouteMap = Record<TriageIntent, AiTriageRoute>;

export const aiPolicyActionValues = [
  "respond",
  "triage",
  "create_issue",
  "investigate",
  "propose_fix",
  "implement_fix",
  "publish",
  "deploy",
  "delete",
] as const;

export type AiPolicyAction = (typeof aiPolicyActionValues)[number];

export const aiPolicyChannelValues = ["whatsapp", "web"] as const;
export type AiPolicyChannel = (typeof aiPolicyChannelValues)[number];

export const aiPolicyIntegrationValues = [
  "knowledge",
  "google_calendar",
  "agent",
  "mcp",
] as const;
export type AiPolicyIntegration = (typeof aiPolicyIntegrationValues)[number];

export interface WorkspaceAiPolicy {
  allowedChannels: AiPolicyChannel[];
  allowedIntegrations: AiPolicyIntegration[];
  allowedActions: AiPolicyAction[];
  humanApprovalActions: AiPolicyAction[];
  draftEnabled: boolean;
  safeAutoEnabled: boolean;
  safeAutoMinConfidence: number;
  safeAutoIntents: TriageIntent[];
  safeAutoSendEnabled: boolean;
  requirePublishedKnowledge: boolean;
  routes: AiRouteMap;
  fallbackRoute: AiTriageRoute;
  notifyOnHumanEscalation: boolean;
  notifyOnBug: boolean;
  bugAutoReplyEnabled: boolean;
  bugAutoFixEnabled: boolean;
  bugAutoDeployEnabled: boolean;
  mcpFailurePolicy: "review" | "generic_reply" | "retry_then_review";
}

export const DEFAULT_AI_ROUTE_MAP: AiRouteMap = {
  question: "knowledge_auto_reply",
  how_to: "knowledge_auto_reply",
  status: "knowledge_auto_reply",
  bug: "bug_triage",
  incident: "human_escalation",
  billing: "knowledge_auto_reply",
  feature: "draft_for_review",
  social: "safe_auto_reply",
  other: "draft_for_review",
};

const mandatoryHumanApprovalActions: AiPolicyAction[] = [
  "publish",
  "deploy",
  "delete",
];

export const DEFAULT_WORKSPACE_AI_POLICY: WorkspaceAiPolicy = {
  allowedChannels: ["whatsapp", "web"],
  allowedIntegrations: ["knowledge", "agent", "mcp"],
  allowedActions: [
    "respond",
    "triage",
    "create_issue",
    "investigate",
    "propose_fix",
  ],
  humanApprovalActions: ["publish", "deploy", "delete"],
  draftEnabled: true,
  safeAutoEnabled: true,
  safeAutoMinConfidence: 0.85,
  safeAutoIntents: ["question", "how_to", "status", "social"],
  safeAutoSendEnabled: false,
  requirePublishedKnowledge: true,
  routes: DEFAULT_AI_ROUTE_MAP,
  fallbackRoute: "draft_for_review",
  notifyOnHumanEscalation: true,
  notifyOnBug: true,
  bugAutoReplyEnabled: false,
  bugAutoFixEnabled: false,
  bugAutoDeployEnabled: false,
  mcpFailurePolicy: "review",
};

export function isAiMode(value: unknown): value is AiMode {
  return value === "off" || value === "draft" || value === "safe_auto";
}

export function isTriageIntent(value: unknown): value is TriageIntent {
  return (triageIntentValues as readonly unknown[]).includes(value);
}

export function isAiTriageRoute(value: unknown): value is AiTriageRoute {
  return (aiTriageRouteValues as readonly unknown[]).includes(value);
}

function normalizedValues<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: readonly T[],
): T[] {
  const values = Array.isArray(value)
    ? value.filter((item): item is T => allowed.includes(item as T))
    : [];
  return values.length ? [...new Set(values)] : [...fallback];
}

export function normalizeWorkspaceAiPolicy(value: unknown): WorkspaceAiPolicy {
  const raw =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const rawRoutes =
    raw.automation_routes !== null &&
    typeof raw.automation_routes === "object" &&
    !Array.isArray(raw.automation_routes)
      ? (raw.automation_routes as Record<string, unknown>)
      : {};
  const routes = { ...DEFAULT_AI_ROUTE_MAP };
  for (const intent of triageIntentValues) {
    if (isAiTriageRoute(rawRoutes[intent])) routes[intent] = rawRoutes[intent];
  }
  const confidence = Number(raw.safe_auto_min_confidence);
  const safeAutoIntents = Array.isArray(raw.safe_auto_intents)
    ? raw.safe_auto_intents.filter(isTriageIntent)
    : [...DEFAULT_WORKSPACE_AI_POLICY.safeAutoIntents];
  const fallbackRoute = isAiTriageRoute(raw.automation_fallback_route)
    ? raw.automation_fallback_route
    : DEFAULT_WORKSPACE_AI_POLICY.fallbackRoute;
  return {
    allowedChannels: normalizedValues(
      raw.allowed_channels,
      aiPolicyChannelValues,
      DEFAULT_WORKSPACE_AI_POLICY.allowedChannels,
    ),
    allowedIntegrations: normalizedValues(
      raw.allowed_integrations,
      aiPolicyIntegrationValues,
      DEFAULT_WORKSPACE_AI_POLICY.allowedIntegrations,
    ),
    allowedActions: normalizedValues(
      raw.allowed_actions,
      aiPolicyActionValues,
      DEFAULT_WORKSPACE_AI_POLICY.allowedActions,
    ),
    humanApprovalActions: [
      ...new Set([
        ...normalizedValues(
          raw.human_approval_actions,
          aiPolicyActionValues,
          DEFAULT_WORKSPACE_AI_POLICY.humanApprovalActions,
        ),
        ...mandatoryHumanApprovalActions,
      ]),
    ] as AiPolicyAction[],
    draftEnabled:
      typeof raw.draft_enabled === "boolean"
        ? raw.draft_enabled
        : DEFAULT_WORKSPACE_AI_POLICY.draftEnabled,
    safeAutoEnabled:
      typeof raw.safe_auto_enabled === "boolean"
        ? raw.safe_auto_enabled
        : DEFAULT_WORKSPACE_AI_POLICY.safeAutoEnabled,
    safeAutoMinConfidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : DEFAULT_WORKSPACE_AI_POLICY.safeAutoMinConfidence,
    safeAutoIntents:
      safeAutoIntents.length > 0
        ? [...safeAutoIntents]
        : [...DEFAULT_WORKSPACE_AI_POLICY.safeAutoIntents],
    safeAutoSendEnabled: raw.safe_auto_send_enabled === true,
    requirePublishedKnowledge:
      typeof raw.require_published_knowledge === "boolean"
        ? raw.require_published_knowledge
        : DEFAULT_WORKSPACE_AI_POLICY.requirePublishedKnowledge,
    routes,
    fallbackRoute,
    notifyOnHumanEscalation: raw.notify_on_human_escalation !== false,
    notifyOnBug: raw.notify_on_bug !== false,
    bugAutoReplyEnabled: raw.bug_auto_reply_enabled === true,
    bugAutoFixEnabled: raw.bug_auto_fix_enabled === true,
    bugAutoDeployEnabled: raw.bug_auto_deploy_enabled === true,
    mcpFailurePolicy:
      raw.mcp_failure_policy === "generic_reply" ||
      raw.mcp_failure_policy === "retry_then_review"
        ? raw.mcp_failure_policy
        : "review",
  };
}

export function workspaceAiPolicyJson(
  policy: WorkspaceAiPolicy,
): Record<string, Json> {
  return {
    allowed_channels: [...policy.allowedChannels],
    allowed_integrations: [...policy.allowedIntegrations],
    allowed_actions: [...policy.allowedActions],
    human_approval_actions: [...policy.humanApprovalActions],
    draft_enabled: policy.draftEnabled,
    safe_auto_enabled: policy.safeAutoEnabled,
    safe_auto_min_confidence: policy.safeAutoMinConfidence,
    safe_auto_intents: [...policy.safeAutoIntents],
    safe_auto_send_enabled: policy.safeAutoSendEnabled,
    require_published_knowledge: policy.requirePublishedKnowledge,
    automation_routes: { ...policy.routes },
    automation_fallback_route: policy.fallbackRoute,
    notify_on_human_escalation: policy.notifyOnHumanEscalation,
    notify_on_bug: policy.notifyOnBug,
    bug_auto_reply_enabled: policy.bugAutoReplyEnabled,
    bug_auto_fix_enabled: policy.bugAutoFixEnabled,
    bug_auto_deploy_enabled: policy.bugAutoDeployEnabled,
    mcp_failure_policy: policy.mcpFailurePolicy,
  };
}
