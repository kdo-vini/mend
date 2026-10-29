// @vitest-environment jsdom
// i18n-exempt: this test asserts the Portuguese labels the operator sees.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../../../types";
import { InboxCaseContext } from "./InboxCaseContext";
import "../../../i18n";

describe("InboxCaseContext on desktop", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (collapsed: boolean, onToggle = vi.fn()) =>
    act(async () =>
      root.render(
        <InboxCaseContext
          conversation={{ automationState: "ai_active" } as Conversation}
          open={false}
          onClose={() => undefined}
          onOpenIssue={() => undefined}
          customer={<p className="customer-stub" />}
          collapsed={collapsed}
          onToggleCollapsed={onToggle}
        >
          <span />
        </InboxCaseContext>,
      ),
    );

  it("folds the details under the header and keeps the column", async () => {
    const onToggle = vi.fn();
    await render(true, onToggle);
    const aside = container.querySelector("aside")!;
    expect(aside.classList.contains("collapsed")).toBe(true);
    const toggle = container.querySelector<HTMLButtonElement>(
      ".inbox-case-context-toggle",
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Mostrar painel do cliente");
    expect(
      container
        .querySelector(".inbox-case-context-body > div")
        ?.hasAttribute("inert"),
    ).toBe(true);
    await act(async () => toggle.click());
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows the details when expanded", async () => {
    await render(false);
    expect(
      container.querySelector("aside")?.classList.contains("collapsed"),
    ).toBe(false);
    expect(
      container
        .querySelector(".inbox-case-context-toggle")
        ?.getAttribute("aria-expanded"),
    ).toBe("true");
    expect(container.querySelector(".customer-stub")).not.toBeNull();
  });
});
