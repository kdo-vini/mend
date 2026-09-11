// @vitest-environment jsdom
// i18n-exempt: tests render translated output through the shared i18n instance.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n from "../../../i18n";
import type { WhatsAppInstance } from "../api";

vi.mock("../api", () => ({
  listLiveChannels: vi.fn(),
  refreshLiveChannel: vi.fn(),
  connectLiveChannel: vi.fn(),
  createLiveChannel: vi.fn(),
  disconnectLiveChannel: vi.fn(),
  getLiveChannelQr: vi.fn(),
}));

import * as settingsApi from "../api";
import { SettingsWhatsAppPage } from "./SettingsWhatsAppPage";

const connected: WhatsAppInstance = {
  channelId: "channel-test",
  instanceName: "mend-test",
  state: "open",
};

describe("WhatsApp connection status", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onToast = vi.fn();
  const onChannelChange = vi.fn();
  const onConfirm = vi.fn(async () => true);

  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    container = document.createElement("div");
    root = createRoot(container);
    vi.mocked(settingsApi.listLiveChannels).mockResolvedValue([connected]);
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue(connected);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  });

  async function render() {
    await act(async () => {
      root.render(
        <SettingsWhatsAppPage
          workspaceId="workspace-test"
          onToast={onToast}
          onChannelChange={onChannelChange}
          onConfirm={onConfirm}
        />,
      );
    });
  }

  it("detects a disconnected provider while the page still has a connected channel", async () => {
    await render();
    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Connected");
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });

    await act(async () => vi.advanceTimersByTimeAsync(3_000));

    expect(settingsApi.refreshLiveChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-test",
      channelId: "channel-test",
    });
    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Needs attention");
    expect(container.textContent).toContain("Provider state: closed");
  });

  it("checks the provider before showing a cached connected channel", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });

    await render();

    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Needs attention");
    expect(container.textContent).toContain("Provider state: closed");
  });

  it("does not keep claiming a verified connection when live status fails", async () => {
    await render();
    vi.mocked(settingsApi.refreshLiveChannel).mockRejectedValue(
      new Error("upstream unavailable"),
    );

    await act(async () => vi.advanceTimersByTimeAsync(3_000));

    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Needs attention");
    expect(container.textContent).toContain("Provider state: unavailable");
    expect(onChannelChange).toHaveBeenLastCalledWith({
      ...connected,
      state: "unknown",
    });
  });
});
