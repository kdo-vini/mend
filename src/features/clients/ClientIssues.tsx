import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Unlink } from "lucide-react";
import type { ClientIssue } from "./api";

export function ClientIssues({
  issues,
  canEdit,
  onLink,
  onUnlink,
}: {
  issues: ClientIssue[];
  canEdit: boolean;
  onLink: (identifier: string) => Promise<void>;
  onUnlink: (issue: ClientIssue) => Promise<void>;
}) {
  const { t } = useTranslation("clients");
  const { t: tc } = useTranslation("common");
  const [linking, setLinking] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const statusLabel = (status: string) => {
    switch (status.toLowerCase().replace(/[^a-z]/g, "")) {
      case "triage":
        return tc("data.issueStatus.triage");
      case "backlog":
        return tc("data.issueStatus.backlog");
      case "todo":
        return tc("data.issueStatus.todo");
      case "inprogress":
        return tc("data.issueStatus.inProgress");
      case "review":
        return tc("data.issueStatus.review");
      case "done":
        return tc("data.issueStatus.done");
      case "canceled":
      case "cancelled":
        return tc("data.issueStatus.canceled");
      default:
        return status;
    }
  };

  const closeLinking = () => {
    setLinking(false);
    setError("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = identifier.trim().toUpperCase();
    if (!value || busy) return;
    setBusy(true);
    setError("");
    try {
      await onLink(value);
      setIdentifier("");
      setLinking(false);
    } catch {
      setError(t("issues.linkError"));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (issue: ClientIssue) => {
    setError("");
    setBusy(true);
    try {
      await onUnlink(issue);
    } catch {
      setError(t("issues.unlinkError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="clients-card clients-side-card">
      <div className="clients-side-head">
        <h2>{t("issues.title")}</h2>
        {canEdit && !linking && (
          <button
            className="text-button"
            type="button"
            onClick={() => setLinking(true)}
          >
            {t("issues.link")}
          </button>
        )}
      </div>

      {linking && (
        <form className="clients-link-form" onSubmit={submit}>
          <input
            value={identifier}
            disabled={busy}
            maxLength={40}
            placeholder={t("issues.placeholder")}
            aria-label={t("issues.identifierLabel")}
            onChange={(event) => setIdentifier(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeLinking();
            }}
          />
          <button
            className="button button-primary button-small"
            type="submit"
            disabled={busy || !identifier.trim()}
          >
            {busy ? t("actions.saving") : t("issues.linkConfirm")}
          </button>
          <button
            className="button button-ghost button-small"
            type="button"
            disabled={busy}
            onClick={closeLinking}
          >
            {t("actions.cancel")}
          </button>
        </form>
      )}
      {error && (
        <div className="clients-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {issues.length === 0 ? (
        <p className="clients-body-empty">{t("issues.empty")}</p>
      ) : (
        <ul className="clients-issues">
          {issues.map((issue) => (
            <li key={issue.id}>
              <span className="clients-issue-id">{issue.identifier}</span>
              <Link to={`/issues/${encodeURIComponent(issue.identifier)}`}>
                {issue.title}
              </Link>
              <span className="clients-sub">{statusLabel(issue.status)}</span>
              {canEdit && (
                <button
                  className="icon-button subtle"
                  type="button"
                  disabled={busy}
                  aria-label={t("issues.unlink", {
                    identifier: issue.identifier,
                  })}
                  onClick={() => void unlink(issue)}
                >
                  <Unlink size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
