// @vitest-environment jsdom
// i18n-exempt: test assertions cover media loading behavior, not rendered copy.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "../../../types";
import { MessageMedia } from "./MessageMedia";
import "../../../i18n";

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
      container.querySelector('button[aria-label="Reproduzir áudio"]'),
    ).not.toBeNull();
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    expect(container.textContent).toContain("Carregando áudio");
    expect(container.textContent).toContain("Transcrevendo áudio");
  });

  it("keeps the voice note playing when a snapshot drops the resolved url", async () => {
    const audio: Message = {
      ...message,
      type: "audio",
      text: "",
      attachment: { name: "voice.ogg", meta: "audio/ogg" },
    };
    const resolveUrl = vi.fn(async () => "https://media.test/voice.ogg");
    const render = (current: Message) =>
      root.render(
        <MessageMedia
          workspaceId="workspace-1"
          message={current}
          resolveUrl={resolveUrl}
          onError={() => undefined}
          onOpen={() => undefined}
        />,
      );
    await act(async () =>
      render({
        ...audio,
        attachment: { ...audio.attachment!, url: undefined },
      }),
    );
    await act(async () => intersect(true));
    const player = container.querySelector("audio");
    expect(player?.getAttribute("src")).toBe("https://media.test/voice.ogg");

    await act(async () =>
      render({
        ...audio,
        attachment: {
          ...audio.attachment!,
          url: "https://media.test/voice.ogg",
        },
      }),
    );
    // Realtime refresh rebuilds the message without the signed url.
    await act(async () => render({ ...audio }));

    expect(container.querySelector("audio")).toBe(player);
    expect(resolveUrl).toHaveBeenCalledTimes(1);
  });

  it("resolves a fresh url after the current one failed and a snapshot drops it", async () => {
    const audio: Message = {
      ...message,
      type: "audio",
      text: "",
      attachment: { name: "voice.ogg", meta: "audio/ogg" },
    };
    const resolveUrl = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("https://media.test/expired.ogg")
      .mockResolvedValueOnce("https://media.test/fresh.ogg");
    const onError = vi.fn();
    const render = (current: Message) =>
      root.render(
        <MessageMedia
          workspaceId="workspace-1"
          message={current}
          resolveUrl={resolveUrl}
          onError={onError}
          onOpen={() => undefined}
        />,
      );
    await act(async () => render(audio));
    await act(async () => intersect(true));
    await act(async () => {
      container.querySelector("audio")?.dispatchEvent(new Event("error"));
    });
    expect(onError).toHaveBeenCalledTimes(1);

    await act(async () => render({ ...audio }));
    await act(async () => intersect(true));

    expect(container.querySelector("audio")?.getAttribute("src")).toBe(
      "https://media.test/fresh.ogg",
    );
  });

  it.each(["document", "image", "video"] as const)(
    "shows the caption of a %s even before its media loads",
    async (type) => {
      const media: Message = {
        ...message,
        type,
        text: "Segue o relatório de tráfego",
        attachment: { name: "Relatorio.pdf", meta: "application/pdf" },
      };
      await act(async () => {
        root.render(
          <MessageMedia
            workspaceId="workspace-1"
            message={media}
            resolveUrl={vi.fn(async () => "https://media.test/file")}
            onError={() => undefined}
            onOpen={() => undefined}
          />,
        );
      });

      expect(container.querySelector(".media-caption")?.textContent).toBe(
        "Segue o relatório de tráfego",
      );
      expect(container.textContent).toContain("Relatorio.pdf");
    },
  );

  it("labels a voice note's transcript and lets it fold away", async () => {
    const voiceNote: Message = {
      ...message,
      type: "audio",
      text: "Oi, o caixa não fecha desde ontem",
      attachment: { name: "audio.ogg", meta: "audio/ogg" },
    };
    await act(async () => {
      root.render(
        <MessageMedia
          workspaceId="workspace-1"
          message={voiceNote}
          resolveUrl={vi.fn(async () => "https://media.test/voice.ogg")}
          onError={() => undefined}
          onOpen={() => undefined}
        />,
      );
    });

    const transcript = container.querySelector("details.media-transcript");
    expect(transcript?.hasAttribute("open")).toBe(true);
    expect(transcript?.querySelector("summary")?.textContent).toBe(
      "Transcrição",
    );
    expect(transcript?.querySelector(".media-caption")?.textContent).toBe(
      "Oi, o caixa não fecha desde ontem",
    );
  });
});
