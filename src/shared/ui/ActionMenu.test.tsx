// @vitest-environment jsdom
// i18n-exempt: test asserts geometry, and reads labels from the shared i18n instance.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { ActionMenu } from "./ActionMenu";

const phone = { width: 393, height: 852 };

let container: HTMLDivElement;
let root: Root;

/**
 * jsdom lays nothing out, so both boxes are stubbed: the trigger sits where the
 * failing screenshot put it — an outbound message's menu button, well left of
 * the right edge — and the menu is wider than the space beside it.
 */
function stubGeometry(trigger: { right: number; top: number }, menu: DOMRect) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if (this.getAttribute("role") === "menu") return menu;
    return {
      ...menu,
      width: 28,
      height: 28,
      top: trigger.top,
      bottom: trigger.top + 28,
      right: trigger.right,
      left: trigger.right - 28,
    } as DOMRect;
  } as typeof Element.prototype.getBoundingClientRect;
}

function menuBox(width: number, height: number) {
  return {
    width,
    height,
    top: 0,
    bottom: height,
    left: 0,
    right: width,
  } as DOMRect;
}

function openMenu() {
  const trigger = document.body.querySelector<HTMLButtonElement>(
    '[aria-haspopup="menu"]',
  );
  if (!trigger) throw new Error("menu trigger was not rendered");
  return act(async () => trigger.click());
}

function menuStyle() {
  const menu = document.body.querySelector<HTMLDivElement>('[role="menu"]');
  if (!menu) throw new Error("menu was not rendered");
  return menu.style;
}

describe("ActionMenu placement", () => {
  const nativeRect = Element.prototype.getBoundingClientRect;

  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  beforeEach(() => {
    window.innerWidth = phone.width;
    window.innerHeight = phone.height;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Element.prototype.getBoundingClientRect = nativeRect;
  });

  it("keeps a right-anchored menu inside the left edge of a phone screen", async () => {
    // Anchoring on the trigger alone would put the menu's left edge at
    // 393 - 138 - 260 = -5, exactly the clipped card in the bug report.
    stubGeometry({ right: 255, top: 300 }, menuBox(260, 120));
    await act(async () =>
      root.render(
        <ActionMenu label="message">
          {/* Geometry is stubbed, so the item's content is irrelevant here. */}
          <button type="button" />
        </ActionMenu>,
      ),
    );
    await openMenu();

    const style = menuStyle();
    const right = Number.parseFloat(style.right);
    expect(phone.width - right - 260).toBeGreaterThanOrEqual(8);
  });

  it("anchors to the trigger when the menu already fits beside it", async () => {
    stubGeometry({ right: 380, top: 300 }, menuBox(165, 120));
    await act(async () =>
      root.render(
        <ActionMenu label="message">
          {/* Geometry is stubbed, so the item's content is irrelevant here. */}
          <button type="button" />
        </ActionMenu>,
      ),
    );
    await openMenu();

    expect(menuStyle().right).toBe("13px");
    expect(menuStyle().top).toBe("332px");
  });

  it("flips above the trigger instead of running off the bottom", async () => {
    stubGeometry({ right: 380, top: 780 }, menuBox(165, 120));
    await act(async () =>
      root.render(
        <ActionMenu label="message">
          {/* Geometry is stubbed, so the item's content is irrelevant here. */}
          <button type="button" />
        </ActionMenu>,
      ),
    );
    await openMenu();

    // Below the trigger the menu would end at 808 + 120 = 928, past the 852
    // viewport, so it opens upward: 780 - 120 - 4.
    expect(menuStyle().top).toBe("656px");
  });
});
