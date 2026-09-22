import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export const INBOX_RAIL_WIDTH_STORAGE_KEY = "mend.inbox-rail-width";
export const INBOX_RAIL_WIDTH_DEFAULT = 320;
export const INBOX_RAIL_WIDTH_MIN = 240;
export const INBOX_RAIL_WIDTH_MAX = 520;

export function clampInboxRailWidth(width: number): number {
  if (!Number.isFinite(width)) return INBOX_RAIL_WIDTH_DEFAULT;
  return Math.min(
    INBOX_RAIL_WIDTH_MAX,
    Math.max(INBOX_RAIL_WIDTH_MIN, Math.round(width)),
  );
}

function readStoredWidth(): number {
  if (typeof window === "undefined") return INBOX_RAIL_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(INBOX_RAIL_WIDTH_STORAGE_KEY);
  if (!raw) return INBOX_RAIL_WIDTH_DEFAULT;
  return clampInboxRailWidth(Number(raw));
}

export function useInboxRailWidth() {
  const [width, setWidth] = useState(INBOX_RAIL_WIDTH_DEFAULT);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  const persistWidth = useCallback((next: number) => {
    const clamped = clampInboxRailWidth(next);
    setWidth(clamped);
    window.localStorage.setItem(INBOX_RAIL_WIDTH_STORAGE_KEY, String(clamped));
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setWidth(
        clampInboxRailWidth(drag.startWidth + (event.clientX - drag.startX)),
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      persistWidth(drag.startWidth + (event.clientX - drag.startX));
      dragRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [dragging, persistWidth]);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragRef.current = { startX: event.clientX, startWidth: width };
      setDragging(true);
    },
    [width],
  );

  const onResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 32 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        persistWidth(width - step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        persistWidth(width + step);
      } else if (event.key === "Home") {
        event.preventDefault();
        persistWidth(INBOX_RAIL_WIDTH_MIN);
      } else if (event.key === "End") {
        event.preventDefault();
        persistWidth(INBOX_RAIL_WIDTH_MAX);
      }
    },
    [persistWidth, width],
  );

  return {
    width,
    dragging,
    layoutStyle: {
      ["--inbox-rail-width"]: `${width}px`,
    } as CSSProperties,
    onResizePointerDown,
    onResizeKeyDown,
  };
}
