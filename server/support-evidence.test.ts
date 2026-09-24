import { describe, expect, it } from "vitest";
import {
  boundedEvidenceBundle,
  sanitizeCustomerSupportReply,
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

  it("strips operator escalation playbooks from customer replies", () => {
    const raw = [
      "Oi! O módulo de *Mesas* é um *add-on*.",
      "",
      "Fluxo básico:",
      "1. Acesse o mapa de mesas.",
      "2. Toque em uma mesa livre.",
      "",
      "Quando encaminhar para humano: mesa travada, comanda que não fecha, add-on ativo mas módulo inacessível.",
      "",
      "Quer que eu te guie passo a passo no app agora?",
    ].join("\n");
    const cleaned = sanitizeCustomerSupportReply(raw);
    expect(cleaned).toContain("1. Acesse o mapa de mesas.");
    expect(cleaned).toContain("Quer que eu te guie");
    expect(cleaned.toLowerCase()).not.toContain("quando encaminhar");
    expect(cleaned.toLowerCase()).not.toContain("mesa travada");
    expect(cleaned).not.toContain("Fluxo básico");
  });

  it("keeps short model answers while dropping the label", () => {
    const cleaned = sanitizeCustomerSupportReply(
      [
        "Resposta curta modelo:",
        '"No ZeloPDV, Mesas é um add-on. Quer o passo a passo?"',
      ].join("\n"),
    );
    expect(cleaned).toContain("Mesas é um add-on");
    expect(cleaned.toLowerCase()).not.toContain("resposta curta modelo");
  });

  it("rejects unsanitized operator playbook leaks", () => {
    const bundle = boundedEvidenceBundle(resolution, [evidence]);
    expect(
      validateGroundedSupportReply(
        {
          body: "Abra o caixa. Quando encaminhar para humano: falha no PDV.",
          usedCitationKeys: ["kb:one"],
          confidence: 0.9,
          customerSafe: true,
          needsClarification: false,
        },
        bundle,
      ),
    ).toMatchObject({ valid: false, reason: "operator_playbook_leak" });
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
