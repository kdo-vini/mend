// @vitest-environment jsdom
// i18n-exempt: labels come from the shared locale catalog in the two language checks.

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
import i18n from "../../i18n";
import { WorkspaceAvailability } from "./WorkspaceAvailability";

let container: HTMLDivElement;
let root: Root;

async function render({
  onChange = vi.fn(),
  onOpenProfile = vi.fn(),
  isActive = false,
}: {
  onChange?: (isActive: boolean) => void;
  onOpenProfile?: () => void;
  isActive?: boolean;
} = {}) {
  await act(async () => {
    root.render(
      <WorkspaceAvailability
        name="ZeloPDV"
        initials="Z"
        isActive={isActive}
        disabled={false}
        onChange={onChange}
        onOpenProfile={onOpenProfile}
      />,
    );
  });
  return { onChange, onOpenProfile };
}

describe("WorkspaceAvailability", () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows only the avatar and name before the availability menu opens", async () => {
    await i18n.changeLanguage("en-US");
    await render();

    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    expect(trigger?.textContent).toBe("ZZeloPDV");
    expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.textContent).not.toContain("Session");
    expect(container.textContent).not.toContain("@gmail.com");
  });

  it("opens on keyboard focus and changes to Active", async () => {
    await i18n.changeLanguage("en-US");
    const { onChange } = await render();
    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.focus());

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const active = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Active"),
    );
    expect(active).toBeDefined();
    await act(async () => active?.click());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("can reopen after Escape closes the menu from the focused trigger", async () => {
    await i18n.changeLanguage("en-US");
    await render();
    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    await act(async () => trigger!.focus());
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const active = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Active"),
    );
    await act(async () => active?.focus());

    await act(async () =>
      active!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    await act(async () => {
      trigger!.blur();
      trigger!.focus();
    });
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens on pointer hover and exposes Away in Portuguese", async () => {
    await i18n.changeLanguage("pt-BR");
    const { onChange } = await render({ isActive: true });
    const rootElement = container.querySelector<HTMLElement>(
      ".workspace-availability",
    );
    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    await act(async () =>
      rootElement?.dispatchEvent(new Event("pointerover", { bubbles: true })),
    );

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("Ativo");
    expect(document.body.textContent).toContain("Ausente");
    expect(document.body.textContent).not.toContain("Conversas existentes");
    const away = [...document.body.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Ausente"),
    );
    await act(async () => away?.click());
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("keeps the menu open while the pointer crosses the hover bridge", async () => {
    await i18n.changeLanguage("en-US");
    await render({ isActive: true });
    const rootElement = container.querySelector<HTMLElement>(
      ".workspace-availability",
    );
    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    await act(async () =>
      rootElement?.dispatchEvent(new Event("pointerover", { bubbles: true })),
    );

    const bridge = container.querySelector<HTMLElement>(
      ".workspace-availability-hover-bridge",
    );
    expect(bridge).not.toBeNull();
    const pointerOut = new Event("pointerout", { bubbles: true });
    Object.defineProperty(pointerOut, "relatedTarget", { value: bridge });
    await act(async () => rootElement?.dispatchEvent(pointerOut));

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens from a click for touch users and keeps profile access in the menu", async () => {
    await i18n.changeLanguage("en-US");
    const { onOpenProfile } = await render({ isActive: true });
    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    await act(async () => trigger?.click());

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const profile = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent === "Profile",
    );
    expect(profile).toBeDefined();
    await act(async () => profile?.click());
    expect(onOpenProfile).toHaveBeenCalledOnce();
  });
});
