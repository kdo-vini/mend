import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  applyInterfaceLanguage,
  resolveInterfaceLanguage,
  storedInterfaceLanguage,
} from "../i18n/preferences";
import type { SupportedLocale } from "../i18n/resources";

const browserEnv =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
    .env ?? {};
const localOperatorMode = Boolean(
  browserEnv.MODE === "development" &&
    browserEnv.VITE_MEND_LOCAL_OPERATOR_MODE === "1",
);
const explicitDemoMode =
  typeof window !== "undefined" &&
  (new URLSearchParams(window.location.search).get("demo") === "1" ||
    window.sessionStorage.getItem("mend.demo") === "1");

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [interfaceLanguage, setInterfaceLanguage] = useState<SupportedLocale>(
    storedInterfaceLanguage,
  );
  const { t } = useTranslation("auth");

  useEffect(() => {
    const syncStoredLanguage = () =>
      setInterfaceLanguage(storedInterfaceLanguage());
    window.addEventListener("storage", syncStoredLanguage);
    return () => window.removeEventListener("storage", syncStoredLanguage);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const hydrate = async () => {
      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      if (data.session) {
        const locale = await resolveInterfaceLanguage(client);
        if (!active) return;
        setInterfaceLanguage(locale);
      }
      setSession(data.session);
      setLoading(false);
    };
    void hydrate();
    const { data: listener } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!nextSession) {
          setSession(null);
          setLoading(false);
          return;
        }
        // Keep the current app mounted during token refreshes and other
        // authenticated events. Loading here unmounts the workspace for a
        // moment whenever the browser returns from the background.
        setSession(nextSession);
        void resolveInterfaceLanguage(client).then((locale) => {
          if (!active) return;
          setInterfaceLanguage(locale);
        });
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured || localOperatorMode || explicitDemoMode)
    return children;
  if (loading)
    return (
      <AuthShell title={t("loadingTitle")} message={t("checkingSession")} />
    );
  if (session) return children;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotice(null);
    const result =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          })
        : await supabase.auth.signUp({ email: email.trim(), password });
    if (result.error) setError(result.error.message);
    else if (authMode === "sign-up" && !result.data.session)
      setNotice(t("checkInboxConfirm"));
    else
      setNotice(authMode === "sign-up" ? t("accountCreated") : t("signedIn"));
  };

  const sendMagicLink = async () => {
    if (!supabase || !email.trim()) {
      setError(t("enterEmail"));
      return;
    }
    setError(null);
    const result = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (result.error) setError(result.error.message);
    else setNotice(t("magicLinkSent"));
  };

  return (
    <AuthShell
      title={
        authMode === "sign-in" ? t("signInTitle") : t("createAccountTitle")
      }
      message={t("authDescription")}
    >
      <form className="auth-form" onSubmit={submit}>
        <LanguageSwitcher
          value={interfaceLanguage}
          onChange={(locale) => {
            setInterfaceLanguage(locale);
            void applyInterfaceLanguage(locale);
          }}
        />
        <label>
          <span>{t("email")}</span>
          <div className="auth-input">
            <Mail size={15} />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </div>
        </label>
        <label>
          <span>{t("password")}</span>
          <div className="auth-input">
            <LockKeyhole size={15} />
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </div>
        </label>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}
        <button className="button button-primary auth-submit" type="submit">
          {authMode === "sign-in" ? t("signIn") : t("createAccount")}{" "}
          <ArrowRight size={15} />
        </button>
        {authMode === "sign-in" && (
          <button
            className="text-button auth-magic"
            type="button"
            onClick={() => void sendMagicLink()}
          >
            {t("magicLink")}
          </button>
        )}
        <button
          className="text-button auth-magic"
          type="button"
          onClick={() => {
            setAuthMode((current) =>
              current === "sign-in" ? "sign-up" : "sign-in",
            );
            setError(null);
            setNotice(null);
          }}
        >
          {authMode === "sign-in"
            ? t("createNewAccount")
            : t("alreadyHaveAccount")}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation("auth");
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <div className="brand-name">Mend</div>
            <div className="brand-subtitle">{t("supportOperations")}</div>
          </div>
        </div>
        <span className="page-kicker">{t("secureWorkspace")}</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {children}
      </div>
    </main>
  );
}
