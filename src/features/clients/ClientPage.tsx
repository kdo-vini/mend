import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, MessageCircle, Trash2 } from "lucide-react";
import { ActionMenu } from "../../shared/ui/ActionMenu";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/ui/ResourceState";
import { Select } from "../../shared/ui/Select";
import { useConfirmation } from "../../shared/ui/useConfirmation";
import {
  clientStages,
  clientsApi,
  currentUserId,
  type ClientDetail,
  type ClientInput,
  type ClientIssue,
  type ClientPermissions,
  type ClientStage,
  type EntryInput,
} from "./api";
import { ClientBody } from "./ClientBody";
import { ClientIssues } from "./ClientIssues";
import { ClientProperties } from "./ClientProperties";
import { ClientTimeline } from "./ClientTimeline";
import { clientErrorKey } from "./errors";
import { formatMoment } from "./format";
import { demoSearch, whatsappUrl } from "./model";
import { StagePill } from "./StagePill";

type LoadState = "loading" | "ready" | "notFound" | "failed";

export function ClientPage() {
  const { t } = useTranslation("clients");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const carry = demoSearch(useLocation().search);
  const { confirm, confirmationDialog } = useConfirmation();
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [permissions, setPermissions] = useState<ClientPermissions>({
    canEdit: false,
    canArchive: false,
  });
  const [state, setState] = useState<LoadState>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [stagePending, setStagePending] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setState("loading");
      try {
        const result = await clientsApi.get(id);
        setDetail(result.data);
        setPermissions(result.permissions);
        setState("ready");
      } catch (error) {
        if (silent) return;
        setState(clientErrorKey(error) === "notFound" ? "notFound" : "failed");
      }
    },
    [id],
  );

  useEffect(() => void load(), [load]);
  useEffect(() => {
    let active = true;
    void currentUserId().then((value) => active && setUserId(value));
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading" && !detail)
    return (
      <main className="page clients-page">
        <LoadingState label={t("loadingOne")} />
      </main>
    );
  if (state === "notFound")
    return (
      <main className="page clients-page">
        <EmptyState
          title={t("notFound.title")}
          description={t("notFound.description")}
          action={
            <Link className="button button-ghost" to={`/clientes${carry}`}>
              {t("notFound.back")}
            </Link>
          }
        />
      </main>
    );
  if (!detail || state === "failed")
    return (
      <main className="page clients-page">
        <ErrorState
          title={t("errors.load.title")}
          description={t("errors.load.description")}
          onRetry={() => void load()}
        />
      </main>
    );

  const { canEdit, canArchive } = permissions;
  const archived = Boolean(detail.archived_at);
  const whatsapp = whatsappUrl(detail.phone);

  const patch = async (input: ClientInput & { archived?: boolean }) => {
    const updated = await clientsApi.update(detail.id, input);
    setDetail((current) =>
      current
        ? { ...current, ...updated, body: updated.body ?? current.body }
        : current,
    );
    if (input.stage) await load(true);
  };

  const guarded = async (run: () => Promise<void>, fallback: string) => {
    setActionError("");
    try {
      await run();
    } catch (error) {
      setActionError(
        clientErrorKey(error) === "forbidden"
          ? t("errors.forbidden")
          : fallback,
      );
    }
  };

  const changeStage = async (stage: ClientStage) => {
    if (stage === detail.stage || stagePending) return;
    setStagePending(true);
    await guarded(() => patch({ stage }), t("errors.stage"));
    setStagePending(false);
  };

  const toggleArchive = () =>
    guarded(
      () => patch({ archived: !archived }),
      archived ? t("errors.unarchive") : t("errors.archive"),
    );

  const requestDelete = async () => {
    const confirmed = await confirm({
      title: t("delete.title", { name: detail.name }),
      description: t("delete.description"),
      confirmLabel: t("delete.confirm"),
      destructive: true,
    });
    if (!confirmed) return;
    await guarded(async () => {
      await clientsApi.remove(detail.id);
      navigate(`/clientes${carry}`);
    }, t("errors.delete"));
  };

  const addEntry = async (input: EntryInput) => {
    const entry = await clientsApi.addEntry(detail.id, input);
    setDetail((current) =>
      current ? { ...current, entries: [entry, ...current.entries] } : current,
    );
  };

  const subtitle =
    detail.source === "diagnostico_marca"
      ? t("subtitle.diagnostic", { date: formatMoment(detail.created_at) })
      : t("subtitle.created", { date: formatMoment(detail.created_at) });

  return (
    <main className="page clients-page clients-detail-page">
      <header className="page-header clients-detail-header">
        <div className="clients-detail-title">
          <nav className="clients-crumb" aria-label={t("breadcrumb.label")}>
            <Link to={`/clientes${carry}`}>{t("title")}</Link>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{detail.name}</span>
          </nav>
          <div className="clients-head-row">
            <h1>{detail.name}</h1>
            {canEdit ? (
              <Select
                className="clients-stage-select"
                ariaLabel={t("fields.stage")}
                value={detail.stage}
                disabled={stagePending}
                onChange={(value) => void changeStage(value as ClientStage)}
                options={clientStages.map((stage) => ({
                  value: stage,
                  label: <StagePill stage={stage} />,
                }))}
              />
            ) : (
              <StagePill stage={detail.stage} />
            )}
            {archived && (
              <span className="client-tag">{t("row.archived")}</span>
            )}
          </div>
          <p>{subtitle}</p>
        </div>
        <div className="page-actions clients-detail-actions">
          <Link className="button button-ghost" to={`/issues${carry}`}>
            {t("actions.openIssue")}
          </Link>
          {whatsapp && (
            <a
              className="button button-primary"
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={15} aria-hidden="true" />{" "}
              {t("actions.whatsapp")}
            </a>
          )}
          {canArchive && (
            <ActionMenu label={detail.name}>
              <button type="button" role="menuitem" onClick={toggleArchive}>
                {archived ? (
                  <ArchiveRestore size={14} aria-hidden="true" />
                ) : (
                  <Archive size={14} aria-hidden="true" />
                )}{" "}
                {archived ? t("actions.unarchive") : t("actions.archive")}
              </button>
              <button
                className="danger"
                type="button"
                role="menuitem"
                onClick={() => void requestDelete()}
              >
                <Trash2 size={14} aria-hidden="true" /> {t("actions.delete")}
              </button>
            </ActionMenu>
          )}
        </div>
      </header>

      {actionError && (
        <div className="clients-error" role="alert">
          <span>{actionError}</span>
        </div>
      )}

      <div className="clients-detail">
        <div className="clients-detail-main">
          <ClientProperties client={detail} canEdit={canEdit} onPatch={patch} />
          <ClientBody
            body={detail.body}
            canEdit={canEdit}
            onSaveBody={(body) => patch({ body })}
          />
        </div>
        <aside className="clients-side" aria-label={t("side.label")}>
          <ClientTimeline
            clientName={detail.contact?.trim() || detail.name}
            entries={detail.entries}
            canEdit={canEdit}
            canArchive={canArchive}
            userId={userId}
            onAdd={addEntry}
            onRemove={async (entry) => {
              await clientsApi.removeEntry(detail.id, entry.id);
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      entries: current.entries.filter(
                        (item) => item.id !== entry.id,
                      ),
                    }
                  : current,
              );
            }}
          />
          <ClientIssues
            issues={detail.issues}
            canEdit={canEdit}
            onLink={async (identifier) => {
              await clientsApi.linkIssue(detail.id, identifier);
              await load(true);
            }}
            onUnlink={async (issue: ClientIssue) => {
              await clientsApi.unlinkIssue(detail.id, issue.id);
              setDetail((current) =>
                current
                  ? {
                      ...current,
                      issues: current.issues.filter(
                        (item) => item.id !== issue.id,
                      ),
                    }
                  : current,
              );
            }}
          />
        </aside>
      </div>
      {confirmationDialog}
    </main>
  );
}
