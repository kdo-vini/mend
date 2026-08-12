export interface WorkflowFactValue {
  workflowId: string;
  factType: string;
  valueBoolean: boolean | null;
  valueNumeric: number | null;
}

export interface ImpactPeriod {
  from: string;
  to: string;
}

function rate(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rate: denominator ? numerator / denominator : 0,
  };
}

export function computeImpactSummary(
  facts: readonly WorkflowFactValue[],
  period: ImpactPeriod,
) {
  const workflows = new Map<string, Map<string, WorkflowFactValue[]>>();
  for (const fact of facts) {
    const workflow = workflows.get(fact.workflowId) ?? new Map();
    const values = workflow.get(fact.factType) ?? [];
    values.push(fact);
    workflow.set(fact.factType, values);
    workflows.set(fact.workflowId, workflow);
  }
  const eligible = [...workflows.values()].filter((workflow) =>
    workflow.get("eligible")?.some((fact) => fact.valueBoolean !== false),
  );
  const hasTrue = (workflow: Map<string, WorkflowFactValue[]>, type: string) =>
    workflow.get(type)?.some((fact) => fact.valueBoolean !== false) ?? false;
  const founderFree = eligible.filter(
    (workflow) =>
      hasTrue(workflow, "ai_resolved") &&
      !hasTrue(workflow, "founder_intervention"),
  ).length;
  const totalCost = facts
    .filter((fact) => fact.factType === "cost_recorded")
    .reduce((sum, fact) => sum + (fact.valueNumeric ?? 0), 0);
  return {
    period,
    sampleSize: eligible.length,
    founderFreeResolution: rate(founderFree, eligible.length),
    groundedAnswer: rate(
      eligible.filter((workflow) => hasTrue(workflow, "grounded_answer"))
        .length,
      eligible.length,
    ),
    aiResolution: rate(
      eligible.filter((workflow) => hasTrue(workflow, "ai_resolved")).length,
      eligible.length,
    ),
    verifiedFix: rate(
      eligible.filter((workflow) => hasTrue(workflow, "fix_verified")).length,
      eligible.length,
    ),
    escalation: rate(
      eligible.filter((workflow) => hasTrue(workflow, "escalated")).length,
      eligible.length,
    ),
    costUsd: totalCost,
  };
}

export interface RunnerHeartbeat {
  workerId: string;
  lastSeenAt: string;
  currentJobType?: string | null;
  currentJobId?: string | null;
}

export function runnerIsReady(
  heartbeat: RunnerHeartbeat | null,
  now = new Date(),
  staleAfterMs = 120_000,
): boolean {
  if (!heartbeat) return false;
  const seen = Date.parse(heartbeat.lastSeenAt);
  return Number.isFinite(seen) && now.getTime() - seen <= staleAfterMs;
}
