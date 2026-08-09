import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, RefreshCw, Smartphone, Unplug } from "lucide-react";
import {
  connectLiveChannel,
  createLiveChannel,
  disconnectLiveChannel,
  getLiveChannelQr,
  listLiveChannels,
  refreshLiveChannel,
  type WhatsAppInstance,
} from "../api";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
  SettingsStatus,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";
import type { SettingsWorkspacePageProps } from "./SettingsWorkspacePage";

export function SettingsWhatsAppPage({
  workspaceId,
  onToast,
  onChannelChange,
  onConfirm,
}: SettingsWorkspacePageProps) {
  const { t } = useTranslation("settings");
  const [channels, setChannels] = useState<WhatsAppInstance[]>([]);
  const [selected, setSelected] = useState<WhatsAppInstance | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("mend-techne");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyChannel = useCallback(
    (next: WhatsAppInstance | null) => {
      setSelected(next);
      setChannels((current) => {
        if (!next) return current;
        return current.some((item) => item.channelId === next.channelId)
          ? current.map((item) =>
              item.channelId === next.channelId ? next : item,
            )
          : [...current, next];
      });
      onChannelChange(next);
    },
    [onChannelChange],
  );

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listLiveChannels(workspaceId);
      const next = rows.find((row) => row.state === "open") ?? rows[0] ?? null;
      setChannels(rows);
      applyChannel(next);
      if (next?.state === "open") setQr(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("v2.whatsapp.errors.load"),
      );
    } finally {
      setLoading(false);
    }
  }, [applyChannel, t, workspaceId]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (
      !workspaceId ||
      !selected?.channelId ||
      !["qr-code", "connecting"].includes(selected.state)
    )
      return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void refreshLiveChannel({ workspaceId, channelId: selected.channelId! })
        .then((next) => {
          if (stopped) return;
          applyChannel(next);
          if (next.state === "open") {
            setQr(null);
            onToast(t("v2.whatsapp.connectedToast"));
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    applyChannel,
    onToast,
    selected?.channelId,
    selected?.state,
    t,
    workspaceId,
  ]);

  const runChannelAction = async (
    name: string,
    task: () => Promise<WhatsAppInstance | { data: string }>,
  ) => {
    setAction(name);
    setError(null);
    try {
      const result = await task();
      if ("data" in result) setQr(`data:image/png;base64,${result.data}`);
      else applyChannel(result);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.whatsapp.errors.action"),
      );
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    if (!workspaceId || !selected?.channelId) return;
    if (
      !(await onConfirm({
        title: t("v2.whatsapp.disconnectTitle"),
        description: t("v2.whatsapp.disconnectDescription"),
        confirmLabel: t("v2.whatsapp.confirmDisconnect"),
        destructive: true,
      }))
    )
      return;
    await runChannelAction("disconnect", () =>
      disconnectLiveChannel({ workspaceId, channelId: selected.channelId! }),
    );
    setQr(null);
  };

  const create = async () => {
    if (!workspaceId || !instanceName.trim()) return;
    await runChannelAction("create", () =>
      createLiveChannel({
        workspaceId,
        name: instanceName.trim(),
        instanceName: instanceName.trim(),
      }),
    );
    await load();
  };

  const health =
    selected?.state === "open"
      ? t("whatsapp.healthConnected")
      : selected
        ? t("whatsapp.healthNeedsAttention")
        : t("whatsapp.healthOffline");
  const tone = selected?.state === "open" ? "success" : "warning";

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("whatsapp.title")}
        description={t("whatsapp.description")}
        actions={
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={13} /> {t("v2.whatsapp.refresh")}
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("v2.whatsapp.checking")} />
      ) : (
        <>
          <SettingsSection
            title={t("v2.whatsapp.connectedNumbers")}
            description={t("v2.whatsapp.connectedNumbersDescription")}
            actions={<SettingsStatus tone={tone}>{health}</SettingsStatus>}
          >
            {!channels.length ? (
              <EmptyState
                title={t("v2.whatsapp.noNumber")}
                description={t("v2.whatsapp.noNumberDescription")}
              />
            ) : (
              <div className="settings-v2-list">
                {channels.map((channel) => (
                  <div
                    className={`settings-v2-row ${selected?.channelId === channel.channelId ? "selected" : ""}`}
                    key={channel.channelId ?? channel.instanceName}
                  >
                    <div className="settings-v2-row-icon">
                      <Smartphone size={16} />
                    </div>
                    <div className="settings-v2-row-main">
                      <strong>{channel.instanceName}</strong>
                      <span>
                        {channel.phoneNumber ??
                          t("v2.whatsapp.phoneNotReported")}{" "}
                        · Whatsmiau
                      </span>
                      <small>
                        {t("v2.whatsapp.providerState", {
                          state: t(`whatsapp.states.${channel.state}`, {
                            defaultValue: channel.state,
                          }),
                        })}
                      </small>
                    </div>
                    <div className="settings-v2-row-actions">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        onClick={() => {
                          applyChannel(channel);
                          setQr(null);
                        }}
                      >
                        <span className="sr-only">
                          {t("v2.whatsapp.select")}{" "}
                        </span>
                        {selected?.channelId === channel.channelId
                          ? t("v2.whatsapp.selected")
                          : t("v2.whatsapp.select")}
                      </button>
                      {channel.state === "open" ? (
                        <button
                          className="button button-danger button-small"
                          type="button"
                          onClick={() => {
                            applyChannel(channel);
                            void disconnect();
                          }}
                          disabled={action !== null}
                        >
                          <Unplug size={13} /> {t("v2.whatsapp.disconnect")}
                        </button>
                      ) : (
                        <button
                          className="button button-primary button-small"
                          type="button"
                          onClick={() =>
                            channel.channelId &&
                            void runChannelAction("connect", () =>
                              connectLiveChannel({
                                workspaceId: workspaceId!,
                                channelId: channel.channelId!,
                              }),
                            )
                          }
                          disabled={action !== null || !channel.channelId}
                        >
                          {t("v2.whatsapp.connect")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SettingsSection>
          {selected && selected.state !== "open" && (
            <SettingsSection
              title={t("v2.whatsapp.pairNumber")}
              description={t("v2.whatsapp.pairDescription")}
            >
              <div className="settings-v2-pairing">
                {qr ? (
                  <img
                    className="qr-image"
                    src={qr}
                    alt={t("whatsapp.qrAlt")}
                  />
                ) : (
                  <div className="settings-v2-qr-placeholder">
                    <QrCode size={30} />
                  </div>
                )}
                <div>
                  <strong>
                    {qr ? t("v2.whatsapp.scanQr") : t("v2.whatsapp.qrReady")}
                  </strong>
                  <p>
                    {qr
                      ? t("v2.whatsapp.scanDescription")
                      : t("v2.whatsapp.generateDescription")}
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={action !== null || !selected.channelId}
                  onClick={() =>
                    void runChannelAction("qr", () =>
                      getLiveChannelQr({
                        workspaceId: workspaceId!,
                        channelId: selected.channelId!,
                      }),
                    )
                  }
                >
                  <QrCode size={14} />{" "}
                  {action === "qr"
                    ? t("v2.whatsapp.generating")
                    : t("v2.whatsapp.generate")}
                </button>
              </div>
            </SettingsSection>
          )}
          <SettingsSection
            title={t("v2.whatsapp.pairNew")}
            description={t("v2.whatsapp.pairNewDescription")}
          >
            <div className="settings-v2-form-grid">
              <label>
                {t("v2.whatsapp.instanceName")}
                <input
                  value={instanceName}
                  onChange={(event) => setInstanceName(event.target.value)}
                  placeholder="mend-techne"
                />
              </label>
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={action !== null || !instanceName.trim()}
              onClick={() => void create()}
            >
              <Smartphone size={14} />{" "}
              {action === "create"
                ? t("v2.whatsapp.creating")
                : t("v2.whatsapp.createInstance")}
            </button>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
