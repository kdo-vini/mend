import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  GO_PREFIX_TIMEOUT_MS,
  isEditableTarget,
  matchChord,
} from "./app-shortcuts";

type UseAppShortcutsOptions = {
  commandOpen: boolean;
  createIssueOpen: boolean;
  onOpenCommand: () => void;
  onCreateIssue: () => void;
  onEscape: () => void;
};

export function useAppShortcuts({
  commandOpen,
  createIssueOpen,
  onOpenCommand,
  onCreateIssue,
  onEscape,
}: UseAppShortcutsOptions) {
  const navigate = useNavigate();
  const pendingPrefixRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const clearPrefix = useCallback(() => {
    pendingPrefixRef.current = null;
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const armPrefix = (prefix: string) => {
      pendingPrefixRef.current = prefix;
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(
        clearPrefix,
        GO_PREFIX_TIMEOUT_MS,
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        clearPrefix();
        onOpenCommand();
        return;
      }

      if (event.key === "Escape") {
        clearPrefix();
        onEscape();
        return;
      }

      if (isEditableTarget(event.target) || commandOpen || createIssueOpen) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key.length !== 1) return;

      if (pendingPrefixRef.current === "g") {
        event.preventDefault();
        const matched = matchChord(["g", key]);
        clearPrefix();
        if (matched?.path) {
          navigate(matched.path);
        }
        return;
      }

      if (key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          "[data-global-search]",
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }

      if (key === "g") {
        event.preventDefault();
        armPrefix("g");
        return;
      }

      const single = matchChord([key]);
      if (single?.action === "createIssue") {
        event.preventDefault();
        onCreateIssue();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPrefix();
    };
  }, [
    clearPrefix,
    commandOpen,
    createIssueOpen,
    navigate,
    onCreateIssue,
    onEscape,
    onOpenCommand,
  ]);
}
