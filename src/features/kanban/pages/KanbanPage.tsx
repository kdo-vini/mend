import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  GripVertical,
  ListFilter,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { Issue, IssueStatus } from "../../../types";
import { currentInterfaceLanguage } from "../../../i18n/preferences";
import {
  createPersonalEvent,
  createPersonalTask,
  deletePersonalEvent,
  deletePersonalTask,
  listPersonalEvents,
  listPersonalTasks,
  moveLiveIssue,
  movePersonalTask,
  subscribeToKanban,
  updatePersonalTask,
  type PersonalEvent,
  type PersonalTask,
  type PersonalTaskStatus,
} from "../api";
import {
  isCompletionArchived,
  nextCompletionArchiveAt,
} from "../completion-archive";

type Mode = "shared" | "personal";
type PersonalRange = "today" | "week" | "all";
type DragState = { id: string; kind: "issue" | "task"; status: string };

const sharedColumns: Array<{ status: IssueStatus; label: string }> = [
  { status: "Triage", label: "Triage" },
  { status: "Backlog", label: "Backlog" },
  { status: "Todo", label: "To do" },
  { status: "In Progress", label: "In progress" },
  { status: "Review", label: "Review" },
  { status: "Done", label: "Done" },
];

const personalColumns: Array<{
  status: PersonalTaskStatus;
  label: string;
}> = [
  { status: "todo", label: "To do" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
];

const dbStatus: Record<IssueStatus, string> = {
  Triage: "triage",
  Backlog: "backlog",
  Todo: "todo",
  "In Progress": "in_progress",
  Review: "review",
  Done: "done",
  Canceled: "canceled",
};

const issueStatusByDb: Record<string, IssueStatus> = Object.fromEntries(
  Object.entries(dbStatus).map(([label, value]) => [value, label]),
) as Record<string, IssueStatus>;

const personalStatusForIssue: Record<IssueStatus, PersonalTaskStatus> = {
  Triage: "todo",
  Backlog: "todo",
  Todo: "todo",
  "In Progress": "in_progress",
  Review: "in_progress",
  Done: "done",
  Canceled: "done",
};

const issueStatusForPersonalColumn: Record<PersonalTaskStatus, IssueStatus> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const priorityTone: Record<string, string> = {
  Urgent: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
};

const demoTasks: PersonalTask[] = [
  {
    id: "demo-task-1",
    workspaceId: "demo",
    userId: "demo-user",
    title: "Revisar lista de onboarding",
    notes: null,
    status: "todo",
    dueOn: todayIso(),
    kanbanPosition: 1024,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-task-2",
    workspaceId: "demo",
    userId: "demo-user",
    title: "Preparar repasse da triagem",
    notes: null,
    status: "in_progress",
    dueOn: todayIso(),
    kanbanPosition: 1024,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateLabel(value: string | null | undefined, noDueDate: string) {
  if (!value) return noDueDate;
  return new Intl.DateTimeFormat(currentInterfaceLanguage(), {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function eventTimeLabel(value: string) {
  return new Intl.DateTimeFormat(currentInterfaceLanguage(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function localDayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function isMobileViewport() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 820px)").matches
  );
}

function initialMode(): Mode {
  if (typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("mode");
    if (requested === "shared" || requested === "personal") return requested;
  }
  return isMobileViewport() ? "personal" : "shared";
}

interface KanbanPageProps {
  fixedMode?: "shared" | "personal";
  workspaceId: string;
  currentUserId: string;
  issues: Issue[];
  assigneeLabel: (value: string) => string;
  demoMode: boolean;
  onUpdateIssue: (issueId: string, patch: Partial<Issue>) => void;
  onOpenIssue: (issueId: string) => void;
  onNewIssue: () => void;
  onToast: (message: string) => void;
}

export function KanbanPage({
  fixedMode,
  workspaceId,
  currentUserId,
  issues,
  assigneeLabel,
  demoMode,
  onUpdateIssue,
  onOpenIssue,
  onNewIssue,
  onToast,
}: KanbanPageProps) {
  const { t } = useTranslation("kanban");
  const [localMode, setLocalMode] = useState<Mode>(initialMode);
  const mode = fixedMode ?? localMode;
  const [range, setRange] = useState<PersonalRange>("today");
  const [showCanceled, setShowCanceled] = useState(false);
  const [tasks, setTasks] = useState<PersonalTask[]>(demoMode ? demoTasks : []);
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const taskInputRef = useRef<HTMLInputElement>(null);
  const [eventComposerOpen, setEventComposerOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventStart, setEventStart] = useState(() => {
    const value = new Date();
    value.setMinutes(0, 0, 0);
    return value.toISOString().slice(0, 16);
  });
  const [eventEnd, setEventEnd] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [issueDrafts, setIssueDrafts] = useState<
    Record<string, Partial<Issue>>
  >({});
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const visibleIssues = useMemo(
    () =>
      issues
        .map((issue) => ({ ...issue, ...issueDrafts[issue.id] }))
        .filter(
          (issue) =>
            (showCanceled || issue.status !== "Canceled") &&
            !(
              issue.status === "Done" &&
              isCompletionArchived(issue.completedAt, now)
            ),
        ),
    [issues, issueDrafts, now, showCanceled],
  );

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          !(
            task.status === "done" &&
            isCompletionArchived(task.completedAt, now)
          ),
      ),
    [now, tasks],
  );

  const assignedIssues = useMemo(
    () =>
      visibleIssues.filter(
        (issue) =>
          issue.assignee === currentUserId &&
          issue.status !== "Canceled" &&
          (range === "all" ||
            Boolean(
              issue.dueOn &&
                issue.dueOn >= todayIso() &&
                issue.dueOn <= addDays(todayIso(), range === "today" ? 0 : 7),
            )),
      ),
    [currentUserId, range, visibleIssues],
  );

  const personalItems = useMemo(
    () => [
      ...visibleTasks.map((task) => ({ kind: "task" as const, task })),
      ...assignedIssues.map((issue) => ({ kind: "issue" as const, issue })),
    ],
    [assignedIssues, visibleTasks],
  );

  const nextArchiveAt = useMemo(() => {
    const dates = [
      ...visibleIssues
        .filter((issue) => issue.status === "Done")
        .map((issue) => nextCompletionArchiveAt(issue.completedAt)),
      ...visibleTasks
        .filter((task) => task.status === "done")
        .map((task) => nextCompletionArchiveAt(task.completedAt)),
    ].filter((value): value is number => value !== null && value > now);
    return dates.length ? Math.min(...dates) : null;
  }, [now, visibleIssues, visibleTasks]);

  useEffect(() => {
    if (nextArchiveAt === null) return undefined;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextArchiveAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [nextArchiveAt]);

  const refreshPersonal = useCallback(async () => {
    if (demoMode || !workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const today = todayIso();
      const filters =
        range === "all"
          ? {}
          : { from: today, to: addDays(today, range === "today" ? 0 : 7) };
      const [nextTasks, nextEvents] = await Promise.all([
        listPersonalTasks(workspaceId, filters),
        listPersonalEvents(
          workspaceId,
          localDayBounds().from,
          localDayBounds().to,
        ),
      ]);
      setTasks(nextTasks);
      setEvents(nextEvents);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("errors.personalLoad"),
      );
    } finally {
      setLoading(false);
    }
  }, [demoMode, range, t, workspaceId]);

  useEffect(() => {
    void refreshPersonal();
  }, [refreshPersonal]);

  useEffect(() => {
    if (demoMode || !workspaceId) return undefined;
    return subscribeToKanban(workspaceId, currentUserId, (change) => {
      if (change.table === "issues") {
        const status = issueStatusByDb[String(change.row.status)];
        const id = String(change.row.id ?? "");
        if (id && status) {
          setIssueDrafts((current) => ({
            ...current,
            [id]: {
              ...current[id],
              status,
              kanbanPosition:
                change.row.kanban_position == null
                  ? current[id]?.kanbanPosition
                  : Number(change.row.kanban_position),
              dueOn:
                change.row.due_on == null
                  ? current[id]?.dueOn
                  : String(change.row.due_on),
              completedAt:
                change.row.completed_at == null
                  ? current[id]?.completedAt
                  : String(change.row.completed_at),
            },
          }));
        }
      } else {
        void refreshPersonal();
      }
    });
  }, [currentUserId, demoMode, refreshPersonal, workspaceId]);

  const updateTaskStatus = async (
    task: PersonalTask,
    status: PersonalTaskStatus,
  ) => {
    if (!online) {
      onToast(t("errors.offlineUpdatePlan"));
      return;
    }
    const previous = task;
    const optimistic = {
      ...task,
      status,
      completedAt: status === "done" ? new Date().toISOString() : null,
    };
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? optimistic : item)),
    );
    try {
      if (!demoMode) await movePersonalTask(workspaceId, task.id, { status });
    } catch (cause) {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? previous : item)),
      );
      onToast(cause instanceof Error ? cause.message : t("errors.taskMove"));
    }
  };

  const moveIssue = async (
    issue: Issue,
    nextStatus: IssueStatus,
    beforeId?: string | null,
    afterId?: string | null,
  ) => {
    if (!online) {
      onToast(t("errors.offlineMoveWork"));
      return;
    }
    const previousStatus = issue.status;
    const completedAt = nextStatus === "Done" ? new Date().toISOString() : null;
    setIssueDrafts((current) => ({
      ...current,
      [issue.id]: { status: nextStatus, completedAt },
    }));
    try {
      if (!demoMode)
        await moveLiveIssue({
          workspaceId,
          identifier: issue.identifier,
          issueId: issue.id,
          status: dbStatus[nextStatus],
          beforeId,
          afterId,
        });
      if (demoMode) onUpdateIssue(issue.id, { status: nextStatus });
    } catch (cause) {
      setIssueDrafts((current) => ({
        ...current,
        [issue.id]: { status: previousStatus },
      }));
      onToast(cause instanceof Error ? cause.message : t("errors.issueMove"));
    }
  };

  const createTask = async () => {
    if (!online) {
      onToast(t("errors.offlineAddTask"));
      return;
    }
    if (!taskTitle.trim()) return;
    const title = taskTitle.trim();
    setTaskTitle("");
    if (demoMode) {
      setTasks((current) => [
        ...current,
        {
          ...demoTasks[0],
          id: `demo-task-${Date.now()}`,
          title,
          dueOn: todayIso(),
          kanbanPosition:
            Math.max(...current.map((task) => task.kanbanPosition), 0) + 1024,
        },
      ]);
      return;
    }
    try {
      const task = await createPersonalTask({
        workspaceId,
        title,
        dueOn: range === "all" ? null : todayIso(),
      });
      setTasks((current) => [...current, task]);
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : t("errors.taskCreate"));
    }
  };

  const focusTaskInput = () => {
    if (!online) {
      onToast(t("errors.offlineAddTask"));
      return;
    }
    taskInputRef.current?.focus();
  };

  const createEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!online) {
      onToast(t("errors.offlineAddEvent"));
      return;
    }
    if (!eventTitle.trim()) return;
    const value = {
      title: eventTitle.trim(),
      startsAt: new Date(eventStart).toISOString(),
      endsAt: eventEnd ? new Date(eventEnd).toISOString() : null,
      location: eventLocation.trim() || null,
    };
    try {
      const next = demoMode
        ? ({
            ...value,
            id: `demo-event-${Date.now()}`,
            workspaceId: "demo",
            userId: currentUserId,
            allDay: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } satisfies PersonalEvent)
        : await createPersonalEvent({ workspaceId, ...value });
      setEvents((current) =>
        [...current, next].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setEventComposerOpen(false);
      setEventTitle("");
      setEventLocation("");
    } catch (cause) {
      onToast(cause instanceof Error ? cause.message : t("errors.eventCreate"));
    }
  };

  const removeTask = async (task: PersonalTask) => {
    if (!online) {
      onToast(t("errors.offlineChangePlan"));
      return;
    }
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (!demoMode) {
      try {
        await deletePersonalTask(workspaceId, task.id);
      } catch (cause) {
        setTasks((current) => [...current, task]);
        onToast(
          cause instanceof Error ? cause.message : t("errors.taskDelete"),
        );
      }
    }
  };

  const setTaskDueDate = async (task: PersonalTask, dueOn: string) => {
    if (!online) {
      onToast(t("errors.offlineDueDate"));
      return;
    }
    const previous = task.dueOn;
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, dueOn } : item)),
    );
    if (demoMode) return;
    try {
      await updatePersonalTask({
        workspaceId,
        taskId: task.id,
        patch: { dueOn },
      });
    } catch (cause) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, dueOn: previous } : item,
        ),
      );
      onToast(cause instanceof Error ? cause.message : t("errors.taskDueDate"));
    }
  };

  const removeEvent = async (event: PersonalEvent) => {
    if (!online) {
      onToast(t("errors.offlineAgenda"));
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    if (!demoMode) {
      try {
        await deletePersonalEvent(workspaceId, event.id);
      } catch (cause) {
        setEvents((current) => [...current, event]);
        onToast(
          cause instanceof Error ? cause.message : t("errors.eventDelete"),
        );
      }
    }
  };

  const setIssueDueDate = (issue: Issue, dueOn: string) => {
    if (!online) {
      onToast(t("errors.offlineDueDate"));
      return;
    }
    onUpdateIssue(issue.id, { dueOn });
  };

  return (
    <section className="kanban-page">
      {!online && (
        <div className="kanban-offline-banner" role="status">
          {t("ui.offline")}
        </div>
      )}
      <header className="kanban-header">
        <div className="page-heading">
          <span className="page-kicker">{t("ui.eyebrow")}</span>
          <h1>{t("title")}</h1>
          <p>
            {mode === "shared"
              ? t("ui.sharedDescription")
              : t("ui.personalDescription")}
          </p>
        </div>
        <div className="kanban-header-actions">
          {fixedMode === undefined && (
            <div
              className="kanban-mode-switch"
              role="tablist"
              aria-label={t("ui.view")}
            >
              <button
                className={mode === "shared" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={mode === "shared"}
                onClick={() => setLocalMode("shared")}
              >
                {t("ui.shared")}
              </button>
              <button
                className={mode === "personal" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={mode === "personal"}
                onClick={() => setLocalMode("personal")}
              >
                {t("ui.personal")}
              </button>
            </div>
          )}
          {mode === "shared" && (
            <button
              className={`button button-ghost ${showCanceled ? "active" : ""}`}
              type="button"
              aria-pressed={showCanceled}
              onClick={() => setShowCanceled((current) => !current)}
            >
              {showCanceled ? t("ui.hideCanceled") : t("ui.canceled")}
            </button>
          )}
          <button
            disabled={!online}
            className="button button-primary kanban-primary-action"
            type="button"
            onClick={mode === "shared" ? onNewIssue : focusTaskInput}
          >
            <Plus size={14} />{" "}
            {mode === "shared" ? t("ui.newIssue") : t("ui.newTask")}
          </button>
        </div>
      </header>

      {mode === "personal" && (
        <div className="kanban-personal-toolbar">
          <div
            className="kanban-range-switch"
            role="tablist"
            aria-label={t("ui.personalRange")}
          >
            {(["today", "week", "all"] as PersonalRange[]).map((value) => (
              <button
                key={value}
                className={range === value ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={range === value}
                onClick={() => setRange(value)}
              >
                {value === "today"
                  ? t("ui.today")
                  : value === "week"
                    ? t("ui.thisWeek")
                    : t("ui.all")}
              </button>
            ))}
          </div>
          <div className="kanban-task-quick-add">
            <Plus size={13} />
            <input
              disabled={!online}
              ref={taskInputRef}
              aria-label={t("ui.newPersonalTask")}
              value={taskTitle}
              placeholder={t("ui.addTaskPlaceholder")}
              onChange={(event) => setTaskTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createTask();
              }}
            />
            <button
              disabled={!online}
              className="text-button"
              type="button"
              onClick={() => void createTask()}
            >
              {t("ui.add")}
            </button>
          </div>
          <button
            disabled={!online}
            className="button button-ghost"
            type="button"
            onClick={() => setEventComposerOpen((current) => !current)}
          >
            <CalendarDays size={14} /> {t("ui.addEvent")}
          </button>
        </div>
      )}

      {error && (
        <div className="kanban-error" role="alert">
          <span>{error}</span>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void refreshPersonal()}
          >
            {t("ui.retry")}
          </button>
        </div>
      )}

      {eventComposerOpen && mode === "personal" && (
        <form className="kanban-event-composer" onSubmit={createEvent}>
          <input
            required
            aria-label={t("ui.eventTitle")}
            placeholder={t("ui.eventTitle")}
            value={eventTitle}
            onChange={(event) => setEventTitle(event.target.value)}
          />
          <label>
            <span>{t("ui.starts")}</span>
            <input
              required
              type="datetime-local"
              value={eventStart}
              onChange={(event) => setEventStart(event.target.value)}
            />
          </label>
          <label>
            <span>{t("ui.ends")}</span>
            <input
              type="datetime-local"
              value={eventEnd}
              onChange={(event) => setEventEnd(event.target.value)}
            />
          </label>
          <input
            aria-label={t("ui.eventLocation")}
            placeholder={t("ui.eventLocationOptional")}
            value={eventLocation}
            onChange={(event) => setEventLocation(event.target.value)}
          />
          <button
            disabled={!online}
            className="button button-primary"
            type="submit"
          >
            {t("ui.saveEvent")}
          </button>
          <button
            className="icon-button subtle"
            type="button"
            aria-label={t("ui.closeEventForm")}
            onClick={() => setEventComposerOpen(false)}
          >
            <X size={15} />
          </button>
        </form>
      )}

      <div className="kanban-desktop-view">
        {mode === "personal" && (
          <AgendaStrip events={events} onRemove={removeEvent} />
        )}
        {loading ? (
          <KanbanSkeleton label={t("ui.loading")} />
        ) : (
          <DesktopBoard
            mode={mode}
            issues={visibleIssues}
            showCanceled={showCanceled}
            personalItems={personalItems}
            tasks={visibleTasks}
            drag={drag}
            setDrag={setDrag}
            onMoveIssue={moveIssue}
            onMoveTask={updateTaskStatus}
            onOpenIssue={onOpenIssue}
            assigneeLabel={assigneeLabel}
            setIssueDueDate={setIssueDueDate}
            removeTask={removeTask}
            onAddCard={mode === "shared" ? onNewIssue : focusTaskInput}
            online={online}
          />
        )}
      </div>

      <div className="kanban-mobile-view">
        {mode === "personal" ? (
          <MobileAgenda
            events={events}
            tasks={visibleTasks}
            issues={assignedIssues}
            onRemoveEvent={removeEvent}
            onTaskStatus={updateTaskStatus}
            onTaskDueDate={setTaskDueDate}
            onIssueDueDate={setIssueDueDate}
            onOpenIssue={onOpenIssue}
          />
        ) : (
          <MobileSharedList
            issues={visibleIssues}
            showCanceled={showCanceled}
            onOpenIssue={onOpenIssue}
          />
        )}
      </div>
    </section>
  );
}

function KanbanSkeleton({ label }: { label: string }) {
  return (
    <div className="kanban-skeleton-row" aria-label={label}>
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function AgendaStrip({
  events,
  onRemove,
}: {
  events: PersonalEvent[];
  onRemove: (event: PersonalEvent) => void;
}) {
  const { t } = useTranslation("kanban");
  return (
    <section className="kanban-agenda-strip" aria-label={t("ui.todaysAgenda")}>
      <div className="kanban-agenda-heading">
        <span>
          <CalendarDays size={14} /> {t("ui.today")}
        </span>
        <small>
          {events.length
            ? t("ui.eventsCount", { count: events.length })
            : t("ui.noEvents")}
        </small>
      </div>
      <div className="kanban-agenda-list">
        {events.length ? (
          events.map((event) => (
            <div className="kanban-agenda-item" key={event.id}>
              <time>{eventTimeLabel(event.startsAt)}</time>
              <strong>{event.title}</strong>
              {event.location && <small>{event.location}</small>}
              <button
                className="icon-button subtle"
                type="button"
                aria-label={t("ui.deleteEvent", { title: event.title })}
                onClick={() => onRemove(event)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        ) : (
          <span className="kanban-agenda-empty">{t("ui.quietDay")}</span>
        )}
      </div>
    </section>
  );
}

function DesktopBoard({
  mode,
  issues,
  showCanceled,
  personalItems,
  tasks,
  drag,
  setDrag,
  onMoveIssue,
  onMoveTask,
  onOpenIssue,
  assigneeLabel,
  setIssueDueDate,
  removeTask,
  onAddCard,
  online,
}: {
  mode: Mode;
  issues: Issue[];
  showCanceled: boolean;
  personalItems: Array<
    { kind: "task"; task: PersonalTask } | { kind: "issue"; issue: Issue }
  >;
  tasks: PersonalTask[];
  drag: DragState | null;
  setDrag: (value: DragState | null) => void;
  onMoveIssue: (
    issue: Issue,
    status: IssueStatus,
    beforeId?: string | null,
    afterId?: string | null,
  ) => void;
  onMoveTask: (task: PersonalTask, status: PersonalTaskStatus) => void;
  onOpenIssue: (id: string) => void;
  assigneeLabel: (value: string) => string;
  setIssueDueDate: (issue: Issue, dueOn: string) => void;
  removeTask: (task: PersonalTask) => void;
  onAddCard: () => void;
  online: boolean;
}) {
  const { t } = useTranslation("kanban");
  const issueStatusLabel = (status: IssueStatus) =>
    status === "Triage"
      ? t("data.issueStatus.triage", { ns: "common" })
      : status === "Backlog"
        ? t("data.issueStatus.backlog", { ns: "common" })
        : status === "Todo"
          ? t("data.issueStatus.todo", { ns: "common" })
          : status === "In Progress"
            ? t("data.issueStatus.inProgress", { ns: "common" })
            : status === "Review"
              ? t("data.issueStatus.review", { ns: "common" })
              : status === "Done"
                ? t("data.issueStatus.done", { ns: "common" })
                : t("data.issueStatus.canceled", { ns: "common" });
  const personalStatusLabel = (status: PersonalTaskStatus) =>
    status === "todo"
      ? t("data.issueStatus.todo", { ns: "common" })
      : status === "in_progress"
        ? t("data.issueStatus.inProgress", { ns: "common" })
        : t("data.issueStatus.done", { ns: "common" });
  const localizedSharedColumns = sharedColumns.map((column) => ({
    ...column,
    label: issueStatusLabel(column.status),
  }));
  const localizedPersonalColumns = personalColumns.map((column) => ({
    ...column,
    label: personalStatusLabel(column.status),
  }));
  const columns =
    mode === "shared"
      ? [
          ...localizedSharedColumns,
          ...(showCanceled
            ? [{ status: "Canceled" as IssueStatus, label: t("ui.canceled") }]
            : []),
        ]
      : localizedPersonalColumns;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>(
    {},
  );
  return (
    <div className={`kanban-board ${mode === "personal" ? "is-personal" : ""}`}>
      {columns.map((column) => {
        const items =
          mode === "shared"
            ? issues
                .filter((issue) => issue.status === column.status)
                .sort(
                  (a, b) => (a.kanbanPosition ?? 0) - (b.kanbanPosition ?? 0),
                )
            : personalItems.filter((item) =>
                item.kind === "task"
                  ? item.task.status === column.status
                  : personalStatusForIssue[item.issue.status] === column.status,
              );
        const visibleItems = items.slice(0, visibleCounts[column.status] ?? 50);
        return (
          <section
            className="kanban-column"
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (!drag) return;
              if (drag.kind === "issue") {
                const issue = issues.find((item) => item.id === drag.id);
                const issueItems =
                  mode === "shared"
                    ? (items as Issue[])
                    : items
                        .filter(
                          (item) => "kind" in item && item.kind === "issue",
                        )
                        .map(
                          (item) =>
                            (item as { kind: "issue"; issue: Issue }).issue,
                        );
                if (issue) {
                  const targetStatus =
                    mode === "shared"
                      ? (column.status as IssueStatus)
                      : issueStatusForPersonalColumn[
                          column.status as PersonalTaskStatus
                        ];
                  onMoveIssue(
                    issue,
                    targetStatus,
                    issueItems.at(-1)?.id ?? null,
                    null,
                  );
                }
              } else {
                const task = tasks.find((item) => item.id === drag.id);
                if (task) onMoveTask(task, column.status as PersonalTaskStatus);
              }
              setDrag(null);
            }}
          >
            <header className="kanban-column-heading">
              <span>{column.label}</span>
              <strong>{items.length}</strong>
              <button
                className="icon-button subtle"
                type="button"
                aria-label={t("ui.filterColumn", { column: column.label })}
              >
                <ListFilter size={13} />
              </button>
            </header>
            <div className="kanban-column-cards">
              {visibleItems.map((item, index) => {
                const next = visibleItems[index + 1];
                if (mode === "shared") {
                  const issue = item as Issue;
                  return (
                    <IssueCard
                      key={issue.id}
                      issue={issue}
                      statusOptions={sharedColumns}
                      drag={drag}
                      setDrag={setDrag}
                      onMove={(status) => onMoveIssue(issue, status)}
                      onDropBefore={(beforeId) =>
                        onMoveIssue(
                          issue,
                          issue.status,
                          beforeId,
                          (next as Issue | undefined)?.id ?? null,
                        )
                      }
                      onOpen={() => onOpenIssue(issue.id)}
                      assigneeLabel={assigneeLabel}
                      setDueDate={(value) => setIssueDueDate(issue, value)}
                    />
                  );
                }
                const personal = item as
                  | { kind: "task"; task: PersonalTask }
                  | { kind: "issue"; issue: Issue };
                if (personal.kind === "issue")
                  return (
                    <IssueCard
                      key={personal.issue.id}
                      issue={personal.issue}
                      statusOptions={sharedColumns}
                      drag={drag}
                      setDrag={setDrag}
                      onMove={(status) => onMoveIssue(personal.issue, status)}
                      onDropBefore={(beforeId) =>
                        onMoveIssue(
                          personal.issue,
                          issueStatusForPersonalColumn[
                            personalStatusForIssue[personal.issue.status]
                          ],
                          beforeId,
                          next && "kind" in next && next.kind === "issue"
                            ? next.issue.id
                            : null,
                        )
                      }
                      onOpen={() => onOpenIssue(personal.issue.id)}
                      assigneeLabel={assigneeLabel}
                      setDueDate={(value) =>
                        setIssueDueDate(personal.issue, value)
                      }
                    />
                  );
                return (
                  <TaskCard
                    key={personal.task.id}
                    task={personal.task}
                    statusOptions={personalColumns}
                    drag={drag}
                    setDrag={setDrag}
                    onMove={(status) => onMoveTask(personal.task, status)}
                    onDelete={() => removeTask(personal.task)}
                  />
                );
              })}
              {!items.length && (
                <div className="kanban-column-empty">
                  <CircleDot size={15} />
                  <span>{t("ui.nothingHere")}</span>
                  <small>{t("ui.dropWork")}</small>
                </div>
              )}
            </div>
            {visibleItems.length < items.length && (
              <button
                className="kanban-load-more"
                type="button"
                onClick={() =>
                  setVisibleCounts((current) => ({
                    ...current,
                    [column.status]: (current[column.status] ?? 50) + 50,
                  }))
                }
              >
                {t("ui.loadMore", {
                  count: items.length - visibleItems.length,
                })}
              </button>
            )}
            <button
              disabled={!online}
              className="kanban-add-card"
              type="button"
              onClick={onAddCard}
            >
              <Plus size={13} /> {t("ui.addCard")}
            </button>
          </section>
        );
      })}
    </div>
  );
}

function CardMenu({ children }: { children: ReactNode }) {
  const { t } = useTranslation("kanban");
  return (
    <details className="kanban-card-menu">
      <summary aria-label={t("ui.cardActions")}>
        <MoreHorizontal size={14} />
      </summary>
      <div className="kanban-card-menu-popover">{children}</div>
    </details>
  );
}

function IssueCard({
  issue,
  statusOptions,
  drag,
  setDrag,
  onMove,
  onDropBefore,
  onOpen,
  assigneeLabel,
  setDueDate,
}: {
  issue: Issue;
  statusOptions: typeof sharedColumns;
  drag: DragState | null;
  setDrag: (value: DragState | null) => void;
  onMove: (status: IssueStatus) => void;
  onDropBefore: (id: string) => void;
  onOpen: () => void;
  assigneeLabel: (value: string) => string;
  setDueDate: (value: string) => void;
}) {
  const { t } = useTranslation("kanban");
  return (
    <article
      className={`kanban-card issue-card ${drag?.id === issue.id ? "is-dragging" : ""}`}
      draggable
      onDragStart={() =>
        setDrag({ id: issue.id, kind: "issue", status: issue.status })
      }
      onDragEnd={() => setDrag(null)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDropBefore(issue.id);
        setDrag(null);
      }}
    >
      <div className="kanban-card-topline">
        <button className="kanban-card-id" type="button" onClick={onOpen}>
          {issue.identifier}
        </button>
        <span
          className={`priority-dot ${priorityTone[issue.priority] ?? "none"}`}
          title={issue.priority}
        />
        <CardMenu>
          <button type="button" onClick={onOpen}>
            {t("ui.openIssue")}
          </button>
          <label>
            {t("ui.moveTo")}
            <select
              aria-label={t("ui.moveIssue", { identifier: issue.identifier })}
              value={issue.status}
              onChange={(event) => onMove(event.target.value as IssueStatus)}
            >
              {statusOptions.map((option) => (
                <option key={option.status} value={option.status}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </CardMenu>
      </div>
      <button className="kanban-card-title" type="button" onClick={onOpen}>
        {issue.title}
      </button>
      <div className="kanban-card-meta">
        <span>{issue.type}</span>
        {issue.assignee !== "Unassigned" && (
          <span>{assigneeLabel(issue.assignee)}</span>
        )}
        <label className="kanban-due-control">
          <Clock3 size={12} />
          <input
            aria-label={t("ui.dueDateFor", { name: issue.identifier })}
            type="date"
            value={issue.dueOn ?? ""}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
      </div>
      <div className="kanban-card-footer">
        <span className="drag-handle" aria-hidden="true">
          <GripVertical size={13} /> {t("ui.dragToReorder")}
        </span>
        {issue.labels.slice(0, 2).map((label) => (
          <span className="kanban-label" key={label}>
            {label}
          </span>
        ))}
      </div>
    </article>
  );
}

function TaskCard({
  task,
  statusOptions,
  drag,
  setDrag,
  onMove,
  onDelete,
}: {
  task: PersonalTask;
  statusOptions: typeof personalColumns;
  drag: DragState | null;
  setDrag: (value: DragState | null) => void;
  onMove: (status: PersonalTaskStatus) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("kanban");
  return (
    <article
      className={`kanban-card task-card ${drag?.id === task.id ? "is-dragging" : ""}`}
      draggable
      onDragStart={() =>
        setDrag({ id: task.id, kind: "task", status: task.status })
      }
      onDragEnd={() => setDrag(null)}
    >
      <div className="kanban-card-topline">
        <span className="task-kind">{t("ui.personalTask")}</span>
        <CardMenu>
          <label>
            {t("ui.moveTo")}
            <select
              aria-label={t("ui.moveTask", { title: task.title })}
              value={task.status}
              onChange={(event) =>
                onMove(event.target.value as PersonalTaskStatus)
              }
            >
              {statusOptions.map((option) => (
                <option key={option.status} value={option.status}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="danger-text" onClick={onDelete}>
            {t("ui.deleteTask")}
          </button>
        </CardMenu>
      </div>
      <button
        className="kanban-card-title"
        type="button"
        onClick={() => onMove(task.status === "done" ? "todo" : "done")}
      >
        {task.title}
      </button>
      <div className="kanban-card-meta">
        <span>{dateLabel(task.dueOn, t("ui.noDueDate"))}</span>
        {task.completedAt && (
          <span className="success-copy">
            <Check size={12} /> {t("ui.completed")}
          </span>
        )}
      </div>
      <div className="kanban-card-footer">
        <span className="drag-handle" aria-hidden="true">
          <GripVertical size={13} /> {t("ui.dragToReorder")}
        </span>
      </div>
    </article>
  );
}

function MobileAgenda({
  events,
  tasks,
  issues,
  onRemoveEvent,
  onTaskStatus,
  onTaskDueDate,
  onIssueDueDate,
  onOpenIssue,
}: {
  events: PersonalEvent[];
  tasks: PersonalTask[];
  issues: Issue[];
  onRemoveEvent: (event: PersonalEvent) => void;
  onTaskStatus: (task: PersonalTask, status: PersonalTaskStatus) => void;
  onTaskDueDate: (task: PersonalTask, dueOn: string) => void;
  onIssueDueDate: (issue: Issue, dueOn: string) => void;
  onOpenIssue: (id: string) => void;
}) {
  const { t } = useTranslation("kanban");
  return (
    <div className="mobile-agenda">
      <section className="mobile-agenda-section">
        <header>
          <span>
            <CalendarDays size={14} /> {t("ui.nextUp")}
          </span>
          <small>
            {events.length
              ? eventTimeLabel(events[0].startsAt)
              : t("ui.noEvent")}
          </small>
        </header>
        {events.length ? (
          events.map((event) => (
            <div className="mobile-agenda-row" key={event.id}>
              <time>{eventTimeLabel(event.startsAt)}</time>
              <span>
                <strong>{event.title}</strong>
                <small>{event.location || t("ui.personalEvent")}</small>
              </span>
              <button
                className="icon-button subtle"
                type="button"
                aria-label={t("ui.deleteEvent", { title: event.title })}
                onClick={() => onRemoveEvent(event)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        ) : (
          <p className="mobile-agenda-empty">{t("ui.noMeetings")}</p>
        )}
      </section>
      <section className="mobile-agenda-section">
        <header>
          <span>
            <Check size={14} /> {t("ui.today")}
          </span>
          <small>
            {t("ui.itemsCount", { count: tasks.length + issues.length })}
          </small>
        </header>
        {tasks.map((task) => (
          <div
            className="mobile-agenda-row mobile-agenda-task-row"
            key={task.id}
          >
            <button
              className="mobile-agenda-row-main mobile-agenda-action"
              type="button"
              onClick={() =>
                onTaskStatus(task, task.status === "done" ? "todo" : "done")
              }
            >
              <span
                className={`mobile-check ${task.status === "done" ? "is-done" : ""}`}
              >
                {task.status === "done" && <Check size={11} />}
              </span>
              <span>
                <strong>{task.title}</strong>
                <small>
                  {t("ui.personalTaskDate", {
                    date: dateLabel(task.dueOn, t("ui.noDueDate")),
                  })}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
            <input
              className="mobile-agenda-date"
              aria-label={t("ui.dueDateFor", { name: task.title })}
              type="date"
              value={task.dueOn ?? ""}
              onChange={(event) => onTaskDueDate(task, event.target.value)}
            />
          </div>
        ))}
        {issues.map((issue) => (
          <div
            className="mobile-agenda-row mobile-agenda-task-row"
            key={issue.id}
          >
            <button
              className="mobile-agenda-row-main mobile-agenda-action"
              type="button"
              onClick={() => onOpenIssue(issue.id)}
            >
              <span
                className={`priority-dot ${priorityTone[issue.priority] ?? "none"}`}
              />
              <span>
                <strong>{issue.title}</strong>
                <small>
                  {issue.identifier} ·{" "}
                  {dateLabel(issue.dueOn, t("ui.noDueDate"))}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
            <input
              className="mobile-agenda-date"
              aria-label={t("ui.dueDateFor", { name: issue.identifier })}
              type="date"
              value={issue.dueOn ?? ""}
              onChange={(event) => onIssueDueDate(issue, event.target.value)}
            />
          </div>
        ))}
        {!tasks.length && !issues.length && (
          <p className="mobile-agenda-empty">{t("ui.nothingDue")}</p>
        )}
      </section>
    </div>
  );
}

function MobileSharedList({
  issues,
  showCanceled,
  onOpenIssue,
}: {
  issues: Issue[];
  showCanceled: boolean;
  onOpenIssue: (id: string) => void;
}) {
  const { t } = useTranslation(["kanban", "common"]);
  const issueStatusLabel = (status: IssueStatus) =>
    status === "Triage"
      ? t("data.issueStatus.triage", { ns: "common" })
      : status === "Backlog"
        ? t("data.issueStatus.backlog", { ns: "common" })
        : status === "Todo"
          ? t("data.issueStatus.todo", { ns: "common" })
          : status === "In Progress"
            ? t("data.issueStatus.inProgress", { ns: "common" })
            : status === "Review"
              ? t("data.issueStatus.review", { ns: "common" })
              : status === "Done"
                ? t("data.issueStatus.done", { ns: "common" })
                : t("data.issueStatus.canceled", { ns: "common" });
  const columns = [
    ...sharedColumns.map((column) => ({
      ...column,
      label: issueStatusLabel(column.status),
    })),
    ...(showCanceled
      ? [
          {
            status: "Canceled" as IssueStatus,
            label: issueStatusLabel("Canceled"),
          },
        ]
      : []),
  ];
  return (
    <div className="mobile-shared-list">
      {columns.map((column) => {
        const items = issues.filter((issue) => issue.status === column.status);
        return (
          <section key={column.status}>
            <header>
              <span>{column.label}</span>
              <strong>{items.length}</strong>
            </header>
            {items.map((issue) => (
              <button
                className="mobile-agenda-row mobile-agenda-action"
                type="button"
                key={issue.id}
                onClick={() => onOpenIssue(issue.id)}
              >
                <span
                  className={`priority-dot ${priorityTone[issue.priority] ?? "none"}`}
                />
                <span>
                  <strong>{issue.title}</strong>
                  <small>
                    {issue.identifier} ·{" "}
                    {issue.assignee === "Unassigned"
                      ? t("app.unassigned", { ns: "common" })
                      : issue.assignee}
                  </small>
                </span>
                <ChevronDown size={14} />
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
