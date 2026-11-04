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
import { clientsApi } from "./api";

describe("clientsApi", () => {
  beforeEach(() => {
    transport.demo = false;
    transport.apiRequest.mockReset();
  });

  it("asks the API for archived clients only on request", async () => {
    transport.apiRequest.mockResolvedValue({
      data: [],
      permissions: { canEdit: true, canArchive: false },
    });
    await clientsApi.list(false);
    await clientsApi.list(true);
    expect(transport.apiRequest.mock.calls.map((call) => call[0])).toEqual([
      "/api/clients",
      "/api/clients?archived=1",
    ]);
  });

  it("sends writes as snake_case JSON to the contract routes", async () => {
    transport.apiRequest.mockResolvedValue({ data: { id: "c1" } });
    await clientsApi.update("c1", { stage: "ativo", archived: true });
    await clientsApi.addEntry("c1", { kind: "nota", body: "oi" });
    await clientsApi.linkIssue("c1", "MEND-142");
    const calls = transport.apiRequest.mock.calls;
    expect(calls[0]).toEqual([
      "/api/clients/c1",
      {
        method: "PATCH",
        body: JSON.stringify({ stage: "ativo", archived: true }),
      },
    ]);
    expect(calls[1][0]).toBe("/api/clients/c1/entries");
    expect(calls[2][0]).toBe("/api/clients/c1/issues");
  });

  it("does not hide real API errors, even in demo mode", async () => {
    transport.demo = true;
    transport.apiRequest.mockRejectedValue(
      new LiveActionError("Forbidden", 403),
    );
    await expect(clientsApi.list()).rejects.toThrow("Forbidden");
  });

  it("serves an in-memory demo when no API answers", async () => {
    transport.demo = true;
    // Like the dev server: an HTML page for reads, an HTML 404 for writes.
    transport.apiRequest.mockImplementation(
      async (_path: string, init?: RequestInit) => {
        if (init?.method)
          throw new LiveActionError("Mend API request failed (404).", 404);
        return undefined;
      },
    );
    const { data, permissions } = await clientsApi.list();
    expect(data.length).toBeGreaterThan(3);
    expect(data.every((client) => !client.archived_at)).toBe(true);
    expect(permissions.canEdit).toBe(true);

    const created = await clientsApi.create({ name: "Cliente novo" });
    await clientsApi.update(created.id, { stage: "proposta" });
    await clientsApi.addEntry(created.id, { kind: "nota", body: "oi" });
    await clientsApi.linkIssue(created.id, "MEND-999");
    const detail = await clientsApi.get(created.id);
    expect(detail.data.stage).toBe("proposta");
    expect(detail.data.entries.map((entry) => entry.kind).sort()).toEqual([
      "estagio",
      "nota",
    ]);
    expect(detail.data.issues.map((issue) => issue.identifier)).toEqual([
      "MEND-999",
    ]);

    await clientsApi.remove(created.id);
    await expect(clientsApi.get(created.id)).rejects.toThrow();
  });

  it("treats an HTML 404 on a write as no API in demo mode", async () => {
    transport.demo = true;
    transport.apiRequest.mockRejectedValue(
      new LiveActionError("Mend API request failed (404).", 404),
    );
    const created = await clientsApi.create({ name: "Offline" });
    expect(created.name).toBe("Offline");
  });
});
