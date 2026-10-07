// @vitest-environment jsdom
// i18n-exempt: this test asserts behavior with the configured English test locale.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioWavePlayer } from "./AudioWavePlayer";
import i18n from "../../../i18n";

describe("AudioWavePlayer", () => {
  let root: Root;
  let container: HTMLDivElement;
  let paused: boolean;
  let currentTime: number;
  let duration: number;

  beforeEach(async () => {
    await i18n.changeLanguage("en-US");
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    paused = true;
    currentTime = 0;
    duration = 90;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = false;
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      paused = true;
      this.dispatchEvent(new Event("pause"));
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "duration", {
      configurable: true,
      get: () => duration,
    });
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("plays, pauses, and seeks while reflecting media events", async () => {
    await act(async () => {
      root.render(
        <AudioWavePlayer
          src="https://media.test/signed.ogg"
          onError={() => undefined}
        />,
      );
    });
    const audio = container.querySelector("audio")!;

    expect(audio.getAttribute("src")).toBe("https://media.test/signed.ogg");
    expect(audio.getAttribute("preload")).toBe("metadata");
    expect(container.querySelector("button")?.disabled).toBe(false);
    expect(
      container
        .querySelector('input[type="range"]')
        ?.closest('[aria-hidden="true"]'),
    ).toBeNull();

    await act(async () => audio.dispatchEvent(new Event("loadedmetadata")));
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Play audio",
    );
    expect(container.textContent).toContain("1:30");

    await act(async () => container.querySelector("button")?.click());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Pause audio",
    );

    await act(async () => container.querySelector("button")?.click());
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Play audio",
    );

    const seek = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(seek, "45");
      seek.dispatchEvent(new Event("input", { bubbles: true }));
      seek.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(currentTime).toBe(45);
    expect(seek.value).toBe("45");
  });

  it("reports media playback failures", async () => {
    const onError = vi.fn();
    await act(async () => {
      root.render(
        <AudioWavePlayer
          src="https://media.test/broken.ogg"
          onError={onError}
        />,
      );
    });
    await act(async () =>
      container.querySelector("audio")?.dispatchEvent(new Event("error")),
    );
    expect(onError).toHaveBeenCalledOnce();
  });
});
