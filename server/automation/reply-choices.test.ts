import { describe, expect, it } from "vitest";
import {
  formatChoicesAsTextFallback,
  parseReplyChoicesFromBody,
  resolveAiReplyChoices,
  resolveInboundChoiceLabel,
  stripNumericChoicePrompt,
} from "./reply-choices.js";

describe("ai reply choices", () => {
  it("parses responda 1 para / 2 para into buttons and strips the prompt", () => {
    const source =
      "Perfeito. Você quer que eu te envie o link do cardápio aqui no WhatsApp ou prefere instruções para abrir pelo QR code no local? Responda 1 para link ou 2 para QR.";
    const parsed = parseReplyChoicesFromBody(source);
    expect(parsed.choices).toEqual([
      { id: "link", label: "link" },
      { id: "qr", label: "QR" },
    ]);
    expect(parsed.body).toContain("link do cardápio");
    expect(parsed.body.toLocaleLowerCase("pt-BR")).not.toContain("responda 1");
  });

  it("prefers structured choices and strips numeric prompts", () => {
    const resolved = resolveAiReplyChoices({
      body: "Quer o link ou o QR? Responda 1 para link ou 2 para QR.",
      structuredChoices: [
        { id: "link_whatsapp", label: "Enviar link" },
        { id: "qr_local", label: "Instruções QR" },
      ],
    });
    expect(resolved.choices).toEqual([
      { id: "link_whatsapp", label: "Enviar link" },
      { id: "qr_local", label: "Instruções QR" },
    ]);
    expect(resolved.body).toBe("Quer o link ou o QR?");
  });

  it("formats a numbered text fallback and resolves inbound taps", () => {
    const choices = [
      { id: "link", label: "Enviar link" },
      { id: "qr", label: "QR no local" },
    ];
    expect(formatChoicesAsTextFallback("Como prefere?", choices)).toBe(
      "Como prefere?\n\n1. Enviar link\n2. QR no local",
    );
    expect(resolveInboundChoiceLabel(choices, "qr", undefined)).toBe(
      "QR no local",
    );
    expect(resolveInboundChoiceLabel(choices, undefined, "1")).toBe(
      "Enviar link",
    );
    expect(stripNumericChoicePrompt("Ok. Responda 1 para A ou 2 para B.")).toBe(
      "Ok.",
    );
  });
});
