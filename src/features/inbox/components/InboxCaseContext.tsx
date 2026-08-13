import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import type { Conversation, Issue } from "../../../types";
import { StatusPill } from "../../../shared/ui/DataDisplay";

export const INBOX_CASE_CONTEXT_ID = "inbox-case-context";

const contextDrawerQuery = "(max-width: 1279px)";

function contextUsesDrawer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(contextDrawerQuery).matches
  );
}

export function InboxCaseContext({
  conversation,
  issue,
  open,
  onClose,
  onOpenIssue,
  children,
}: {
  conversation: Conversation;
  issue?: Issue;
  open: boolean;
  onClose: () => void;
  onOpenIssue: (issueId: string) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation("inbox");
  const closeRef = useRef<HTMLButtonElement>(null);
  const [drawer, setDrawer] = useState(contextUsesDrawer);

  useEffect(() => {
    const media = window.matchMedia(contextDrawerQuery);
    const sync = () => setDrawer(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const context = (
    <aside
      id={INBOX_CASE_CONTEXT_ID}
      role="complementary"
      className={`inbox-case-context ${open ? "open" : ""}`}
      aria-label={t("context.title")}
    >
      <header className="inbox-case-context-header">
        <div>
          <span className="page-kicker">{t("context.eyebrow")}</span>
          <h2>{t("context.title")}</h2>
        </div>
        <button
          ref={closeRef}
          className="icon-button subtle inbox-context-close"
          type="button"
          aria-label={t("context.close")}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <section className="inbox-case-next-action">
        <span>{t("context.nextAction")}</span>
        <strong>
          {issue ? t("context.followIssue") : t("context.reviewTriage")}
        </strong>
      </section>
      {issue ? (
        <button
          className="inbox-linked-case"
          type="button"
          onClick={() => onOpenIssue(issue.id)}
        >
          <code>{issue.identifier}</code>
          <strong>{issue.title}</strong>
          <StatusPill status={issue.status} />
        </button>
      ) : null}
      <div className="inbox-case-ai">{children}</div>
      <footer>
        {conversation.automationState === "human_paused"
          ? t("context.human")
          : t("context.ai")}
      </footer>
    </aside>
  );

  if (!drawer) return context;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <button
            className={`inbox-context-backdrop ${open ? "open" : ""}`}
            type="button"
            aria-label={t("context.dismiss")}
            tabIndex={-1}
          />
        </DialogPrimitive.Overlay>
        <DialogPrimitive.Content
          asChild
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            document
              .querySelector<HTMLButtonElement>(
                `[aria-controls="${INBOX_CASE_CONTEXT_ID}"]`,
              )
              ?.focus();
          }}
        >
          {context}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
