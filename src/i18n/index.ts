import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { appLocale, resources } from "./resources";

void i18n.use(initReactI18next).init({
  resources,
  lng: appLocale,
  fallbackLng: appLocale,
  supportedLngs: [appLocale],
  defaultNS: "common",
  ns: Object.keys(resources[appLocale]),
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

if (typeof document !== "undefined") document.documentElement.lang = appLocale;

export default i18n;
