import { stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  challengeFromOutput,
  prepareSubscriptionLoginHome,
} from "./coding-agent-auth.js";

describe("coding agent subscription auth", () => {
  it("extracts an ANSI-colored Codex device challenge", () => {
    expect(
      challengeFromOutput(
        "Open \u001b[36mhttps://auth.openai.com/codex/device\u001b[0m and enter \u001b[1mABCD-EFGH\u001b[0m",
        "2026-08-12T02:00:00.000Z",
      ),
    ).toEqual({
      url: "https://auth.openai.com/codex/device",
      code: "ABCD-EFGH",
      expiresAt: "2026-08-12T02:00:00.000Z",
    });
  });

  it("extracts the current Codex four-by-five device code", () => {
    expect(
      challengeFromOutput(
        "Enter this one-time code\n   \u001b[94mABCD-EFGHI\u001b[0m",
        "2026-08-11T22:40:00.000Z",
      ),
    ).toEqual({
      code: "ABCD-EFGHI",
      expiresAt: "2026-08-11T22:40:00.000Z",
    });
  });

  it("prepares the Codex home outside the system temp directory", async () => {
    const homeDirectory = await prepareSubscriptionLoginHome();
    try {
      expect(path.relative(os.tmpdir(), homeDirectory).startsWith("..")).toBe(
        true,
      );
      expect(
        (await stat(path.join(homeDirectory, ".codex"))).isDirectory(),
      ).toBe(true);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
