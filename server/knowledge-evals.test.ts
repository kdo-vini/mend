import { describe, expect, it } from "vitest";
import {
  evaluateKnowledgeRelease,
  techneKnowledgeEvaluationCorpus,
  type KnowledgeEvaluationResult,
} from "./knowledge-evals.js";

const passing = (id: string): KnowledgeEvaluationResult => ({
  id,
  kind: "single_product",
  expectedProductIds: ["pdv"],
  actualProductIds: ["pdv"],
  expectedEscalation: false,
  escalated: false,
  evidenceProductIds: ["pdv"],
  citationCoverage: 1,
  inventedCitations: 0,
  staleEvidence: 0,
  leakedInternalDetails: 0,
  crossTenantEvidence: 0,
});

describe("knowledge release evaluations", () => {
  it("ships the sanitized 75-case Techne corpus", () => {
    expect(techneKnowledgeEvaluationCorpus).toHaveLength(75);
    expect(
      techneKnowledgeEvaluationCorpus.filter(
        (item) => item.kind === "single_product",
      ),
    ).toHaveLength(45);
    expect(
      techneKnowledgeEvaluationCorpus.filter(
        (item) => item.kind === "cross_product",
      ),
    ).toHaveLength(10);
    expect(
      techneKnowledgeEvaluationCorpus.filter(
        (item) => item.kind === "ambiguous",
      ),
    ).toHaveLength(10);
    expect(
      techneKnowledgeEvaluationCorpus.filter(
        (item) => item.kind === "adversarial",
      ),
    ).toHaveLength(10);
  });

  it("blocks release on a single leakage or stale-evidence failure", () => {
    expect(evaluateKnowledgeRelease([passing("ok")]).eligible).toBe(true);
    expect(
      evaluateKnowledgeRelease([
        { ...passing("bad"), staleEvidence: 1, leakedInternalDetails: 1 },
      ]),
    ).toMatchObject({
      eligible: false,
      totals: { staleRepositoryEvidence: 1, internalDetailLeakage: 1 },
    });
  });

  it("requires 95% routing and escalation accuracy with complete citations", () => {
    const cases = Array.from({ length: 20 }, (_, index) =>
      passing(String(index)),
    );
    cases[0] = { ...cases[0], actualProductIds: ["chat"] };
    expect(evaluateKnowledgeRelease(cases).eligible).toBe(true);
    cases[1] = { ...cases[1], actualProductIds: ["chat"] };
    expect(evaluateKnowledgeRelease(cases).eligible).toBe(false);
    expect(
      evaluateKnowledgeRelease([
        { ...passing("uncited"), citationCoverage: 0.99 },
      ]).eligible,
    ).toBe(false);
  });
});
