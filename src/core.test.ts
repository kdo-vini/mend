import { describe, expect, it } from "vitest";
import {
  createIssueIdentifier,
  isDuplicateIssue,
  safeRelativePath,
} from "./core";

describe("issue helpers", () => {
  it("creates a workspace-scoped identifier", () => {
    expect(createIssueIdentifier("TEC", 24)).toBe("TEC-24");
    expect(() => createIssueIdentifier("tec", 1)).toThrow();
  });

  it("detects an obvious duplicate without an external tracker", () => {
    expect(
      isDuplicateIssue("Pix payment does not update order", [
        "Payment Pix not updating order status",
      ]),
    ).toBe(true);
    expect(
      isDuplicateIssue("Add export for leads", [
        "Review register closing flow",
      ]),
    ).toBe(false);
  });

  it("rejects traversal outside a repo root", () => {
    expect(safeRelativePath("/repo", "src/app.ts")).toBe("/repo/src/app.ts");
    expect(() => safeRelativePath("/repo", "../secrets.env")).toThrow();
  });
});
