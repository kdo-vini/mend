import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Conversation, Issue } from "../../../types";
import { StatusPill } from "../../../shared/ui/DataDisplay";

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

  return (
    <>
      <button
        className={`inbox-context-backdrop ${open ? "open" : ""}`}
        type="button"
        aria-label={t("context.dismiss")}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        className={`inbox-case-context ${open ? "open" : ""}`}
        aria-label={t("context.title")}
      >
        <header className="inbox-case-context-header">
          <div>
            <span className="page-kicker">{t("context.eyebrow")}</span>
            <h2>{t("context.title")}</h2>
          </div>
          <button
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
    </>
  );
}
