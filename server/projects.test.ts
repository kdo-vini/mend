import { describe, expect, it } from "vitest";
import { projectRecord } from "./projects";

describe("projectRecord", () => {
  it("preserves a legacy key exactly while validating nonblank content", () => {
    const parsed = projectRecord.parse({
      id: "11111111-1111-4111-8111-111111111111",
      key: " Legacy Project ",
      name: "Legacy Project",
      description: "",
      status: "active",
    });
    expect(parsed.key).toBe(" Legacy Project ");
    expect(projectRecord.safeParse({ ...parsed, key: "   " }).success).toBe(
      false,
    );
  });
});
