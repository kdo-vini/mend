import { useEffect, useRef } from "react";
import { isEditableTarget } from "../../../app/shortcuts/app-shortcuts";

export type InboxShortcutHandlers = {
  /** J: next conversation in the list. */
  onNext: () => void;
  /** K: previous conversation in the list. */
  onPrevious: () => void;
  /** R: start typing a reply. */
  onReply: () => void;
  /** E: resolve the open conversation. */
  onResolve: () => void;
  /** I: show or fold the customer panel. */
  onToggleContext: () => void;
};

const keyHandlers: Record<string, keyof InboxShortcutHandlers> = {
  j: "onNext",
  k: "onPrevious",
  r: "onReply",
  e: "onResolve",
  i: "onToggleContext",
};

/**
 * Single-key shortcuts while the inbox is open. They never fire while typing,
 * with a modifier held, or for a key the app shortcuts already used (the
 * second key of "G then K" is a navigation, not "previous conversation").
 */
export function useInboxShortcuts(
  handlers: InboxShortcutHandlers,
  enabled = true,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      // A dialog or menu on top owns the keyboard.
      if (document.querySelector("[role='dialog'], [role='menu']")) return;
      const handler = keyHandlers[event.key.toLowerCase()];
      if (!handler) return;
      event.preventDefault();
      handlersRef.current[handler]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
