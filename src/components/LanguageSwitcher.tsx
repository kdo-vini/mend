import { useTranslation } from "react-i18next";
import { normalizeLocale, type SupportedLocale } from "../i18n/resources";

export function LanguageSwitcher({
  value,
  onChange,
  disabled = false,
}: {
  value: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <label className="language-switcher">
      {t("language.label")}
      <select
        value={normalizeLocale(value)}
        disabled={disabled}
        onChange={(event) => onChange(normalizeLocale(event.target.value))}
      >
        <option value="pt-BR">{t("language.portuguese")}</option>
        <option value="en-US">{t("language.english")}</option>
      </select>
    </label>
  );
}
