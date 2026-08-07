import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { normalizeLocale, resources } from "./resources";

const storedLocale =
  typeof window === "undefined"
    ? "pt-BR"
    : normalizeLocale(window.localStorage.getItem("mend.interface-language"));

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLocale,
  fallbackLng: "pt-BR",
  supportedLngs: ["pt-BR", "en-US"],
  defaultNS: "common",
  ns: [
    "common",
    "auth",
    "inbox",
    "issues",
    "knowledge",
    "runs",
    "settings",
    "notifications",
    "marketing",
    "onboarding",
    "kanban",
  ],
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

if (typeof document !== "undefined")
  document.documentElement.lang = storedLocale;

export default i18n;
