import { describe, expect, it } from "vitest";
import {
  completedKanbanRetentionMs,
  isCompletionArchived,
  nextCompletionArchiveAt,
} from "./completion-archive";

describe("completed Kanban item archiving", () => {
  const completedAt = "2026-08-10T12:00:00.000Z";
  const expiresAt = Date.parse(completedAt) + completedKanbanRetentionMs;

  it("keeps completed work visible for its first 24 hours", () => {
    expect(isCompletionArchived(completedAt, expiresAt - 1)).toBe(false);
  });

  it("archives completed work exactly after 24 hours", () => {
    expect(isCompletionArchived(completedAt, expiresAt)).toBe(true);
    expect(nextCompletionArchiveAt(completedAt)).toBe(expiresAt);
  });

  it("keeps legacy items visible until they have a completion time", () => {
    expect(isCompletionArchived(null, expiresAt + 1)).toBe(false);
    expect(nextCompletionArchiveAt("not-a-date")).toBeNull();
  });
});
