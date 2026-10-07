import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  demo: false,
  apiRequest: vi.fn(),
}));

vi.mock("../../api/transport", async () => {
  const actual = await vi.importActual<typeof import("../../api/transport")>(
    "../../api/transport",
  );
  return {
    ...actual,
    isDemoModeRequested: () => transport.demo,
    apiRequest: transport.apiRequest,
  };
});

import { LiveActionError } from "../../api/transport";
import { projectsApi } from "./api";

describe("projectsApi", () => {
  beforeEach(() => {
    transport.demo = false;
    transport.apiRequest.mockReset();
  });

  it("falls back to an in-memory catalog in demo mode when no API answers", async () => {
    transport.demo = true;
    transport.apiRequest.mockResolvedValue(undefined);

    const { data } = await projectsApi.list();
    expect(data.length).toBeGreaterThan(0);

    const created = await projectsApi.save(
      {
        id: "demo-new",
        key: "Novo",
        name: "Novo",
        description: "",
        status: "active",
      },
      null,
    );
    expect(created.version).toBe(1);
    await expect(
      projectsApi.save({ ...created, status: "archived" }, 99),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("prefers a real API answer in demo mode", async () => {
    transport.demo = true;
    transport.apiRequest.mockResolvedValue({ data: [] });
    await expect(projectsApi.list()).resolves.toEqual({ data: [] });
    transport.apiRequest.mockRejectedValue(
      new LiveActionError("Conflict", 409, "project_conflict"),
    );
    await expect(
      projectsApi.save(
        { id: "x", key: "x", name: "x", description: "", status: "active" },
        1,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a malformed live response instead of leaking a TypeError", async () => {
    transport.apiRequest.mockResolvedValue(undefined);
    await expect(projectsApi.list()).rejects.toBeInstanceOf(LiveActionError);
  });
});
