// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { GO_PREFIX_TIMEOUT_MS } from "./app-shortcuts";
import { useAppShortcuts } from "./useAppShortcuts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Harness({
  commandOpen = false,
  createIssueOpen = false,
  onOpenCommand,
  onCreateIssue,
  onEscape,
}: {
  commandOpen?: boolean;
  createIssueOpen?: boolean;
  onOpenCommand: () => void;
  onCreateIssue: () => void;
  onEscape: () => void;
}) {
  const location = useLocation();
  useAppShortcuts({
    commandOpen,
    createIssueOpen,
    onOpenCommand,
    onCreateIssue,
    onEscape,
  });
  return <div data-testid="path">{location.pathname}</div>;
}

describe("useAppShortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onOpenCommand = vi.fn();
  const onCreateIssue = vi.fn();
  const onEscape = vi.fn();

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    onOpenCommand.mockReset();
    onCreateIssue.mockReset();
    onEscape.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  const mount = (
    props?: { commandOpen?: boolean; createIssueOpen?: boolean },
    initialPath = "/inbox",
  ) => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <Harness
            commandOpen={props?.commandOpen}
            createIssueOpen={props?.createIssueOpen}
            onOpenCommand={onOpenCommand}
            onCreateIssue={onCreateIssue}
            onEscape={onEscape}
          />
        </MemoryRouter>,
      );
    });
  };

  const press = (key: string, init: KeyboardEventInit = {}) => {
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
          ...init,
        }),
      );
    });
  };

  const pressFrom = (key: string, target: HTMLElement) => {
    act(() => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  };

  it("opens create issue on C when not typing", () => {
    mount();
    press("c");
    expect(onCreateIssue).toHaveBeenCalledOnce();
  });

  it("navigates with G then I", () => {
    mount(undefined, "/issues");
    press("g");
    press("i");
    expect(container.querySelector("[data-testid=path]")?.textContent).toBe(
      "/inbox",
    );
  });

  it("navigates with G then S to settings", () => {
    mount();
    press("g");
    press("s");
    expect(container.querySelector("[data-testid=path]")?.textContent).toBe(
      "/settings",
    );
  });

  it("clears the G prefix after the timeout so a late second key is ignored", () => {
    mount(undefined, "/issues");
    press("g");
    act(() => {
      vi.advanceTimersByTime(GO_PREFIX_TIMEOUT_MS);
    });
    press("i");
    expect(container.querySelector("[data-testid=path]")?.textContent).toBe(
      "/issues",
    );
  });

  it("ignores C while focused in an input", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    pressFrom("c", input);
    expect(onCreateIssue).not.toHaveBeenCalled();
    input.remove();
  });

  it("ignores chords while the command palette is open", () => {
    mount({ commandOpen: true });
    press("c");
    press("g");
    press("i");
    expect(onCreateIssue).not.toHaveBeenCalled();
  });

  it("Escape clears overlays via onEscape", () => {
    mount();
    press("Escape");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  it("Cmd/Ctrl+K opens the command palette", () => {
    mount();
    press("k", { metaKey: true });
    expect(onOpenCommand).toHaveBeenCalledOnce();
  });
});
