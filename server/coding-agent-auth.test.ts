import { stat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prepareSubscriptionLoginHome } from "./coding-agent-auth.js";

describe("coding agent subscription auth", () => {
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
