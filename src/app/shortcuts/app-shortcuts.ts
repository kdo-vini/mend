export type AppShortcutId =
  | "openInbox"
  | "browseIssues"
  | "createIssue"
  | "viewRuns"
  | "openKnowledge"
  | "openSettings";

export type AppShortcut = {
  id: AppShortcutId;
  /** Lowercase key sequence, e.g. `["g","i"]` or `["c"]`. */
  keys: readonly string[];
  hint: string;
  path?: string;
  action?: "createIssue";
};

export const GO_PREFIX_TIMEOUT_MS = 1000;

export const APP_SHORTCUTS: readonly AppShortcut[] = [
  {
    id: "openInbox",
    keys: ["g", "i"],
    hint: "G then I",
    path: "/inbox",
  },
  {
    id: "browseIssues",
    keys: ["g", "x"],
    hint: "G then X",
    path: "/issues",
  },
  {
    id: "createIssue",
    keys: ["c"],
    hint: "C",
    action: "createIssue",
  },
  {
    id: "viewRuns",
    keys: ["g", "r"],
    hint: "G then R",
    path: "/agent-runs",
  },
  {
    id: "openKnowledge",
    keys: ["g", "k"],
    hint: "G then K",
    path: "/knowledge",
  },
  {
    id: "openSettings",
    keys: ["g", "s"],
    hint: "G then S",
    path: "/settings",
  },
] as const;

export function formatShortcutHint(keys: readonly string[]): string {
  if (keys.length === 0) return "";
  if (keys.length === 1) return keys[0]!.toUpperCase();
  if (keys.length === 2 && keys[0] === "g") {
    return `G then ${keys[1]!.toUpperCase()}`;
  }
  return keys.map((key) => key.toUpperCase()).join(" ");
}

export function getShortcutHint(id: AppShortcutId): string {
  return APP_SHORTCUTS.find((shortcut) => shortcut.id === id)?.hint ?? "";
}

export function matchChord(
  keysPressed: readonly string[],
  shortcuts: readonly AppShortcut[] = APP_SHORTCUTS,
): AppShortcut | undefined {
  const normalized = keysPressed.map((key) => key.toLowerCase());
  return shortcuts.find(
    (shortcut) =>
      shortcut.keys.length === normalized.length &&
      shortcut.keys.every((key, index) => key === normalized[index]),
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  const contentEditable = target.getAttribute("contenteditable");
  if (contentEditable === "" || contentEditable === "true") return true;
  return Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}
