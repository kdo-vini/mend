import { describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}));

vi.mock("./transport", () => ({ apiRequest }));

import {
  disconnectLiveGoogleConnection,
  listLiveGoogleConnections,
  saveLiveGoogleCalendarSelection,
  startLiveGoogleOAuth,
} from "./google-connections";

describe("Google connection API", () => {
  it("keeps every connection request scoped to the selected workspace", async () => {
    apiRequest.mockResolvedValueOnce({ data: [] });
    await listLiveGoogleConnections("workspace-1");
    await startLiveGoogleOAuth("workspace-1");
    await saveLiveGoogleCalendarSelection("workspace-1", "connection-1", [
      "primary",
    ]);
    await disconnectLiveGoogleConnection("workspace-1", "connection-1");

    expect(apiRequest.mock.calls).toEqual([
      ["/api/google/connections", {}, "workspace-1"],
      [
        "/api/google/connections/oauth/start",
        { method: "POST", body: "{}" },
        "workspace-1",
      ],
      [
        "/api/google/connections/connection-1/calendars",
        {
          method: "PATCH",
          body: JSON.stringify({ selectedCalendarIds: ["primary"] }),
        },
        "workspace-1",
      ],
      [
        "/api/google/connections/connection-1",
        { method: "DELETE" },
        "workspace-1",
      ],
    ]);
  });
});
