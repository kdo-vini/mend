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
        reason instanceof Error ? reason.message : "WhatsApp is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyChannel, workspaceId]);

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
            onToast("WhatsApp connected");
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
          : "The WhatsApp action failed.",
      );
    } finally {
      setAction(null);
    }
  };

  const disconnect = async () => {
    if (!workspaceId || !selected?.channelId) return;
    if (
      !(await onConfirm({
        title: "Disconnect WhatsApp?",
        description:
          "The number will stop receiving messages until it is paired again.",
        confirmLabel: "Disconnect",
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
      ? "Connected"
      : selected
        ? "Needs attention"
        : "Not connected";
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
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label="Checking WhatsApp health…" />
      ) : (
        <>
          <SettingsSection
            title="Connected numbers"
            description="Only connected numbers receive new customer messages."
            actions={<SettingsStatus tone={tone}>{health}</SettingsStatus>}
          >
            {!channels.length ? (
              <EmptyState
                title="No WhatsApp number"
                description="Create a provider instance, then pair your WhatsApp Business number."
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
                        {channel.phoneNumber ?? "Phone not reported"} ·
                        Whatsmiau
                      </span>
                      <small>Provider state: {channel.state}</small>
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
                        <span className="sr-only">Select </span>
                        {selected?.channelId === channel.channelId
                          ? "Selected"
                          : "Select"}
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
                          <Unplug size={13} /> Disconnect
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
                          Connect
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
              title="Pair this number"
              description="Generate a fresh QR code and keep this page open while the provider connects."
            >
              <div className="settings-v2-pairing">
                {qr ? (
                  <img
                    className="qr-image"
                    src={qr}
                    alt="WhatsApp pairing QR code"
                  />
                ) : (
                  <div className="settings-v2-qr-placeholder">
                    <QrCode size={30} />
                  </div>
                )}
                <div>
                  <strong>
                    {qr ? "Scan this QR code" : "QR code ready when you are"}
                  </strong>
                  <p>
                    {qr
                      ? "Open WhatsApp Business on the phone and scan the code."
                      : "The code expires quickly. Generate a new one when you are ready."}
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
                  {action === "qr" ? "Generating…" : "Generate QR"}
                </button>
              </div>
            </SettingsSection>
          )}
          <SettingsSection
            title="Pair a new number"
            description="Create a server-side provider instance without exposing its API key to the browser."
          >
            <div className="settings-v2-form-grid">
              <label>
                Instance name
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
              {action === "create" ? "Creating…" : "Create instance"}
            </button>
          </SettingsSection>
        </>
      )}
    </div>
  );
}
