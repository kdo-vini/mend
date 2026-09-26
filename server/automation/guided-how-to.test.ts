import { describe, expect, it } from "vitest";
import {
  advanceGuidedHowToState,
  initialGuidedHowToState,
  readGuidedHowToState,
} from "./guided-how-to.js";

describe("guided how-to state", () => {
  it("starts waiting for confirmation before the first step", () => {
    expect(initialGuidedHowToState("cadastrar produtos")).toEqual({
      status: "awaiting_confirmation",
      step: 1,
      topic: "cadastrar produtos",
    });
  });

  it("starts step one after an affirmative answer and advances on ready", () => {
    const waiting = initialGuidedHowToState("cadastrar produtos");
    const started = advanceGuidedHowToState(waiting, "sim");
    expect(started).toMatchObject({ status: "in_progress", step: 1 });
    expect(advanceGuidedHowToState(started, "pronto")).toMatchObject({
      status: "in_progress",
      step: 2,
    });
  });

  it("ends the guide when the customer declines or stops", () => {
    const waiting = initialGuidedHowToState("cadastrar produtos");
    expect(advanceGuidedHowToState(waiting, "não").status).toBe("completed");
    expect(
      advanceGuidedHowToState({ ...waiting, status: "in_progress" }, "parar"),
    ).toMatchObject({ status: "completed", step: 1 });
  });

  it("ignores malformed persisted state", () => {
    expect(readGuidedHowToState({ status: "in_progress" })).toBeNull();
    expect(
      readGuidedHowToState({
        status: "in_progress",
        step: 2,
        topic: "cadastrar produtos",
      }),
    ).toEqual({
      status: "in_progress",
      step: 2,
      topic: "cadastrar produtos",
    });
  });
});
