import { describe, expect, it } from "vitest";
import {
  boundedEvidenceBundle,
  validateGroundedSupportReply,
  type SupportKnowledgeEvidence,
} from "./support-evidence.js";

const resolution = {
  productIds: ["pdv"],
  primaryProductId: "pdv",
  confidence: 1,
  source: "alias" as const,
  ambiguous: false,
};
const evidence: SupportKnowledgeEvidence = {
  evidenceKey: "kb:one",
  articleId: "a",
  chunkId: "c",
  articleVersion: "v",
  productIds: ["pdv"],
  sourceKind: "manual",
  title: "Caixa",
  heading: "Abrir",
  content: "Abra o caixa em Operações.",
  trustLevel: "reviewed",
  audience: "customer",
  score: 0.9,
};

describe("support evidence", () => {
  it("bounds evidence and requires supplied citations", () => {
    const bundle = boundedEvidenceBundle(resolution, [evidence]);
    expect(bundle.sufficient).toBe(true);
    expect(
      validateGroundedSupportReply(
        {
          body: "Abra o caixa em Operações.",
          usedCitationKeys: ["kb:one"],
          confidence: 0.9,
          customerSafe: true,
          needsClarification: false,
        },
        bundle,
      ),
    ).toEqual({ valid: true });
    expect(
      validateGroundedSupportReply(
        {
          body: "Resposta",
          usedCitationKeys: ["kb:invented"],
          confidence: 0.9,
          customerSafe: true,
          needsClarification: false,
        },
        bundle,
      ),
    ).toMatchObject({ valid: false, reason: "unknown_citation" });
  });

  it("blocks internal implementation detail", () => {
    const bundle = boundedEvidenceBundle(resolution, [evidence]);
    expect(
      validateGroundedSupportReply(
        {
          body: "Veja C:\\srv\\app.ts e secret=abc",
          usedCitationKeys: ["kb:one"],
          confidence: 0.9,
          customerSafe: true,
          needsClarification: false,
        },
        bundle,
      ),
    ).toMatchObject({ valid: false, reason: "customer_unsafe_content" });
  });

  it("requires clarification for ambiguous products", () => {
    const bundle = boundedEvidenceBundle({ ...resolution, ambiguous: true }, [
      evidence,
    ]);
    expect(
      validateGroundedSupportReply(
        {
          body: "Tente novamente.",
          usedCitationKeys: ["kb:one"],
          confidence: 0.9,
          customerSafe: true,
          needsClarification: false,
        },
        bundle,
      ),
    ).toMatchObject({ valid: false, reason: "product_ambiguous" });
  });
});
