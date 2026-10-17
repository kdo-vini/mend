import { describe, expect, it } from "vitest";
import {
  bugAcknowledgmentReplyBody,
  humanHandoffReplyBody,
} from "./handoff-replies.js";

describe("handoff reply copy", () => {
  it("keeps handoff messages customer-safe in Portuguese", () => {
    expect(humanHandoffReplyBody()).toMatch(/atendimento humano/i);
    expect(bugAcknowledgmentReplyBody()).toMatch(/equipe/i);
    expect(bugAcknowledgmentReplyBody()).toMatch(/atendente humano/i);
  });
});
