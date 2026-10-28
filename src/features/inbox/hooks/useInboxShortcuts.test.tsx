// @vitest-environment jsdom
// i18n-exempt: the harness renders no user-visible text.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useInboxShortcuts,
  type InboxShortcutHandlers,
} from "./useInboxShortcuts";

describe("useInboxShortcuts", () => {
  let root: Root;
  let container: HTMLDivElement;
  let handlers: InboxShortcutHandlers;

  function Harness() {
    useInboxShortcuts(handlers);
    return <textarea />;
  }

  const press = (key: string, init: KeyboardEventInit = {}, target?: Element) =>
    act(() => {
      (target ?? window).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
      );
    });

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    handlers = {
      onNext: vi.fn(),
      onPrevious: vi.fn(),
      onReply: vi.fn(),
      onResolve: vi.fn(),
      onToggleContext: vi.fn(),
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("maps J, K, R, E and I to the inbox actions", async () => {
    await press("j");
    await press("k");
    await press("r");
    await press("E");
    await press("i");
    expect(handlers.onNext).toHaveBeenCalledOnce();
    expect(handlers.onPrevious).toHaveBeenCalledOnce();
    expect(handlers.onReply).toHaveBeenCalledOnce();
    expect(handlers.onResolve).toHaveBeenCalledOnce();
    expect(handlers.onToggleContext).toHaveBeenCalledOnce();
  });

  it("stays out of the way while typing or with a modifier held", async () => {
    await press("j", {}, container.querySelector("textarea")!);
    await press("e", { ctrlKey: true });
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onResolve).not.toHaveBeenCalled();
  });

  it("leaves a key another shortcut already handled", async () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    await act(() => window.dispatchEvent(event));
    expect(handlers.onPrevious).not.toHaveBeenCalled();
  });
});
