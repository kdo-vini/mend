// @vitest-environment jsdom
// i18n-exempt: test renders translated output through the shared i18n instance.

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import i18n from "../../../i18n";
import type { Issue } from "../../../types";
import { RunAgentDialog } from "./IssueDialogs";

const issue = {
  id: "issue-1",
  identifier: "MEND-1",
  title: "Run the agent",
  summary: "Investigate the issue.",
} as Issue;

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
