import { describe, expect, it } from "vitest";
import {
  bugAcknowledgmentReplyBody,
  humanHandoffReplyBody,
} from "./handoff-replies.js";

describe("handoff reply copy", () => {
  it("keeps handoff messages customer-safe and language-specific", () => {
    expect(humanHandoffReplyBody("pt-BR")).toMatch(/atendimento humano/i);
    expect(humanHandoffReplyBody("en-US")).toMatch(/teammate/i);
    expect(bugAcknowledgmentReplyBody("pt-BR")).toMatch(/equipe/i);
    expect(bugAcknowledgmentReplyBody("en-US")).toMatch(/team/i);
  });
});
