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
import { MemoryRouter } from "react-router-dom";
import i18n from "../../i18n";
import { MobileBottomNav } from "./WorkspaceShell";

let container: HTMLDivElement;
let root: Root;

describe("MobileBottomNav availability", () => {
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

  it("lets a touch user open availability and choose Active from More", async () => {
    await i18n.changeLanguage("pt-BR");
    const onSetAvailability = vi.fn();
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/settings/team"]}>
          <MobileBottomNav
            theme="dark"
            operator={{ name: "ZeloPDV", email: "zelo@example.com" }}
            availability={false}
            availabilitySaving={false}
            onSetAvailability={onSetAvailability}
            onToggleTheme={vi.fn()}
            onSignOut={vi.fn()}
          />
        </MemoryRouter>,
      );
    });

    const more = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Mais"),
    );
    await act(async () => more?.click());

    const trigger = container.querySelector<HTMLButtonElement>(".user-row");
    expect(trigger?.textContent).toBe("ZZeloPDV");
    await act(async () => trigger?.click());
    const active = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Ativo"),
    );
    expect(active).toBeDefined();
    await act(async () => active?.click());
    expect(onSetAvailability).toHaveBeenCalledWith(true);
  });
});
