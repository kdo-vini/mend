import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, RefreshCw, Smartphone, Trash2, Unplug } from "lucide-react";
import {
  createLiveChannel,
  disconnectLiveChannel,
  getLiveChannelQr,
  listLiveChannels,
  refreshLiveChannel,
  removeLiveChannel,
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

function fallbackChannelState(channel: WhatsAppInstance): WhatsAppInstance {
  const state =
    channel.state && channel.state !== "unknown" ? channel.state : "closed";
  return { ...channel, state };
}

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
  const [pairingChannelId, setPairingChannelId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("mend-techne");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusWarning, setStatusWarning] = useState(false);
  const isConnected = selected?.state === "open";

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
    setStatusWarning(false);
    try {
      const stored = await listLiveChannels(workspaceId);
      let refreshFailed = false;
      const rows = await Promise.all(
        stored.map(async (channel) => {
          if (!channel.channelId) return fallbackChannelState(channel);
          try {
            return await refreshLiveChannel({
              workspaceId,
              channelId: channel.channelId,
            });
          } catch {
            // A stale Whatsmiau instance must not block create/pair. Keep the
            // stored status (or closed) instead of marking the whole page down.
            refreshFailed = true;
            return fallbackChannelState(channel);
          }
        }),
      );
      setStatusWarning(refreshFailed);
      const next = rows.find((row) => row.state === "open") ?? rows[0] ?? null;
      setChannels(rows);
      applyChannel(next);
      if (next?.state === "open") {
        setQr(null);
        setPairingChannelId(null);
      }
    } catch (reason) {
      setChannels([]);
      applyChannel(null);
      setError(
        reason instanceof Error ? reason.message : t("v2.whatsapp.errors.load"),
      );
    } finally {
      setLoading(false);
    }
  }, [applyChannel, t, workspaceId]);

  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (!workspaceId || !selected?.channelId || loading || action) return;
    let stopped = false;
    let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void refreshLiveChannel({ workspaceId, channelId: selected.channelId! })
        .then((next) => {
          if (stopped) return;
          setStatusWarning(false);
          applyChannel(next);
          if (next.state === "open") {
            setQr(null);
            setPairingChannelId(null);
            if (selected.state !== "open")
              onToast(t("v2.whatsapp.connectedToast"));
          }
        })
        .catch(() => {
          // Keep the current selection usable for pairing; do not flip to
          // "unknown" and surface a false global outage.
          if (!stopped) setStatusWarning(true);
        })
        .finally(() => {
          pending = false;
        });
    }, 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [action, applyChannel, loading, onToast, selected, t, workspaceId]);

  useEffect(() => {
    if (
      !workspaceId ||
      !pairingChannelId ||
      isConnected ||
      action ||
      pairingChannelId !== selected?.channelId
    )
      return;
    let stopped = false;
    let pending = false;
    const timer = window.setInterval(() => {
      if (pending) return;
      pending = true;
      void getLiveChannelQr({ workspaceId, channelId: pairingChannelId })
        .then((result) => {
          if (stopped) return;
          setQr(result.data);
          setError(null);
        })
        .catch(() => {
          if (stopped) return;
          setQr(null);
          setError(t("v2.whatsapp.errors.action"));
        })
        .finally(() => {
          pending = false;
        });
    }, 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    action,
    isConnected,
    pairingChannelId,
    selected?.channelId,
    t,
    workspaceId,
  ]);

  const runChannelAction = async (
    name: string,
    task: () => Promise<WhatsAppInstance | { data: string }>,
    options?: { channelId?: string | null },
  ) => {
    setAction(name);
    setError(null);
    if (name === "qr") {
      setQr(null);
      setPairingChannelId(options?.channelId ?? selected?.channelId ?? null);
    }
    try {
      const result = await task();
      if ("data" in result) setQr(result.data);
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

  const startPairing = async (channel: WhatsAppInstance) => {
    if (!workspaceId || !channel.channelId) return;
    applyChannel(channel);
    await runChannelAction(
      "qr",
      async () => {
        const result = await getLiveChannelQr({
          workspaceId,
          channelId: channel.channelId!,
        });
        try {
          applyChannel(
            await refreshLiveChannel({
              workspaceId,
              channelId: channel.channelId!,
            }),
          );
        } catch {
          applyChannel({ ...channel, state: "qr-code" });
        }
        return result;
      },
      { channelId: channel.channelId },
    );
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
    setPairingChannelId(null);
  };

  const remove = async (channel: WhatsAppInstance) => {
    if (!workspaceId || !channel.channelId) return;
    if (
      !(await onConfirm({
        title: t("v2.whatsapp.removeTitle"),
        description: t("v2.whatsapp.removeDescription", {
          name: channel.instanceName,
        }),
        confirmLabel: t("v2.whatsapp.confirmRemove"),
        destructive: true,
      }))
    )
      return;
    setAction("remove");
    setError(null);
    try {
      await removeLiveChannel({
        workspaceId,
        channelId: channel.channelId,
      });
      setQr(null);
      setPairingChannelId(null);
      onToast(t("v2.whatsapp.removedToast"));
      await load();
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

  const create = async () => {
    if (!workspaceId || !instanceName.trim()) return;
    setAction("create");
    setError(null);
    setQr(null);
    try {
      const created = await createLiveChannel({
        workspaceId,
        name: instanceName.trim(),
        instanceName: instanceName.trim(),
      });
      applyChannel(created);
      setStatusWarning(false);
      if (created.qr) {
        setQr(created.qr);
        setPairingChannelId(created.channelId ?? null);
        setAction(null);
        return;
      }
      setAction(null);
      if (created.channelId) await startPairing(created);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : t("v2.whatsapp.errors.action"),
      );
      setAction(null);
    }
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
      {statusWarning && !error && (
        <SettingsError
          message={t("v2.whatsapp.errors.statusStale")}
          onRetry={() => void load()}
        />
      )}
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
                          setPairingChannelId(null);
                        }}
                        disabled={action !== null}
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
                          className="button button-ghost button-small"
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
                          onClick={() => void startPairing(channel)}
                          disabled={action !== null || !channel.channelId}
                        >
                          {t("v2.whatsapp.connect")}
                        </button>
                      )}
                      <button
                        className="button button-danger button-small"
                        type="button"
                        onClick={() => void remove(channel)}
                        disabled={action !== null || !channel.channelId}
                        aria-label={t("v2.whatsapp.remove")}
                      >
                        <Trash2 size={13} />{" "}
                        {action === "remove" &&
                        selected?.channelId === channel.channelId
                          ? t("v2.whatsapp.removing")
                          : t("v2.whatsapp.remove")}
                      </button>
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
                  onClick={() => void startPairing(selected)}
                >
                  <QrCode size={14} />{" "}
                  {action === "qr"
                    ? t("v2.whatsapp.generating")
                    : t("v2.whatsapp.generate")}
                </button>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={action !== null || !selected.channelId}
                  onClick={() => void remove(selected)}
                >
                  <Trash2 size={14} />{" "}
                  {action === "remove"
                    ? t("v2.whatsapp.removing")
                    : t("v2.whatsapp.remove")}
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
