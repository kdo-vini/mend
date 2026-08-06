import commonEn from "./locales/en-US/common.json";
import authEn from "./locales/en-US/auth.json";
import inboxEn from "./locales/en-US/inbox.json";
import issuesEn from "./locales/en-US/issues.json";
import knowledgeEn from "./locales/en-US/knowledge.json";
import settingsEn from "./locales/en-US/settings.json";
import notificationsEn from "./locales/en-US/notifications.json";
import runsEn from "./locales/en-US/runs.json";
import marketingEn from "./locales/en-US/marketing.json";
import onboardingEn from "./locales/en-US/onboarding.json";
import kanbanEn from "./locales/en-US/kanban.json";
import commonPt from "./locales/pt-BR/common.json";
import authPt from "./locales/pt-BR/auth.json";
import inboxPt from "./locales/pt-BR/inbox.json";
import issuesPt from "./locales/pt-BR/issues.json";
import knowledgePt from "./locales/pt-BR/knowledge.json";
import settingsPt from "./locales/pt-BR/settings.json";
import notificationsPt from "./locales/pt-BR/notifications.json";
import runsPt from "./locales/pt-BR/runs.json";
import marketingPt from "./locales/pt-BR/marketing.json";
import onboardingPt from "./locales/pt-BR/onboarding.json";
import kanbanPt from "./locales/pt-BR/kanban.json";

export const resources = {
  "en-US": {
    common: commonEn,
    auth: authEn,
    inbox: inboxEn,
    issues: issuesEn,
    knowledge: knowledgeEn,
    settings: settingsEn,
    notifications: notificationsEn,
    runs: runsEn,
    marketing: marketingEn,
    onboarding: onboardingEn,
    kanban: kanbanEn,
  },
  "pt-BR": {
    common: commonPt,
    auth: authPt,
    inbox: inboxPt,
    issues: issuesPt,
    knowledge: knowledgePt,
    settings: settingsPt,
    notifications: notificationsPt,
    runs: runsPt,
    marketing: marketingPt,
    onboarding: onboardingPt,
    kanban: kanbanPt,
  },
} as const;

export type SupportedLocale = keyof typeof resources;
export const supportedLocales = [
  "en-US",
  "pt-BR",
] as const satisfies readonly SupportedLocale[];

export function normalizeLocale(value: unknown): SupportedLocale {
  return String(value ?? "").toLowerCase() === "pt-br" ||
    String(value ?? "").toLowerCase() === "pt"
    ? "pt-BR"
    : "en-US";
}
