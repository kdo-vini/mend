import { describe, expect, it } from "vitest";
import {
  agentRunDestination,
  issueViewHref,
  issueWorkspaceView,
  legacyKanbanDestination,
} from "./workspace-routing";

describe("workspace routing", () => {
  it("defaults unknown issue views to the list", () => {
    expect(issueWorkspaceView("?demo=1")).toBe("list");
    expect(issueWorkspaceView("?view=timeline&demo=1")).toBe("list");
    expect(issueWorkspaceView("?view=board&demo=1")).toBe("board");
  });

  it("switches issue views without dropping unrelated query state", () => {
    expect(issueViewHref("board", "?demo=1&status=open")).toBe(
      "/issues?demo=1&status=open&view=board",
    );
    expect(issueViewHref("list", "?demo=1&view=board")).toBe("/issues?demo=1");
  });

  it("opens a run without dropping unrelated query state", () => {
    expect(agentRunDestination("run-204", "?demo=1")).toBe(
      "/agent-runs?demo=1&run=run-204",
    );
    expect(agentRunDestination("run-204", "?run=run-201&source=review")).toBe(
      "/agent-runs?run=run-204&source=review",
    );
    expect(agentRunDestination("run 204/a", "")).toBe(
      "/agent-runs?run=run+204%2Fa",
    );
  });

  it("redirects legacy shared and personal Kanban routes", () => {
    expect(legacyKanbanDestination("?demo=1")).toBe(
      "/issues?demo=1&view=board",
    );
    expect(legacyKanbanDestination("?mode=personal&demo=1")).toBe(
      "/my-work?demo=1",
    );
  });
});
