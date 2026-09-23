import { useEffect, useRef, useState } from "react";
import { Circle, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

export function WorkspaceAvailability({
  name,
  initials,
  isActive,
  disabled,
  onChange,
  onOpenProfile,
  showProfileAction = true,
}: {
  name: string;
  initials: string;
  isActive: boolean | null;
  disabled: boolean;
  onChange: (isActive: boolean) => void;
  onOpenProfile: () => void;
  showProfileAction?: boolean;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressFocusOpen = useRef(false);
  const currentStatus = isActive
    ? t("navigation.availabilityActive")
    : t("navigation.availabilityAway");
  const menuLabel = t("navigation.availabilityMenuLabel", {
    name,
    status: currentStatus,
  });

  useEffect(() => {
    if (!open) return;

    const closeWhenOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, [open]);

  const userRow = (
    <button
      ref={triggerRef}
      className="user-row workspace-availability-trigger"
      type="button"
      aria-haspopup={isActive === null ? undefined : "dialog"}
      aria-expanded={isActive === null ? undefined : open}
      aria-label={isActive === null ? t("navigation.openProfile") : menuLabel}
      onClick={() => {
        if (isActive === null) onOpenProfile();
        else setOpen(true);
      }}
    >
      <div className="avatar avatar-small avatar-violet" aria-hidden="true">
        {initials}
      </div>
      <span className="user-row-name">
        <strong>{name}</strong>
      </span>
    </button>
  );

  if (isActive === null) return userRow;

  return (
    <div
      ref={containerRef}
      className="workspace-availability"
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          containerRef.current?.contains(event.relatedTarget)
        ) {
          return;
        }
        if (!containerRef.current?.contains(document.activeElement))
          setOpen(false);
      }}
      onFocusCapture={() => {
        if (suppressFocusOpen.current) suppressFocusOpen.current = false;
        else setOpen(true);
      }}
      onBlurCapture={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !containerRef.current?.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          if (document.activeElement !== triggerRef.current) {
            suppressFocusOpen.current = true;
            triggerRef.current?.focus();
          }
        }
      }}
    >
      {userRow}
      {open && (
        <>
          <div
            className="workspace-availability-hover-bridge"
            aria-hidden="true"
          />
          <div
            className="workspace-availability-popover"
            role="dialog"
            aria-modal="false"
            aria-label={menuLabel}
          >
            <button
              type="button"
              className="workspace-availability-option is-active"
              aria-pressed={isActive}
              disabled={disabled || isActive}
              onClick={() => {
                onChange(true);
                setOpen(false);
              }}
            >
              <Circle aria-hidden="true" size={10} fill="currentColor" />
              {t("navigation.availabilityActive")}
            </button>
            <button
              type="button"
              className="workspace-availability-option is-away"
              aria-pressed={!isActive}
              disabled={disabled || !isActive}
              onClick={() => {
                onChange(false);
                setOpen(false);
              }}
            >
              <Circle aria-hidden="true" size={10} fill="currentColor" />
              {t("navigation.availabilityAway")}
            </button>
            {showProfileAction && (
              <button
                type="button"
                className="workspace-availability-profile"
                onClick={() => {
                  setOpen(false);
                  onOpenProfile();
                }}
              >
                <UserRound aria-hidden="true" size={14} />
                {t("navigation.profile")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
