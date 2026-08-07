import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { createWorkspace } from "../../api/auth";
import { supabase } from "../../lib/supabase";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import type { SupportedLocale } from "../../i18n/resources";

export function WorkspaceOnboarding({
  onCreated,
  initialLanguage,
}: {
  onCreated: (workspace: { id: string; name: string }) => void;
  initialLanguage: SupportedLocale;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [prefix, setPrefix] = useState("MEND");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationalLanguage, setOperationalLanguage] =
    useState<SupportedLocale>(initialLanguage);
  const { t } = useTranslation(["common", "onboarding"]);

  const submit = async () => {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const workspace = await createWorkspace(
        {
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          issuePrefix: prefix.trim().toUpperCase() || "MEND",
          timezone: "America/Sao_Paulo",
          defaultLanguage: operationalLanguage,
        },
        supabase ?? undefined,
      );
      onCreated(workspace);
    } catch {
      setError(t("error", { ns: "onboarding" }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page onboarding-page">
      <div className="onboarding-card">
        <div className="brand-mark">
          <span />
        </div>
        <span className="page-kicker">{t("kicker", { ns: "onboarding" })}</span>
        <h1>{t("title", { ns: "onboarding" })}</h1>
        <p>{t("description", { ns: "onboarding" })}</p>
        <label>
          {t("workspaceName", { ns: "onboarding" })}
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Techne"
          />
        </label>
        <label>
          {t("workspaceSlug", { ns: "onboarding" })}
          <input
            value={slug}
            onChange={(event) =>
              setSlug(event.target.value.replace(/[^a-z0-9-]/g, "-"))
            }
            placeholder="techne"
          />
        </label>
        <label>
          {t("issuePrefix", { ns: "onboarding" })}
          <input
            value={prefix}
            maxLength={8}
            onChange={(event) =>
              setPrefix(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
            placeholder="MEND"
          />
        </label>
        <label>
          {t("language.label")}
          <LanguageSwitcher
            value={operationalLanguage}
            onChange={setOperationalLanguage}
          />
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button button-primary"
          type="button"
          disabled={saving || !name.trim() || !slug.trim()}
          onClick={() => void submit()}
        >
          {saving
            ? t("creating", { ns: "onboarding" })
            : t("create", { ns: "onboarding" })}{" "}
          <ArrowUp size={14} />
        </button>
        <small className="onboarding-note">
          {t("note", { ns: "onboarding" })}
        </small>
      </div>
    </div>
  );
}
