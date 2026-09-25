// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_SHORTCUTS,
  formatShortcutHint,
  getShortcutHint,
  GO_PREFIX_TIMEOUT_MS,
  isEditableTarget,
  matchChord,
} from "./app-shortcuts";

describe("app-shortcuts", () => {
  it("formats single-key and G-then hints", () => {
    expect(formatShortcutHint(["c"])).toBe("C");
    expect(formatShortcutHint(["g", "i"])).toBe("G then I");
    expect(formatShortcutHint(["g", "s"])).toBe("G then S");
  });

  it("exposes hints for every quick action including settings", () => {
    expect(getShortcutHint("openInbox")).toBe("G then I");
    expect(getShortcutHint("browseIssues")).toBe("G then X");
    expect(getShortcutHint("createIssue")).toBe("C");
    expect(getShortcutHint("viewRuns")).toBe("G then R");
    expect(getShortcutHint("openKnowledge")).toBe("G then K");
    expect(getShortcutHint("openSettings")).toBe("G then S");
  });

  it("matches chords from the registry", () => {
    expect(matchChord(["g", "i"])?.path).toBe("/inbox");
    expect(matchChord(["G", "X"])?.path).toBe("/issues");
    expect(matchChord(["c"])?.action).toBe("createIssue");
    expect(matchChord(["g", "s"])?.path).toBe("/settings");
    expect(matchChord(["g", "z"])).toBeUndefined();
  });

  it("keeps registry hints consistent with formatShortcutHint", () => {
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.hint).toBe(formatShortcutHint(shortcut.keys));
    }
  });

  it("detects editable targets so chords do not fire while typing", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const button = document.createElement("button");

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(button)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("GO_PREFIX_TIMEOUT_MS", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses a 1000ms go-prefix window", () => {
    expect(GO_PREFIX_TIMEOUT_MS).toBe(1000);
    const clear = vi.fn();
    const id = window.setTimeout(clear, GO_PREFIX_TIMEOUT_MS);
    vi.advanceTimersByTime(999);
    expect(clear).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(clear).toHaveBeenCalledOnce();
    window.clearTimeout(id);
  });
});
