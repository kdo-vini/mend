import { describe, expect, it } from "vitest";
import { nextPlaybackScene, playbackScenes } from "./playback";

describe("marketing playback", () => {
  it("advances through the support loop and wraps", () => {
    expect(playbackScenes).toEqual([
      "signal",
      "context",
      "investigate",
      "verify",
    ]);
    expect(nextPlaybackScene("signal")).toBe("context");
    expect(nextPlaybackScene("verify")).toBe("signal");
  });
});
