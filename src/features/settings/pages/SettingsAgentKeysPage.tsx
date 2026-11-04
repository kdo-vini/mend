import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, KeyRound, Plus } from "lucide-react";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../../../shared/ui/ResourceState";
import { LiveActionError } from "../../../api/transport";
import { appLocale } from "../../../i18n/resources";
import {
  agentKeyScopes,
  createLiveAgentKey,
  listLiveAgentKeys,
  mcpServerUrl,
  revokeLiveAgentKey,
  updateLiveAgentKeyScopes,
  type AgentKey,
  type AgentKeyScope,
} from "../api";
import {
  SettingsError,
  SettingsPageHeader,
  SettingsSection,
  SettingsWorkspaceRequired,
} from "../components/SettingsShared";

const sameScopes = (a: AgentKeyScope[], b: AgentKeyScope[]) =>
  a.length === b.length && a.every((scope) => b.includes(scope));

/** i18next reads ":" as a namespace separator, so scope keys use "_". */
const scopeKey = (scope: AgentKeyScope) => scope.replace(":", "_");

export function SettingsAgentKeysPage({
  workspaceId,
  onToast,
  onConfirm,
}: {
  workspaceId: string | null;
  onToast: (message: string) => void;
  onConfirm: Confirm;
}) {
  const { t } = useTranslation("settings");
  const [keys, setKeys] = useState<AgentKey[]>([]);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<AgentKeyScope[]>([]);
  const [created, setCreated] = useState<{
    label: string;
    secret: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentKeyScope[]>([]);
  const secretRef = useRef<HTMLInputElement>(null);

  const describe = useCallback(
    (reason: unknown, fallback: string) =>
      reason instanceof LiveActionError && reason.status === 403
        ? t("agentKeys.errors.forbidden")
        : fallback,
    [t],
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setKeys(await listLiveAgentKeys(workspaceId));
    } catch (reason) {
      setError(describe(reason, t("agentKeys.errors.load")));
    } finally {
      setLoading(false);
    }
  }, [describe, t, workspaceId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    if (created) secretRef.current?.focus();
  }, [created]);

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || action || !label.trim() || !scopes.length) return;
    setAction("create");
    setError(null);
    try {
      const result = await createLiveAgentKey(workspaceId, {
        label: label.trim(),
        scopes,
      });
      setCreated({ label: result.record.label, secret: result.secret });
      setCopied(false);
      setCopyFailed(false);
      setLabel("");
      setScopes([]);
      await load();
    } catch (reason) {
      setError(
        reason instanceof LiveActionError && reason.status === 409
          ? t("agentKeys.errors.limit")
          : describe(reason, t("agentKeys.errors.create")),
      );
    } finally {
      setAction(null);
    }
  };

  const revoke = async (key: AgentKey) => {
    if (
      !workspaceId ||
      !(await onConfirm({
        title: t("agentKeys.confirmRevokeTitle", { label: key.label }),
        description: t("agentKeys.confirmRevokeDescription"),
        confirmLabel: t("agentKeys.revoke"),
        destructive: true,
      }))
    )
      return;
    setAction(key.id);
    setError(null);
    try {
      await revokeLiveAgentKey(workspaceId, key.id);
      setKeys((current) => current.filter((item) => item.id !== key.id));
      onToast(t("agentKeys.revokedToast"));
    } catch (reason) {
      setError(describe(reason, t("agentKeys.errors.revoke")));
    } finally {
      setAction(null);
    }
  };

  const startEdit = (key: AgentKey) => {
    setEditingId(key.id);
    setDraft(key.scopes);
    setError(null);
  };

  const saveScopes = async (key: AgentKey) => {
    if (
      !workspaceId ||
      action ||
      !draft.length ||
      sameScopes(draft, key.scopes)
    )
      return;
    setAction(key.id);
    setError(null);
    try {
      const updated = await updateLiveAgentKeyScopes(
        workspaceId,
        key.id,
        agentKeyScopes.filter((scope) => draft.includes(scope)),
      );
      setKeys((current) =>
        current.map((item) => (item.id === key.id ? updated : item)),
      );
      setEditingId(null);
      onToast(t("agentKeys.scopesSavedToast", { label: key.label }));
    } catch (reason) {
      setError(
        reason instanceof LiveActionError && reason.status === 404
          ? t("agentKeys.errors.notFound")
          : describe(reason, t("agentKeys.errors.updateScopes")),
      );
    } finally {
      setAction(null);
    }
  };

  const copy = async () => {
    if (!created) return;
    const input = secretRef.current;
    let ok = false;
    // Copy synchronously inside the click first: the async Clipboard API can
    // resolve without writing (focus lost, browser policy), and an agent key
    // pasted from a stale clipboard fails only later, far from here.
    if (input) {
      input.focus();
      input.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    try {
      await navigator.clipboard?.writeText(created.secret);
      ok = true;
    } catch {
      // Keep the execCommand result.
    }
    setCopied(ok);
    setCopyFailed(!ok);
    if (!ok) input?.select();
  };

  const active = keys.filter((key) => !key.revoked_at);
  const dateFormat = new Intl.DateTimeFormat(appLocale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="settings-v2-page">
      <SettingsPageHeader
        title={t("agentKeys.title")}
        description={t("agentKeys.description")}
      />
      {error && <SettingsError message={error} onRetry={() => void load()} />}
      {!workspaceId ? (
        <SettingsWorkspaceRequired />
      ) : loading ? (
        <LoadingState label={t("agentKeys.loading")} />
      ) : (
        <>
          <SettingsSection
            title={t("agentKeys.createTitle")}
            description={t("agentKeys.createDescription")}
          >
            {created ? (
              <div className="settings-v2-agent-secret">
                <strong>
                  {t("agentKeys.secretTitle", { label: created.label })}
                </strong>
                <p>{t("agentKeys.secretHint")}</p>
                <div className="settings-v2-agent-secret-row">
                  <input
                    ref={secretRef}
                    readOnly
                    aria-label={t("agentKeys.secretLabel")}
                    value={created.secret}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="button button-ghost button-small"
                    type="button"
                    onClick={() => void copy()}
                  >
                    <Copy size={14} aria-hidden="true" />{" "}
                    {copied ? t("agentKeys.copied") : t("agentKeys.copy")}
                  </button>
                </div>
                {copyFailed && (
                  <p className="settings-v2-agent-copy-failed" role="alert">
                    {t("agentKeys.copyFailed")}
                  </p>
                )}
                <div className="settings-v2-agent-setup">
                  <strong>{t("agentKeys.setupTitle")}</strong>
                  <p>{t("agentKeys.setupSteps")}</p>
                  <label>
                    {t("agentKeys.serverUrlLabel")}
                    <input
                      readOnly
                      value={mcpServerUrl()}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                </div>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => setCreated(null)}
                >
                  {t("agentKeys.done")}
                </button>
              </div>
            ) : (
              <form className="settings-v2-stack" onSubmit={create}>
                <div className="settings-v2-form-grid settings-v2-agent-form">
                  <label>
                    {t("agentKeys.labelField")}
                    <input
                      required
                      maxLength={120}
                      value={label}
                      placeholder={t("agentKeys.labelPlaceholder")}
                      disabled={action === "create"}
                      onChange={(event) => setLabel(event.target.value)}
                    />
                  </label>
                  <fieldset className="settings-v2-mcp-scope settings-form-wide">
                    <legend>{t("agentKeys.scopesLegend")}</legend>
                    <p>{t("agentKeys.scopesHelp")}</p>
                    <div className="settings-v2-agent-scopes">
                      {agentKeyScopes.map((scope) => (
                        <label
                          key={scope}
                          className="settings-v2-checkbox-field"
                        >
                          <input
                            type="checkbox"
                            checked={scopes.includes(scope)}
                            disabled={action === "create"}
                            onChange={(event) =>
                              setScopes((current) =>
                                event.target.checked
                                  ? [...new Set([...current, scope])]
                                  : current.filter((item) => item !== scope),
                              )
                            }
                          />
                          <span>
                            <strong>
                              {t(`agentKeys.scopes.${scopeKey(scope)}.name`)}
                            </strong>
                            <small>
                              {t(`agentKeys.scopes.${scopeKey(scope)}.help`)}
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className="settings-v2-form-actions">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={
                      action === "create" || !label.trim() || !scopes.length
                    }
                  >
                    <Plus size={14} aria-hidden="true" />{" "}
                    {action === "create"
                      ? t("agentKeys.creating")
                      : t("agentKeys.create")}
                  </button>
                </div>
              </form>
            )}
          </SettingsSection>
          <SettingsSection
            title={t("agentKeys.activeTitle")}
            description={t("agentKeys.activeDescription")}
          >
            {!active.length ? (
              <EmptyState
                title={t("agentKeys.empty")}
                description={t("agentKeys.emptyDescription")}
              />
            ) : (
              <ul className="settings-v2-list settings-v2-agent-keys">
                {active.map((key) => (
                  <li key={key.id} className="settings-v2-row">
                    <span className="settings-v2-row-icon" aria-hidden="true">
                      <KeyRound size={15} />
                    </span>
                    <div className="settings-v2-row-main">
                      <strong>{key.label}</strong>
                      <span>
                        {key.scopes
                          .map((scope) =>
                            t(`agentKeys.scopes.${scopeKey(scope)}.name`),
                          )
                          .join(" · ")}
                      </span>
                      <small>
                        {t("agentKeys.createdAt", {
                          date: dateFormat.format(new Date(key.created_at)),
                        })}{" "}
                        ·{" "}
                        {key.last_used_at
                          ? t("agentKeys.lastUsed", {
                              date: dateFormat.format(
                                new Date(key.last_used_at),
                              ),
                            })
                          : t("agentKeys.neverUsed")}
                      </small>
                    </div>
                    <div className="settings-v2-row-actions">
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        disabled={action !== null}
                        aria-label={t("agentKeys.editLabel", {
                          label: key.label,
                        })}
                        onClick={() => startEdit(key)}
                      >
                        {t("agentKeys.edit")}
                      </button>
                      <button
                        className="button button-ghost button-small"
                        type="button"
                        disabled={action !== null}
                        aria-label={t("agentKeys.revokeLabel", {
                          label: key.label,
                        })}
                        onClick={() => void revoke(key)}
                      >
                        {t("agentKeys.revoke")}
                      </button>
                    </div>
                    {editingId === key.id && (
                      <fieldset
                        className="settings-v2-mcp-scope settings-v2-agent-editor"
                        disabled={action === key.id}
                      >
                        <legend>
                          {t("agentKeys.editTitle", { label: key.label })}
                        </legend>
                        <p>{t("agentKeys.editHint")}</p>
                        <div className="settings-v2-agent-scopes">
                          {agentKeyScopes.map((scope) => (
                            <label
                              key={scope}
                              className="settings-v2-checkbox-field"
                            >
                              <input
                                type="checkbox"
                                checked={draft.includes(scope)}
                                onChange={(event) =>
                                  setDraft((current) =>
                                    event.target.checked
                                      ? [...new Set([...current, scope])]
                                      : current.filter(
                                          (item) => item !== scope,
                                        ),
                                  )
                                }
                              />
                              <span>
                                <strong>
                                  {t(
                                    `agentKeys.scopes.${scopeKey(scope)}.name`,
                                  )}
                                </strong>
                                <small>
                                  {t(
                                    `agentKeys.scopes.${scopeKey(scope)}.help`,
                                  )}
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="settings-v2-form-actions">
                          <button
                            className="button button-primary button-small"
                            type="button"
                            disabled={
                              !draft.length || sameScopes(draft, key.scopes)
                            }
                            onClick={() => void saveScopes(key)}
                          >
                            {action === key.id
                              ? t("agentKeys.savingScopes")
                              : t("agentKeys.saveScopes")}
                          </button>
                          <button
                            className="button button-ghost button-small"
                            type="button"
                            onClick={() => setEditingId(null)}
                          >
                            {t("agentKeys.cancelEdit")}
                          </button>
                        </div>
                      </fieldset>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SettingsSection>
        </>
      )}
    </div>
  );
}
