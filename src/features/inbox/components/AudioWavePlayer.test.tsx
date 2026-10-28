// @vitest-environment jsdom
// i18n-exempt: this test asserts behavior with the configured English test locale.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_PLAYBACK_RATE_STORAGE_KEY,
  nextAudioPlaybackRate,
} from "../audio-playback-rate";
import { AudioWavePlayer } from "./AudioWavePlayer";
import "../../../i18n";

describe("AudioWavePlayer", () => {
  let root: Root;
  let container: HTMLDivElement;
  let playing: Set<HTMLMediaElement>;
  let currentTime: number;
  let duration: number;

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    playing = new Set();
    currentTime = 0;
    duration = 90;
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playing.add(this);
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playing.delete(this);
      this.dispatchEvent(new Event("pause"));
    });
    Object.defineProperty(HTMLMediaElement.prototype, "paused", {
      configurable: true,
      get(this: HTMLMediaElement) {
        return !playing.has(this);
      },
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
      "Reproduzir áudio",
    );
    expect(container.textContent).toContain("1:30");

    await act(async () => container.querySelector("button")?.click());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Pausar áudio",
    );

    await act(async () => container.querySelector("button")?.click());
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledOnce();
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Reproduzir áudio",
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

  it("speeds voice notes up without changing the voice's pitch and remembers the speed", async () => {
    await act(async () => {
      root.render(
        <AudioWavePlayer
          src="https://media.test/signed.ogg"
          onError={() => undefined}
        />,
      );
    });
    const audio = container.querySelector("audio")!;
    const rateButton = container.querySelector<HTMLButtonElement>(
      ".audio-wave-player__rate",
    )!;
    expect(rateButton.textContent).toBe("1×");

    await act(async () => rateButton.click());
    expect(rateButton.textContent).toBe("1,5×");
    expect(audio.playbackRate).toBe(1.5);
    expect(audio.preservesPitch).toBe(true);
    expect(window.localStorage.getItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY)).toBe(
      "1.5",
    );

    await act(async () => rateButton.click());
    expect(rateButton.textContent).toBe("2×");
    await act(async () => rateButton.click());
    expect(rateButton.textContent).toBe("1×");
    expect(audio.playbackRate).toBe(1);
  });

  it("starts at the speed chosen on another voice note", async () => {
    window.localStorage.setItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY, "2");
    await act(async () => {
      root.render(
        <AudioWavePlayer
          src="https://media.test/signed.ogg"
          onError={() => undefined}
        />,
      );
    });
    const audio = container.querySelector("audio")!;
    expect(
      container.querySelector(".audio-wave-player__rate")?.textContent,
    ).toBe("2×");

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".audio-wave-player__toggle")
        ?.click(),
    );
    expect(audio.playbackRate).toBe(2);
    expect(audio.preservesPitch).toBe(true);
  });

  it("falls back to 1x for a stored speed it does not offer", async () => {
    window.localStorage.setItem(AUDIO_PLAYBACK_RATE_STORAGE_KEY, "3");
    await act(async () => {
      root.render(
        <AudioWavePlayer
          src="https://media.test/signed.ogg"
          onError={() => undefined}
        />,
      );
    });
    expect(
      container.querySelector(".audio-wave-player__rate")?.textContent,
    ).toBe("1×");
    expect(nextAudioPlaybackRate(2)).toBe(1);
  });

  it("pauses the voice note that was playing when another one starts", async () => {
    await act(async () => {
      root.render(
        <>
          <AudioWavePlayer
            src="https://media.test/first.ogg"
            onError={() => undefined}
          />
          <AudioWavePlayer
            src="https://media.test/second.ogg"
            onError={() => undefined}
          />
        </>,
      );
    });
    const [first, second] = Array.from(container.querySelectorAll("audio"));
    const [firstToggle, secondToggle] = Array.from(
      container.querySelectorAll<HTMLButtonElement>(
        ".audio-wave-player__toggle",
      ),
    );

    await act(async () => firstToggle.click());
    expect(first.paused).toBe(false);

    await act(async () => secondToggle.click());
    expect(first.paused).toBe(true);
    expect(second.paused).toBe(false);
    expect(firstToggle.getAttribute("aria-label")).toBe("Reproduzir áudio");
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
