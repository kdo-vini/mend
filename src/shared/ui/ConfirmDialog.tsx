import { useEffect, useRef } from "react";

export interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export type Confirm = (options: ConfirmOptions) => Promise<boolean>;

export type ConfirmationRequest = ConfirmOptions;

export function ConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmationRequest;
  onResolve: (confirmed: boolean) => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (request.destructive
      ? cancelButtonRef.current
      : confirmButtonRef.current
    )?.focus();
  }, [request]);

  return (
    <div className="modal-backdrop confirmation-backdrop" role="presentation">
      <section
        className="modal confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-dialog-title"
        aria-describedby="confirmation-dialog-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onResolve(false);
          }
        }}
      >
        <div className="modal-header">
          <h2 id="confirmation-dialog-title">{request.title}</h2>
        </div>
        <div className="modal-body confirmation-body">
          <p id="confirmation-dialog-description">{request.description}</p>
        </div>
        <div className="modal-footer">
          <button
            ref={cancelButtonRef}
            className="button button-ghost"
            type="button"
            onClick={() => onResolve(false)}
          >
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmButtonRef}
            className={`button ${request.destructive ? "button-danger" : "button-primary"}`}
            type="button"
            onClick={() => onResolve(true)}
          >
            {request.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </section>
    </div>
  );
}
