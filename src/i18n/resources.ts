import common from "./locales/pt-BR/common.json";
import auth from "./locales/pt-BR/auth.json";
import inbox from "./locales/pt-BR/inbox.json";
import issues from "./locales/pt-BR/issues.json";
import kanban from "./locales/pt-BR/kanban.json";
import knowledge from "./locales/pt-BR/knowledge.json";
import notifications from "./locales/pt-BR/notifications.json";
import projects from "./locales/pt-BR/projects.json";
import runs from "./locales/pt-BR/runs.json";
import settings from "./locales/pt-BR/settings.json";

/** Mend is an internal Diagium tool: the interface is Portuguese only. */
export const appLocale = "pt-BR";

export const resources = {
  [appLocale]: {
    common,
    auth,
    inbox,
    issues,
    kanban,
    knowledge,
    notifications,
    projects,
    runs,
    settings,
  },
} as const;
