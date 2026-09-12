import { describe, expect, it } from "vitest";
import {
  computeImpactSummary,
  computeKnowledgeMetricSummary,
  runnerIsReady,
} from "./impact.js";

describe("Impact metrics", () => {
  it("reports exact numerators, denominators, sample and period", () => {
    const facts = [
      ["one", "eligible", true],
      ["one", "grounded_answer", true],
      ["one", "ai_resolved", true],
      ["two", "eligible", true],
      ["two", "policy_required_touch", true],
      ["two", "grounded_answer", true],
      ["two", "ai_resolved", true],
      ["two", "fix_verified", true],
      ["three", "eligible", true],
      ["three", "founder_intervention", true],
      ["three", "escalated", true],
      ["three", "cost_recorded", 1.25],
    ].map(([workflowId, factType, value]) => ({
      workflowId: String(workflowId),
      factType: String(factType),
      valueBoolean: typeof value === "boolean" ? value : null,
      valueNumeric: typeof value === "number" ? value : null,
    }));

    const summary = computeImpactSummary(facts, {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-12T23:59:59.999Z",
    });

    expect(summary.sampleSize).toBe(3);
    expect(summary.founderFreeResolution).toEqual({
      numerator: 2,
      denominator: 3,
      rate: 2 / 3,
    });
    expect(summary.groundedAnswer).toEqual({
      numerator: 2,
      denominator: 3,
      rate: 2 / 3,
    });
    expect(summary.verifiedFix).toEqual({
      numerator: 1,
      denominator: 3,
      rate: 1 / 3,
    });
    expect(summary.costUsd).toBe(1.25);
  });

  it("fails readiness for a stale runner heartbeat", () => {
    expect(
      runnerIsReady(
        { workerId: "runner-1", lastSeenAt: "2026-08-12T12:00:00.000Z" },
        new Date("2026-08-12T12:02:01.000Z"),
      ),
    ).toBe(false);
    expect(
      runnerIsReady(
        { workerId: "runner-1", lastSeenAt: "2026-08-12T12:00:30.000Z" },
        new Date("2026-08-12T12:01:00.000Z"),
      ),
    ).toBe(true);
  });

  it("summarizes repository sync cost and retrieval outcomes", () => {
    const fact = (factType: string, valueNumeric: number | null = null) => ({
      workflowId: "one",
      factType,
      valueBoolean: valueNumeric === null ? true : null,
      valueNumeric,
    });
    expect(
      computeKnowledgeMetricSummary([
        fact("knowledge_sync_started"),
        fact("knowledge_sync_completed", 24),
        fact("knowledge_retrieval_sufficient", 3),
        fact("knowledge_retrieval_insufficient", 0),
        fact("knowledge_product_ambiguous"),
      ]),
    ).toMatchObject({
      syncs: { started: 1, completed: 1, failed: 0, chunksWritten: 24 },
      retrieval: { sufficient: 1, insufficient: 1, ambiguous: 1 },
    });
  });
});
