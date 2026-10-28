// @vitest-environment jsdom
// i18n-exempt: the harness renders no user-visible text.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAppendedSignature,
  useConversationScroll,
} from "./useConversationScroll";

describe("isAppendedSignature", () => {
  it("is true only when messages were added at the end", () => {
    expect(isAppendedSignature("a|b", "a|b|c")).toBe(true);
    expect(isAppendedSignature("c", "a|b|c")).toBe(false);
    expect(isAppendedSignature("a|temp:1", "a|m-1")).toBe(false);
    expect(isAppendedSignature("a|b", "a|b")).toBe(false);
    expect(isAppendedSignature(undefined, "a")).toBe(false);
  });
});

describe("useConversationScroll", () => {
  let root: Root;
  let container: HTMLDivElement;
  let frames: FrameRequestCallback[];
  let api: ReturnType<typeof useConversationScroll>;
  const scrollTo = vi.fn();

  function Harness(props: {
    conversationId: string;
    messageSignature: string;
  }) {
    api = useConversationScroll(props);
    return (
      <div ref={api.messageCanvasRef}>
        <div />
      </div>
    );
  }

  function runFrames() {
    const pending = frames;
    frames = [];
    pending.forEach((frame) => frame(0));
  }

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    frames = [];
    scrollTo.mockClear();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    HTMLElement.prototype.scrollTo =
      scrollTo as unknown as HTMLElement["scrollTo"];
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("jumps straight to the latest message when a thread hydrates", async () => {
    await act(async () =>
      root.render(<Harness conversationId="c-1" messageSignature="m-50" />),
    );
    runFrames();
    scrollTo.mockClear();

    await act(async () =>
      root.render(
        <Harness conversationId="c-1" messageSignature="m-1|m-2|m-50" />,
      ),
    );
    // Until the jump runs the canvas is still at the top; paging older
    // history in now would cancel it and strand the operator up there.
    expect(api.isBottomScrollPending()).toBe(true);
    runFrames();
    expect(api.isBottomScrollPending()).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });

  it("glides only for a live message added at the end", async () => {
    await act(async () =>
      root.render(<Harness conversationId="c-1" messageSignature="m-1|m-2" />),
    );
    runFrames();
    scrollTo.mockClear();

    await act(async () =>
      root.render(
        <Harness conversationId="c-1" messageSignature="m-1|m-2|m-3" />,
      ),
    );
    runFrames();
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });
});
