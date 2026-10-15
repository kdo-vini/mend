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
import "../../../i18n";
import type { WhatsAppInstance } from "../api";

vi.mock("../api", () => ({
  listLiveChannels: vi.fn(),
  refreshLiveChannel: vi.fn(),
  createLiveChannel: vi.fn(),
  disconnectLiveChannel: vi.fn(),
  removeLiveChannel: vi.fn(),
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
    ).toBe("Conectado");
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
    ).toBe("Precisa de atenção");
    expect(container.textContent).toContain("Estado do provedor: fechado");
  });

  it("checks the provider before showing a cached connected channel", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });

    await render();

    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Precisa de atenção");
    expect(container.textContent).toContain("Estado do provedor: fechado");
  });

  it("keeps the channel usable when live status refresh fails", async () => {
    await render();
    vi.mocked(settingsApi.refreshLiveChannel).mockRejectedValue(
      new Error("upstream unavailable"),
    );

    await act(async () => vi.advanceTimersByTimeAsync(3_000));

    expect(
      container.querySelector(".settings-v2-status")?.textContent?.trim(),
    ).toBe("Conectado");
    expect(container.textContent).toContain(
      "Não foi possível atualizar o status de alguns números",
    );
    expect(container.textContent).not.toContain(
      "O WhatsApp está indisponível.",
    );
  });

  it("does not treat a failed provider refresh as a global outage on load", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockRejectedValue(
      new Error("upstream unavailable"),
    );

    await render();

    expect(container.textContent).toContain("Estado do provedor: aberto");
    expect(container.textContent).toContain(
      "Não foi possível atualizar o status de alguns números",
    );
    expect(container.textContent).not.toContain(
      "O WhatsApp está indisponível.",
    );
  });

  async function generateQr() {
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Gerar QR"),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  }

  it("renders the QR data URI returned by the API without corrupting it", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });
    const data = "data:image/png;base64,iVBORw0KGgo=";
    vi.mocked(settingsApi.getLiveChannelQr).mockResolvedValue({ data });
    await render();
    await generateQr();
    expect(container.querySelector(".qr-image")?.getAttribute("src")).toBe(
      data,
    );
  });

  it("starts pairing and shows the QR when connecting a closed channel", async () => {
    vi.mocked(settingsApi.refreshLiveChannel)
      .mockResolvedValueOnce({
        ...connected,
        state: "closed",
      })
      .mockResolvedValue({
        ...connected,
        state: "qr-code",
      });
    const data = "data:image/png;base64,reconnect=";
    vi.mocked(settingsApi.getLiveChannelQr).mockResolvedValue({ data });
    await render();

    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Conectar"),
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());

    expect(settingsApi.getLiveChannelQr).toHaveBeenCalledWith({
      workspaceId: "workspace-test",
      channelId: "channel-test",
    });
    expect(container.querySelector(".qr-image")?.getAttribute("src")).toBe(
      data,
    );
  });

  it("shows the QR returned when creating a new instance", async () => {
    vi.mocked(settingsApi.listLiveChannels).mockResolvedValue([]);
    vi.mocked(settingsApi.createLiveChannel).mockResolvedValue({
      channelId: "channel-new",
      instanceName: "mend-new",
      state: "qr-code",
      qr: "data:image/png;base64,created=",
    });
    await render();

    const createButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.includes("Criar instância"),
    );
    expect(createButton).toBeDefined();
    await act(async () => createButton!.click());

    expect(settingsApi.createLiveChannel).toHaveBeenCalled();
    expect(container.querySelector(".qr-image")?.getAttribute("src")).toBe(
      "data:image/png;base64,created=",
    );
  });

  it("expands the QR code on click for easier phone scanning", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });
    vi.mocked(settingsApi.createLiveChannel).mockResolvedValue({
      ...connected,
      state: "qr-code",
      qr: "data:image/png;base64,created=",
    });
    await render();

    const createButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.includes("Criar instância"),
    );
    await act(async () => createButton!.click());

    const zoom = container.querySelector(".settings-v2-qr-zoom");
    expect(zoom).not.toBeNull();
    expect(zoom?.classList.contains("is-expanded")).toBe(false);
    await act(async () => (zoom as HTMLButtonElement).click());
    expect(zoom?.classList.contains("is-expanded")).toBe(true);
  });

  it("shows a remove action for a disconnected channel", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });
    vi.mocked(settingsApi.removeLiveChannel).mockResolvedValue();
    await render();

    const removeButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.includes("Excluir"),
    );
    expect(removeButton).toBeDefined();
    await act(async () => removeButton!.click());
    expect(settingsApi.removeLiveChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-test",
      channelId: "channel-test",
    });
  });

  it("renews the QR while pairing and stops requesting it after connection", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });
    vi.mocked(settingsApi.getLiveChannelQr)
      .mockResolvedValueOnce({ data: "data:image/png;base64,first" })
      .mockResolvedValue({ data: "data:image/png;base64,renewed" });
    await render();
    await generateQr();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(settingsApi.getLiveChannelQr).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".qr-image")?.getAttribute("src")).toBe(
      "data:image/png;base64,renewed",
    );
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue(connected);
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(container.querySelector(".qr-image")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(settingsApi.getLiveChannelQr).toHaveBeenCalledTimes(2);
  });

  it("removes a stale QR after a renewal failure and retries automatically", async () => {
    vi.mocked(settingsApi.refreshLiveChannel).mockResolvedValue({
      ...connected,
      state: "closed",
    });
    vi.mocked(settingsApi.getLiveChannelQr)
      .mockResolvedValueOnce({ data: "data:image/png;base64,first" })
      .mockRejectedValueOnce(new Error("QR unavailable"))
      .mockResolvedValue({ data: "data:image/png;base64,recovered" });
    await render();
    await generateQr();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(container.querySelector(".qr-image")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(container.querySelector(".qr-image")?.getAttribute("src")).toBe(
      "data:image/png;base64,recovered",
    );
  });
});
