import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../../api/transport", async () => ({
  ...(await vi.importActual<typeof import("../../api/transport")>(
    "../../api/transport",
  )),
  apiRequest,
}));

import { isWhatsAppDisconnected } from "./api";

const channels = (...statuses: string[]) => ({
  data: statuses.map((status, index) => ({
    id: `channel-${index}`,
    name: `WhatsApp ${index}`,
    providerInstanceName: `mend-${index}`,
    status,
  })),
});

describe("WhatsApp channel status for the thread warning", () => {
  afterEach(() => apiRequest.mockReset());

  it("warns when every channel lost its session", async () => {
    apiRequest.mockResolvedValue(channels("closed"));
    await expect(isWhatsAppDisconnected("ws-1")).resolves.toBe(true);
  });

  it("stays quiet while any channel is open", async () => {
    apiRequest.mockResolvedValue(channels("closed", "open"));
    await expect(isWhatsAppDisconnected("ws-1")).resolves.toBe(false);
  });

  it("treats a workspace without channels as onboarding, not an outage", async () => {
    apiRequest.mockResolvedValue(channels());
    await expect(isWhatsAppDisconnected("ws-1")).resolves.toBe(false);
  });
});
