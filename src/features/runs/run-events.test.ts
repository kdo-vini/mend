import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../types";
import { runEventLabelKey, selectLatestRunEvent } from "./run-events";

const events: RunEvent[] = [
  {
    id: "newest",
    label: "commit_created",
    detail: "Commit criado",
    time: "16:12:25",
    occurredAt: "2026-08-13T19:12:25.000Z",
    tone: "success",
  },
  {
    id: "tail-but-older",
    label: "diff_ready",
    detail: "Patch pronto",
    time: "16:11:48",
    occurredAt: "2026-08-13T19:11:48.000Z",
    tone: "accent",
  },
];

describe("selectLatestRunEvent", () => {
  it("uses canonical timestamps instead of array position", () => {
    expect(selectLatestRunEvent(events)?.id).toBe("newest");
  });

  it("compares legacy clock values when canonical timestamps are absent", () => {
    expect(
      selectLatestRunEvent(
        events.map(({ occurredAt: _occurredAt, ...event }) => event),
      )?.id,
    ).toBe("newest");
  });
});

describe("runEventLabelKey", () => {
  it("maps canonical event names to semantic translation keys", () => {
    expect(runEventLabelKey("commit_created")).toBe("commitCreated");
    expect(runEventLabelKey("unknown.plugin.event")).toBe("other");
  });
});
