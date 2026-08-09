import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileClock } from "lucide-react";
import { listLiveAuditLog, type AuditLogRecord } from "../api";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
} from "../components/SettingsShared";
import { formatSettingsDate } from "../settings-utils";

export function SettingsAuditPage({
  workspaceId,
}: {
  workspaceId: string | null;
}) {
  const { t } = useTranslation("settings");
  const [rows, setRows] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await listLiveAuditLog(workspaceId));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Audit log is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => void load(), [load]);

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("audit.title")}
        description={t("audit.description")}
        actions={
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <FileClock size={13} /> Refresh
          </button>
        }
      />
      <SettingsSection
        title="Recent activity"
        description="Access, policy and integration changes stay visible here."
      >
        {loading ? (
          <LoadingState label="Loading audit events…" />
        ) : error ? (
          <SettingsError message={error} onRetry={() => void load()} />
        ) : !rows.length ? (
          <EmptyState
            title="No audit events yet"
            description="Events will appear after live workspace activity."
          />
        ) : (
          <div className="settings-v2-audit-list">
            {rows.map((row) => (
              <div className="settings-v2-audit-row" key={row.id}>
                <div>
                  <strong>{row.action ?? "Workspace event"}</strong>
                  <span>
                    {row.actor_user_id
                      ? `Actor ${row.actor_user_id.slice(0, 8)}`
                      : "System"}
                  </span>
                </div>
                <time dateTime={row.created_at}>
                  {formatSettingsDate(row.created_at)}
                </time>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
