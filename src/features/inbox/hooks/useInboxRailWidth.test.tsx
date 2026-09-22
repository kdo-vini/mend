// @vitest-environment jsdom
// i18n-exempt: unit harness for resize math/persistence, not product UI copy.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clampInboxRailWidth,
  INBOX_RAIL_WIDTH_DEFAULT,
  INBOX_RAIL_WIDTH_MAX,
  INBOX_RAIL_WIDTH_MIN,
  INBOX_RAIL_WIDTH_STORAGE_KEY,
  useInboxRailWidth,
} from "./useInboxRailWidth";

function dispatchPointer(
  target: EventTarget,
  type: string,
  init: { button?: number; clientX: number },
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    button: { value: init.button ?? 0 },
    clientX: { value: init.clientX },
    pointerId: { value: 1 },
  });
  target.dispatchEvent(event);
}

function HookProbe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useInboxRailWidth>) => void;
}) {
  const api = useInboxRailWidth();
  onReady(api);
  return <button type="button" onPointerDown={api.onResizePointerDown} />;
}

describe("useInboxRailWidth", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useInboxRailWidth> | null = null;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    latest = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("clamps invalid and out-of-range widths", () => {
    expect(clampInboxRailWidth(Number.NaN)).toBe(INBOX_RAIL_WIDTH_DEFAULT);
    expect(clampInboxRailWidth(100)).toBe(INBOX_RAIL_WIDTH_MIN);
    expect(clampInboxRailWidth(900)).toBe(INBOX_RAIL_WIDTH_MAX);
    expect(clampInboxRailWidth(333.7)).toBe(334);
  });

  it("restores the persisted rail width on mount", async () => {
    window.localStorage.setItem(INBOX_RAIL_WIDTH_STORAGE_KEY, "410");
    await act(async () => {
      root.render(
        <HookProbe
          onReady={(api) => {
            latest = api;
          }}
        />,
      );
    });
    expect(latest?.width).toBe(410);
  });

  it("persists width after a drag ends", async () => {
    await act(async () => {
      root.render(
        <HookProbe
          onReady={(api) => {
            latest = api;
          }}
        />,
      );
    });
    if (!latest) throw new Error("hook api missing");
    const api = latest;

    await act(async () => {
      api.onResizePointerDown({
        button: 0,
        clientX: 320,
        preventDefault() {},
      } as Parameters<typeof api.onResizePointerDown>[0]);
    });
    await act(async () => {
      dispatchPointer(window, "pointermove", { clientX: 380 });
    });
    await act(async () => {
      dispatchPointer(window, "pointerup", { clientX: 380 });
    });

    expect(api.width).toBe(380);
    expect(window.localStorage.getItem(INBOX_RAIL_WIDTH_STORAGE_KEY)).toBe(
      "380",
    );
  });
});
