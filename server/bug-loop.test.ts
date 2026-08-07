import { describe, expect, it } from "vitest";
import { bugFingerprint, bugInvestigationOutcome } from "./bug-loop.js";

describe("durable bug loop", () => {
  it("normalizes equivalent summaries into the same active-case fingerprint", () => {
    expect(bugFingerprint("Falha no check-out!")).toBe(
      bugFingerprint("falha no check out"),
    );
  });

  it("keeps only a bounded structured investigation envelope", () => {
    expect(
      bugInvestigationOutcome({
        agent: {
          provider: "claude",
          report: {
            verdict: "reproduced",
            summary: "Checkout fails when the cart has a coupon.",
            evidence: [
              { kind: "test", label: "checkout reproduction" },
              { kind: "code", label: "guard condition" },
            ],
            patch: "secret and very large patch must not be copied",
          },
        },
      }),
    ).toEqual({
      verdict: "confirmed",
      provider: "claude",
      summary: "Checkout fails when the cart has a coupon.",
      evidenceCount: 2,
      evidence: [
        { kind: "test", label: "checkout reproduction" },
        { kind: "code", label: "guard condition" },
      ],
    });
  });

  it("requires human review when an agent returns no recognized verdict", () => {
    expect(
      bugInvestigationOutcome({ agent: { finalText: "unclear" } }),
    ).toEqual({ verdict: "needs_human" });
  });

  it("reads the normalized CLI report persisted inside a completed run", () => {
    expect(
      bugInvestigationOutcome({
        run: {
          result: {
            provider: "gemini",
            agent: {
              report: {
                verdict: "confirmed",
                summary: "The regression test reproduces the complaint.",
                evidence: [{ kind: "test", label: "regression test" }],
              },
            },
          },
        },
      }),
    ).toEqual({
      verdict: "confirmed",
      provider: "gemini",
      summary: "The regression test reproduces the complaint.",
      evidenceCount: 1,
      evidence: [{ kind: "test", label: "regression test" }],
    });
  });
});
