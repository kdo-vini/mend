import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const [position, setPosition] = useState({ top: 0, right: 8 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
        });
    };
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
        });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="row-actions">
      <button
        ref={triggerRef}
        className="icon-button subtle"
        type="button"
        aria-label={t("actions.actionsFor", { label })}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
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
