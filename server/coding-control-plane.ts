import { createHash } from "node:crypto";

export const authMethods = ["api_key", "subscription"] as const;
export type AuthMethod = (typeof authMethods)[number];

export const codingStages = [
  "research",
  "implement",
  "review",
  "verify",
] as const;
export type CodingStage = (typeof codingStages)[number];

export type CodingProvider = "openai" | "anthropic" | "google" | "verboo";
export const supportModelCapabilities = [
  "text",
  "vision",
  "transcription",
  "embedding",
] as const;
export type SupportModelCapability = (typeof supportModelCapabilities)[number];
export const supportModelRoles = [
  "supportModel",
  "visionModel",
  "transcriptionModel",
  "embeddingModel",
] as const;
export type SupportModelRole = (typeof supportModelRoles)[number];

export interface SupportModelConfig {
  supportModel: string;
  visionModel: string;
  transcriptionModel: string;
  embeddingModel: string;
}

export type ConnectionStatus =
  | "pending"
  | "connected"
  | "expired"
  | "revoked"
  | "canceled"
  | "error";
export type PolicySource = "override" | "repository" | "workspace";

export interface CatalogModel {
  id: string;
  label?: string;
  efforts?: string[];
  supportsAuto?: boolean;
  capabilities?: SupportModelCapability[];
}

export interface CatalogSnapshot {
  connectionId: string;
  provider: CodingProvider;
  cliVersion: string;
  models: CatalogModel[];
  source: "cli" | "api" | "runner";
  lastVerifiedAt: string;
  expiresAt: string;
}

export interface AgentConnection {
  id: string;
  workspaceId: string;
  ownerUserId?: string;
  label: string;
  provider: CodingProvider;
  authMethod: AuthMethod;
  purpose: "coding" | "support";
  status: ConnectionStatus;
  automationConsent: boolean;
  consentUpdatedAt?: string;
  cliVersion?: string;
  lastValidatedAt?: string;
  quota?: Record<string, unknown>;
  catalog?: CatalogSnapshot;
  supportConfig?: SupportModelConfig;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function isSupportModelConfigReady(
  config: SupportModelConfig,
  catalogModels: readonly Pick<CatalogModel, "id" | "capabilities">[],
): boolean {
  const required: Array<[keyof SupportModelConfig, SupportModelCapability]> = [
    ["supportModel", "text"],
    ["visionModel", "vision"],
    ["transcriptionModel", "transcription"],
    ["embeddingModel", "embedding"],
  ];
  return required.every(([role, capability]) => {
    const selected = config[role].trim();
    const model = catalogModels.find((candidate) => candidate.id === selected);
    return Boolean(model?.capabilities?.includes(capability));
  });
}

export function parseSupportModelConfig(
  value: unknown,
): SupportModelConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const candidate = value as Record<string, unknown>;
  const values = supportModelRoles.map((role) => candidate[role]);
  if (values.some((item) => typeof item !== "string" || !item.trim()))
    return undefined;
  return {
    supportModel: String(candidate.supportModel).trim(),
    visionModel: String(candidate.visionModel).trim(),
    transcriptionModel: String(candidate.transcriptionModel).trim(),
    embeddingModel: String(candidate.embeddingModel).trim(),
  };
}

export interface StageBudget {
  maxRuntimeMs?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
  maxRepairs: number;
}

export interface StageRoutingPolicy {
  stage: CodingStage;
  repositoryId?: string;
  connectionId?: string;
  model?: string;
  effort?: string;
  budget?: Partial<StageBudget>;
  fallbackEnabled?: boolean;
  fallbackConnectionIds?: string[];
  preset: "Economy" | "Balanced" | "Quality" | "Custom";
  snapshot?: Record<string, unknown>;
}

export type StageRoutingPolicyOverride = Omit<StageRoutingPolicy, "preset"> & {
  preset?: StageRoutingPolicy["preset"];
};

export interface EffectiveFallbackRoute {
  connectionId: string;
  provider: CodingProvider;
  authMethod: AuthMethod;
  model: string;
  effort?: string;
}

export interface EffectiveRunConfig {
  stage: CodingStage;
  connectionId: string;
  provider: CodingProvider;
  authMethod: AuthMethod;
  model: string;
  effort?: string;
  budget: StageBudget;
  fallbackEnabled: boolean;
  fallbackConnectionIds: string[];
  fallbacks: EffectiveFallbackRoute[];
  preset: StageRoutingPolicy["preset"];
  policySource: PolicySource;
  resolvedAt: string;
  snapshot: Record<string, unknown>;
}

export interface ResearchArtifactEvidence {
  kind: "complaint" | "log" | "trace" | "reproduction" | "code" | "test";
  label: string;
  detail?: string;
  file?: string;
  line?: number;
}

export interface ResearchArtifact {
  id?: string;
  schemaVersion: 1;
  workspaceId: string;
  caseId: string;
  issueId: string;
  ticketRevision: string;
  baseSha: string;
  contentHash: string;
  status: "current" | "stale";
  diagnosis: {
    verdict: "confirmed" | "not_reproduced" | "not_a_bug" | "needs_human";
    summary: string;
    rootCause?: string;
  };
  evidence: ResearchArtifactEvidence[];
  reproduction: {
    steps: string[];
    observed?: string;
    expected?: string;
  };
  files: Array<{ path: string; lines?: string; reason?: string }>;
  proposal: {
    summary: string;
    changes: string[];
    risks?: string[];
  };
  acceptanceCriteria: string[];
  checks: string[];
  hashes: Record<string, string>;
  createdAt: string;
}

export interface AgentUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  totalTokens?: number;
  durationMs?: number;
  quota?: Record<string, unknown>;
  cache?: Record<string, unknown>;
  reportedCostUsd?: number;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  durationMs: number;
  quota: Record<string, unknown>;
  cache: Record<string, unknown>;
  cost: {
    method: "included_in_subscription" | "reported" | "calculated" | "unknown";
    amountUsd?: number;
  };
}

export interface RoutingResolutionInput {
  stage: CodingStage;
  override?: StageRoutingPolicyOverride;
  repositoryPolicy?: StageRoutingPolicy;
  workspacePolicy?: StageRoutingPolicy;
  connections: Record<string, AgentConnection>;
  catalogs: Record<string, CatalogSnapshot | undefined>;
  automation: boolean;
  now?: Date;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function mergePolicy(
  stage: CodingStage,
  override: StageRoutingPolicy | StageRoutingPolicyOverride | undefined,
  repository: StageRoutingPolicy | undefined,
  workspace: StageRoutingPolicy | undefined,
): { policy: StageRoutingPolicy; source: PolicySource } {
  const layers = [
    { value: workspace, source: "workspace" as const },
    { value: repository, source: "repository" as const },
    { value: override, source: "override" as const },
  ].filter((layer) => layer.value?.stage === stage);
  const merged: StageRoutingPolicy = { stage, preset: "Custom" };
  let source: PolicySource = "workspace";
  for (const layer of layers) {
    const value = layer.value;
    if (!value) continue;
    Object.assign(merged, value);
    if (Object.keys(value).some((key) => key !== "stage"))
      source = layer.source;
    merged.budget = { ...merged.budget, ...value.budget };
    if (value.fallbackConnectionIds)
      merged.fallbackConnectionIds = [...value.fallbackConnectionIds];
  }
  return { policy: merged, source };
}

export function resolveRoutingPolicy(input: {
  stage: CodingStage;
  override?: StageRoutingPolicyOverride;
  repositoryPolicy?: StageRoutingPolicy;
  workspacePolicy?: StageRoutingPolicy;
}): { policy: StageRoutingPolicy; source: PolicySource } {
  return mergePolicy(
    input.stage,
    input.override,
    input.repositoryPolicy,
    input.workspacePolicy,
  );
}

function assertCatalogModel(
  connection: AgentConnection,
  catalog: CatalogSnapshot | undefined,
  model: string,
  effort: string | undefined,
  now: Date,
): void {
  if (!catalog || catalog.connectionId !== connection.id)
    throw new Error("agent_catalog_unverified");
  if (Date.parse(catalog.expiresAt) <= now.getTime())
    throw new Error("agent_catalog_expired");
  const selected = catalog.models.find((item) => item.id === model);
  if (!selected) throw new Error(`agent_model_unavailable:${model}`);
  if (effort && !(selected.efforts ?? []).includes(effort))
    throw new Error(`agent_effort_unavailable:${model}:${effort}`);
}

export function resolveEffectiveRunConfig(
  input: RoutingResolutionInput,
): EffectiveRunConfig {
  const now = input.now ?? new Date();
  const { policy, source } = resolveRoutingPolicy({
    stage: input.stage,
    override: input.override,
    repositoryPolicy: input.repositoryPolicy,
    workspacePolicy: input.workspacePolicy,
  });
  if (!policy.connectionId)
    throw new Error(`agent_route_missing:${input.stage}`);
  const connection = input.connections[policy.connectionId];
  if (!connection) throw new Error("agent_connection_not_found");
  if (connection.status !== "connected")
    throw new Error(`agent_connection_${connection.status}`);
  if (
    input.automation &&
    connection.authMethod === "subscription" &&
    !connection.automationConsent
  )
    throw new Error("agent_subscription_automation_not_consented");
  const model = policy.model?.trim();
  if (!model) throw new Error(`agent_model_missing:${input.stage}`);
  const effort = policy.effort?.trim() || undefined;
  assertCatalogModel(
    connection,
    input.catalogs[connection.id],
    model,
    effort,
    now,
  );
  const budget: StageBudget = {
    maxRuntimeMs: boundedNumber(
      policy.budget?.maxRuntimeMs,
      1_200_000,
      60_000,
      3_600_000,
    ),
    maxOutputTokens: boundedNumber(
      policy.budget?.maxOutputTokens,
      16_000,
      256,
      128_000,
    ),
    maxCostUsd:
      policy.budget?.maxCostUsd === undefined
        ? undefined
        : Math.max(0, policy.budget.maxCostUsd),
    maxRepairs: boundedNumber(policy.budget?.maxRepairs, 1, 0, 5),
  };
  const fallbackEnabled = policy.fallbackEnabled === true;
  const fallbackConnectionIds = fallbackEnabled
    ? [...new Set(policy.fallbackConnectionIds ?? [])].filter(
        (id) => id !== connection.id,
      )
    : [];
  for (const fallbackId of fallbackConnectionIds) {
    const fallback = input.connections[fallbackId];
    if (!fallback || fallback.status !== "connected")
      throw new Error(`agent_fallback_connection_unavailable:${fallbackId}`);
    if (
      input.automation &&
      fallback.authMethod === "subscription" &&
      !fallback.automationConsent
    )
      throw new Error(
        `agent_fallback_subscription_not_consented:${fallbackId}`,
      );
  }
  const fallbacks = fallbackConnectionIds.map((fallbackId) => {
    const fallback = input.connections[fallbackId]!;
    assertCatalogModel(
      fallback,
      input.catalogs[fallback.id],
      model,
      effort,
      now,
    );
    return {
      connectionId: fallback.id,
      provider: fallback.provider,
      authMethod: fallback.authMethod,
      model,
      ...(effort ? { effort } : {}),
    };
  });
  const snapshot = clone({
    ...policy,
    stage: input.stage,
    connectionId: connection.id,
    model,
    ...(effort ? { effort } : {}),
    budget,
    fallbackEnabled,
    fallbackConnectionIds,
    fallbacks,
  });
  return {
    stage: input.stage,
    connectionId: connection.id,
    provider: connection.provider,
    authMethod: connection.authMethod,
    model,
    ...(effort ? { effort } : {}),
    budget,
    fallbackEnabled,
    fallbackConnectionIds,
    fallbacks,
    preset: policy.preset,
    policySource: source,
    resolvedAt: now.toISOString(),
    snapshot,
  };
}

export function isRecoverableFallbackError(error: unknown): boolean {
  const message = String(
    error instanceof Error ? error.message : error,
  ).toLowerCase();
  if (
    /auth|credential|unauthori[sz]ed|forbidden|schema|security|permission|invalid_model/.test(
      message,
    )
  )
    return false;
  return /quota|rate.?limit|429|temporar|unavailable|503|overloaded|capacity|timeout/.test(
    message,
  );
}

export function contentAddressHash(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
}

export function createResearchArtifact(
  input: Omit<ResearchArtifact, "contentHash" | "status" | "createdAt"> & {
    createdAt?: string;
  },
): ResearchArtifact {
  const artifact = {
    ...clone(input),
    status: "current" as const,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ...artifact, contentHash: contentAddressHash(artifact) };
}

export function isResearchArtifactCurrent(
  artifact: Pick<ResearchArtifact, "ticketRevision" | "baseSha" | "status">,
  ticketRevision: string,
  baseSha: string,
): boolean {
  return (
    artifact.status === "current" &&
    artifact.ticketRevision === ticketRevision &&
    artifact.baseSha === baseSha
  );
}

export function assertRunContinuation(input: {
  parent: {
    issueId: string;
    repositoryId?: string;
    mode: "investigate" | "propose_fix" | "implement_fix";
    status: string;
    verdict?: string;
    researchArtifactId?: string;
  };
  child: {
    issueId: string;
    repositoryId: string;
    mode: "investigate" | "propose_fix" | "implement_fix";
    researchArtifactId?: string;
  };
}): void {
  if (
    input.parent.issueId !== input.child.issueId ||
    input.parent.repositoryId !== input.child.repositoryId
  )
    throw new Error("parent_run_scope_mismatch");
  if (input.parent.status !== "completed")
    throw new Error("parent_run_not_completed");
  if (input.parent.verdict !== "confirmed")
    throw new Error("parent_run_not_confirmed");
  if (!input.parent.researchArtifactId)
    throw new Error("parent_run_artifact_required");
  const transitionAllowed =
    (input.parent.mode === "investigate" &&
      ["propose_fix", "implement_fix"].includes(input.child.mode)) ||
    (input.parent.mode === "propose_fix" &&
      input.child.mode === "implement_fix");
  if (!transitionAllowed) throw new Error("parent_run_transition_invalid");
  if (input.parent.researchArtifactId !== input.child.researchArtifactId)
    throw new Error("parent_run_artifact_mismatch");
}

export function normalizeAgentUsage(
  raw: AgentUsage | Record<string, unknown> | undefined,
  authMethod: AuthMethod,
  calculatedCostUsd?: number,
): NormalizedUsage {
  const value = raw ?? {};
  const number = (key: string, fallback = 0) => {
    const candidate = (value as Record<string, unknown>)[key];
    return typeof candidate === "number" && Number.isFinite(candidate)
      ? Math.max(0, Math.round(candidate))
      : fallback;
  };
  const inputTokens = number("inputTokens", number("input_tokens"));
  const outputTokens = number("outputTokens", number("output_tokens"));
  const cachedInputTokens = number(
    "cachedInputTokens",
    number("cached_input_tokens"),
  );
  const totalTokens = number(
    "totalTokens",
    number("total_tokens", inputTokens + outputTokens),
  );
  const durationMs = number("durationMs", number("duration_ms"));
  const reportedCostUsd =
    typeof (value as Record<string, unknown>).reportedCostUsd === "number"
      ? Number((value as Record<string, unknown>).reportedCostUsd)
      : typeof (value as Record<string, unknown>).total_cost_usd === "number"
        ? Number((value as Record<string, unknown>).total_cost_usd)
        : undefined;
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalTokens,
    durationMs,
    quota:
      value.quota && typeof value.quota === "object"
        ? clone(value.quota as Record<string, unknown>)
        : {},
    cache:
      value.cache && typeof value.cache === "object"
        ? clone(value.cache as Record<string, unknown>)
        : {},
    cost:
      authMethod === "subscription"
        ? { method: "included_in_subscription" }
        : reportedCostUsd !== undefined
          ? { method: "reported", amountUsd: reportedCostUsd }
          : calculatedCostUsd !== undefined
            ? { method: "calculated", amountUsd: calculatedCostUsd }
            : { method: "unknown" },
  };
}

export function legacyModeForStage(
  stage: CodingStage,
): "investigate" | "propose_fix" | "implement_fix" {
  if (stage === "implement") return "implement_fix";
  if (stage === "review" || stage === "verify") return "propose_fix";
  return "investigate";
}

export function snapshotRoutingPolicy(
  policy: StageRoutingPolicy,
): StageRoutingPolicy {
  return clone({
    ...policy,
    fallbackConnectionIds: [...(policy.fallbackConnectionIds ?? [])],
    budget: { ...(policy.budget ?? {}) },
    snapshot: clone(policy.snapshot ?? {}),
  });
}
