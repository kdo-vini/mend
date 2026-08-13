import { describe, expect, it } from "vitest";
import {
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

  it("redirects legacy shared and personal Kanban routes", () => {
    expect(legacyKanbanDestination("?demo=1")).toBe(
      "/issues?demo=1&view=board",
    );
    expect(legacyKanbanDestination("?mode=personal&demo=1")).toBe(
      "/my-work?demo=1",
    );
  });
});
