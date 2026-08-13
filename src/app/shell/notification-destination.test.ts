import { describe, expect, it } from "vitest";
import type { WorkspaceNotification } from "../../api/notifications";
import type { Issue } from "../../types";
import { notificationDestination } from "./notification-destination";

const notification = (entityType: string, entityId: string) =>
  ({ entity_type: entityType, entity_id: entityId }) as WorkspaceNotification;
const issues = [{ id: "issue-24", identifier: "TEC-24" }] as Issue[];

describe("notificationDestination", () => {
  it("opens the closest supported entity", () => {
    expect(
      notificationDestination(notification("conversation", "conv-1"), issues),
    ).toBe("/inbox?conversation=conv-1");
    expect(
      notificationDestination(notification("issue", "issue-24"), issues),
    ).toBe("/issues/TEC-24");
    expect(
      notificationDestination(notification("issue", "missing"), issues),
    ).toBe("/issues");
    expect(
      notificationDestination(notification("agent_run", "run-24"), issues),
    ).toBe("/agent-runs?run=run-24");
  });
});
