import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Smallest gap the menu keeps from every edge of the viewport. */
const viewportGutter = 8;

export function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, right: viewportGutter });

  /**
   * Anchors the menu to its trigger and then keeps the whole box on screen.
   * The menu is right-anchored and grows leftward and downward, so next to a
   * trigger near the left edge or the bottom of a phone screen it used to run
   * off the viewport and lose the labels it exists to show. Measuring the
   * rendered menu is what makes that avoidable: its size decides how far the
   * anchor has to give, and a menu that cannot fit below the trigger flips
   * above it.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const menu = menuRef.current?.getBoundingClientRect();
    const width = menu?.width ?? 0;
    const height = menu?.height ?? 0;
    const right = Math.min(
      Math.max(viewportGutter, window.innerWidth - trigger.right),
      Math.max(viewportGutter, window.innerWidth - width - viewportGutter),
    );
    const below = trigger.bottom + 4;
    const top =
      height && below + height > window.innerHeight - viewportGutter
        ? Math.max(viewportGutter, trigger.top - height - 4)
        : below;
    setPosition((current) =>
      current.top === top && current.right === right ? current : { top, right },
    );
  }, []);

  // Layout effect, not an effect: the menu is measured and corrected in the
  // same frame it mounts, so it never paints at the unclamped anchor first.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        className="icon-button subtle"
        type="button"
        aria-label={t("actions.actionsFor", { label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <Ellipsis size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="context-menu row-actions-menu"
            role="menu"
            style={{ top: position.top, right: position.right }}
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
