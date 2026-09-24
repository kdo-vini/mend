// @vitest-environment jsdom
// i18n-exempt: test renders translated output through the shared i18n instance.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type { Issue } from "../../../types";
import { CreateIssueDialog, RunAgentDialog } from "./IssueDialogs";

const issue = {
  id: "issue-1",
  identifier: "MEND-1",
  title: "Run the agent",
  summary: "Investigate the issue.",
} as Issue;

describe("CreateIssueDialog", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  it("closes immediately on submit and ignores duplicate clicks", async () => {
    let resolveCreate: (() => void) | undefined;
    const onCreate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const onClose = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateIssueDialog
          conversations={[]}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    const titleInput = () =>
      container.querySelector<HTMLInputElement>("input[required]");
    const createButton = () =>
      container.querySelector<HTMLButtonElement>(
        'button.button-primary[type="button"]',
      );

    await act(async () => {
      const input = titleInput();
      if (!input) throw new Error("missing title input");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Fix checkout");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      createButton()?.click();
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      createButton()?.click();
    });
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate?.();
    });

    await act(async () => root.unmount());
  });

  it("still closes when create fails after submit", async () => {
    const onCreate = vi.fn(async () => {
      throw new Error("create failed");
    });
    const onClose = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CreateIssueDialog
          conversations={[]}
          onClose={onClose}
          onCreate={onCreate}
        />,
      );
    });

    await act(async () => {
      const input =
        container.querySelector<HTMLInputElement>("input[required]");
      if (!input) throw new Error("missing title input");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Fix checkout");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          'button.button-primary[type="button"]',
        )
        ?.click();
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});

describe("RunAgentDialog", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
  });

  it("locks the start action and shows progress until the request settles", async () => {
    let resolveStart: (() => void) | undefined;
    const onStart = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <RunAgentDialog
          issue={issue}
          workspaceId={null}
          liveMode={false}
          onClose={() => undefined}
          onStart={onStart}
        />,
      );
    });

    const startButton = () =>
      container.querySelector<HTMLButtonElement>(
        'button.button-primary[type="button"]',
      );

    await act(async () => {
      startButton()?.click();
    });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(startButton()?.disabled).toBe(true);
    expect(startButton()?.getAttribute("aria-busy")).toBe("true");
    expect(startButton()?.textContent).toContain("Starting");

    await act(async () => {
      startButton()?.click();
    });
    expect(onStart).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart?.();
    });
    expect(startButton()?.disabled).toBe(false);
    expect(startButton()?.getAttribute("aria-busy")).toBe("false");
    await act(async () => root.unmount());
  });
});
