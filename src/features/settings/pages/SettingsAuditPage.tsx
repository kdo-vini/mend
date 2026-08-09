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
      setError(reason instanceof Error ? reason.message : t("v2.audit.error"));
    } finally {
      setLoading(false);
    }
  }, [t, workspaceId]);
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
            <FileClock size={13} /> {t("v2.audit.refresh")}
          </button>
        }
      />
      <SettingsSection
        title={t("v2.audit.recentActivity")}
        description={t("v2.audit.description")}
      >
        {loading ? (
          <LoadingState label={t("v2.audit.loading")} />
        ) : error ? (
          <SettingsError message={error} onRetry={() => void load()} />
        ) : !rows.length ? (
          <EmptyState
            title={t("v2.audit.emptyTitle")}
            description={t("v2.audit.emptyDescription")}
          />
        ) : (
          <div className="settings-v2-audit-list">
            {rows.map((row) => (
              <div className="settings-v2-audit-row" key={row.id}>
                <div>
                  <strong>{row.action ?? t("v2.audit.workspaceEvent")}</strong>
                  <span>
                    {row.actor_user_id
                      ? t("v2.audit.actor", {
                          id: row.actor_user_id.slice(0, 8),
                        })
                      : t("v2.audit.system")}
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
