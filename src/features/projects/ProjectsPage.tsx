import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowUpRight,
  FolderKanban,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LiveActionError } from "../../api/transport";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui/dialog";
import {
  ConfirmDialog,
  type ConfirmationRequest,
} from "../../shared/ui/ConfirmDialog";
import { EmptyState, LoadingState } from "../../shared/ui/ResourceState";
import { PageHeader } from "../../shared/ui/PageHeader";
import { projectsApi, type Project } from "./api";

type ProjectDraft = { name: string; description: string };

const emptyDraft: ProjectDraft = { name: "", description: "" };

export function ProjectsPage() {
  const { t } = useTranslation("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [mutatingProjectId, setMutatingProjectId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(
    null,
  );
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const projectNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await projectsApi.list();
      setProjects(result.data);
    } catch (error) {
      if (error instanceof LiveActionError && error.status === 403) {
        setProjects([]);
        setLoadError(t("errors.forbidden"));
      } else {
        setLoadError(getErrorMessage(error, t("errors.load")));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => void load(), [load]);

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status === "active"),
    [projects],
  );
  const archivedProjects = useMemo(
    () => projects.filter((project) => project.status === "archived"),
    [projects],
  );

  const openCreate = (trigger?: HTMLElement) => {
    returnFocusRef.current = trigger ?? null;
    setEditing(null);
    setDraft(emptyDraft);
    setActionError("");
    setConflict(false);
    setEditorOpen(true);
  };

  const openEdit = (project: Project, trigger?: HTMLElement) => {
    returnFocusRef.current = trigger ?? null;
    setEditing(project);
    setDraft({ name: project.name, description: project.description });
    setActionError("");
    setConflict(false);
    setEditorOpen(true);
  };

  const reloadConflict = async () => {
    setLoading(true);
    try {
      const result = await projectsApi.list();
      setProjects(result.data);
      if (editing) {
        const latest = result.data.find((project) => project.id === editing.id);
        if (latest) setEditing(latest);
      }
      setConflict(false);
      setActionError(t("errors.conflictReload"));
    } catch (error) {
      setActionError(getErrorMessage(error, t("errors.load")));
    } finally {
      setLoading(false);
    }
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setActionError("");
    setConflict(false);
    const name = draft.name.trim();
    const record = {
      id: editing?.id ?? crypto.randomUUID(),
      key: editing?.key ?? name,
      name,
      description: draft.description.trim(),
      status: editing?.status ?? "active",
    } as const;
    try {
      await projectsApi.save(record, editing?.version ?? null);
      setEditorOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
      await load();
    } catch (error) {
      if (error instanceof LiveActionError && error.status === 409) {
        setConflict(true);
        setActionError(t("errors.conflict"));
      } else if (error instanceof LiveActionError && error.status === 403) {
        setActionError(t("errors.forbidden"));
      } else {
        setActionError(getErrorMessage(error, t("errors.save")));
      }
    } finally {
      setSaving(false);
    }
  };

  const requestArchive = (project: Project) => {
    if (mutatingProjectId) return;
    setMutatingProjectId(project.id);
    setArchiveTarget(project);
    setConfirmation({
      title: t("archive.title", { name: project.name }),
      description: t("archive.description"),
      confirmLabel: t("archive.confirm"),
      destructive: true,
    });
  };

  const resolveArchive = async (confirmed: boolean) => {
    const project = archiveTarget;
    setConfirmation(null);
    setArchiveTarget(null);
    if (!confirmed || !project) {
      setMutatingProjectId(null);
      return;
    }
    try {
      const { version, ...record } = project;
      await projectsApi.save({ ...record, status: "archived" }, version);
      await load();
    } catch (error) {
      if (error instanceof LiveActionError && error.status === 409) {
        setLoadError(t("errors.conflictReload"));
        await load();
        setLoadError(t("errors.conflictReload"));
      } else if (error instanceof LiveActionError && error.status === 403) {
        setLoadError(t("errors.forbidden"));
      } else {
        setLoadError(getErrorMessage(error, t("errors.archive")));
      }
    } finally {
      setMutatingProjectId(null);
    }
  };

  const restore = async (project: Project) => {
    if (mutatingProjectId) return;
    setMutatingProjectId(project.id);
    try {
      const { version, ...record } = project;
      await projectsApi.save({ ...record, status: "active" }, version);
      await load();
    } catch (error) {
      if (error instanceof LiveActionError && error.status === 403) {
        setLoadError(t("errors.forbidden"));
      } else if (error instanceof LiveActionError && error.status === 409) {
        await load();
        setLoadError(t("errors.conflictReload"));
      } else {
        setLoadError(getErrorMessage(error, t("errors.save")));
      }
    } finally {
      setMutatingProjectId(null);
    }
  };

  return (
    <main className="page projects-page">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <button
            className="button button-primary"
            type="button"
            disabled={mutatingProjectId !== null}
            onClick={(event) => openCreate(event.currentTarget)}
          >
            <Plus size={15} aria-hidden="true" /> {t("actions.create")}
          </button>
        }
      />

      {loadError && (
        <div className="projects-error" role="alert">
          <span>{loadError}</span>
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void load()}
          >
            <RefreshCw size={14} aria-hidden="true" /> {t("actions.retry")}
          </button>
        </div>
      )}

      {loading ? (
        <LoadingState label={t("loading")} />
      ) : loadError && projects.length === 0 ? null : projects.length === 0 ? (
        <section className="projects-empty-surface">
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <button
                className="button button-primary"
                type="button"
                onClick={(event) => openCreate(event.currentTarget)}
              >
                <Plus size={15} aria-hidden="true" /> {t("actions.createFirst")}
              </button>
            }
          />
        </section>
      ) : (
        <div className="projects-sections">
          <section
            className="projects-section"
            aria-labelledby="projects-active-title"
          >
            <header className="projects-section-heading">
              <div>
                <h2 id="projects-active-title">{t("active.title")}</h2>
                <p>{t("active.description")}</p>
              </div>
              <span className="projects-count">{activeProjects.length}</span>
            </header>
            {activeProjects.length ? (
              <div className="projects-grid">
                {activeProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    busy={mutatingProjectId !== null}
                    onEdit={(trigger) => openEdit(project, trigger)}
                    onArchive={() => requestArchive(project)}
                  />
                ))}
              </div>
            ) : (
              <p className="projects-inline-empty">{t("active.empty")}</p>
            )}
          </section>

          {archivedProjects.length > 0 && (
            <section
              className="projects-section projects-archived"
              aria-labelledby="projects-archived-title"
            >
              <header className="projects-section-heading">
                <div>
                  <h2 id="projects-archived-title">{t("archived.title")}</h2>
                  <p>{t("archived.description")}</p>
                </div>
                <span className="projects-count">
                  {archivedProjects.length}
                </span>
              </header>
              <div className="projects-grid">
                {archivedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    busy={mutatingProjectId !== null}
                    onEdit={(trigger) => openEdit(project, trigger)}
                    onRestore={() => void restore(project)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => !saving && setEditorOpen(open)}
      >
        {editorOpen && (
          <DialogContent
            className="projects-dialog"
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              projectNameRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              returnFocusRef.current?.focus();
            }}
            onEscapeKeyDown={(event) => saving && event.preventDefault()}
            onPointerDownOutside={(event) => saving && event.preventDefault()}
          >
            <form className="projects-editor" onSubmit={save}>
              <header>
                <div>
                  <span className="projects-dialog-kicker">{t("eyebrow")}</span>
                  <DialogTitle>
                    {editing ? t("editor.editTitle") : t("editor.createTitle")}
                  </DialogTitle>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={t("actions.close")}
                  disabled={saving}
                  onClick={() => setEditorOpen(false)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>
              <DialogDescription className="projects-editor-description">
                {editing
                  ? t("editor.editDescription")
                  : t("editor.createDescription")}
              </DialogDescription>
              {actionError && (
                <div className="projects-error" role="alert">
                  <span>{actionError}</span>
                  {conflict && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void reloadConflict()}
                    >
                      {t("actions.reload")}
                    </button>
                  )}
                </div>
              )}
              <label className="projects-field">
                <span>{t("fields.name")}</span>
                <input
                  required
                  maxLength={120}
                  ref={projectNameRef}
                  value={draft.name}
                  disabled={saving}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              {editing && (
                <p className="projects-key-note">
                  {t("fields.key", { key: editing.key })}
                </p>
              )}
              <label className="projects-field">
                <span>{t("fields.description")}</span>
                <textarea
                  maxLength={1000}
                  rows={4}
                  disabled={saving}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <footer>
                <button
                  className="button button-ghost"
                  type="button"
                  disabled={saving}
                  onClick={() => setEditorOpen(false)}
                >
                  {t("actions.cancel")}
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? t("actions.saving") : t("actions.save")}
                </button>
              </footer>
            </form>
          </DialogContent>
        )}
      </Dialog>
      {confirmation && (
        <ConfirmDialog
          request={confirmation}
          onResolve={(confirmed) => void resolveArchive(confirmed)}
        />
      )}
    </main>
  );
}

function ProjectCard({
  project,
  busy,
  onEdit,
  onArchive,
  onRestore,
}: {
  project: Project;
  busy: boolean;
  onEdit: (trigger: HTMLElement) => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const { t } = useTranslation("projects");
  return (
    <article
      className={`project-card ${project.status === "archived" ? "is-archived" : ""}`}
    >
      <header className="project-card-top">
        <span className="project-mark">
          <FolderKanban size={18} aria-hidden="true" />
        </span>
        <span className={`project-status ${project.status}`}>
          {t(`status.${project.status}`)}
        </span>
        <div className="project-card-actions">
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            aria-label={t("actions.editProject", { name: project.name })}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          {onArchive && (
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              aria-label={t("actions.archiveProject", { name: project.name })}
              onClick={onArchive}
            >
              <Archive size={15} aria-hidden="true" />
            </button>
          )}
          {onRestore && (
            <button
              className="button button-ghost button-small"
              type="button"
              disabled={busy}
              onClick={onRestore}
            >
              {t("actions.restore")}
            </button>
          )}
        </div>
      </header>
      <div className="project-card-copy">
        <h3>{project.name}</h3>
        <p>{project.description || t("card.noDescription")}</p>
      </div>
      <footer>
        <span className="project-key">{project.key}</span>
        <Link
          className="project-finance-link"
          to={`/financeiro?project=${encodeURIComponent(project.key)}`}
        >
          {t("actions.openFinance")}{" "}
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
