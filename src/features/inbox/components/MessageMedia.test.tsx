// @vitest-environment jsdom
// i18n-exempt: test assertions cover media loading behavior, not rendered copy.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../types";
import { MessageMedia } from "./MessageMedia";
import i18n from "../../../i18n";

const message: Message = {
  id: "message-1",
  conversationId: "conversation-1",
  direction: "inbound",
  sender: "Customer",
  text: "Screenshot",
  time: "10:00",
  type: "image",
  mediaAssetId: "asset-1",
  attachment: { name: "screen.png", meta: "image/png" },
};

describe("MessageMedia", () => {
  let root: Root;
  let container: HTMLDivElement;
  let intersect: (visible: boolean) => void;

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(
          callback: (entries: Array<{ isIntersecting: boolean }>) => void,
        ) {
          intersect = (visible) => callback([{ isIntersecting: visible }]);
        }
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("does not resolve storage until media enters the viewport", async () => {
    const resolveUrl = vi.fn(async () => "https://media.test/preview");
    await act(async () => {
      root.render(
        <MessageMedia
          workspaceId="workspace-1"
          message={message}
          resolveUrl={resolveUrl}
          onError={() => undefined}
          onOpen={() => undefined}
        />,
      );
    });

    expect(resolveUrl).not.toHaveBeenCalled();

    await act(async () => intersect(true));

    expect(resolveUrl).toHaveBeenCalledWith("workspace-1", message, "preview");
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://media.test/preview",
    );
  });

  it("renders the custom audio player once the voice note url resolves", async () => {
    const audio: Message = {
      ...message,
      type: "audio",
      transcriptionStatus: "processing",
      text: "",
      attachment: { name: "voice.ogg", meta: "audio/ogg" },
    };
    const resolveUrl = vi.fn(async () => "https://media.test/voice.ogg");
    await act(async () => {
      root.render(
        <MessageMedia
          workspaceId="workspace-1"
          message={audio}
          resolveUrl={resolveUrl}
          onError={() => undefined}
          onOpen={() => undefined}
        />,
      );
    });

    expect(container.querySelector("audio")).toBeNull();

    await act(async () => intersect(true));

    expect(resolveUrl).toHaveBeenCalledWith("workspace-1", audio, "browser");
    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://media.test/voice.ogg",
    );
    expect(container.querySelector("audio")?.hasAttribute("controls")).toBe(
      false,
    );
    expect(
      container.querySelector('button[aria-label="Play audio"]'),
    ).not.toBeNull();
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    expect(container.textContent).toContain("Loading audio");
    expect(container.textContent).toContain("Transcribing audio");
  });
});
