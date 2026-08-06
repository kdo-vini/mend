import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signInWithGoogle as startGoogleSignIn } from "../api/auth";
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
  const [authAction, setAuthAction] = useState<"password" | "google" | null>(
    null,
  );
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
    if (!supabase || authAction) return;
    setError(null);
    setNotice(null);
    setAuthAction("password");
    try {
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
    } finally {
      setAuthAction(null);
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase || authAction) return;
    setError(null);
    setNotice(null);
    setAuthAction("google");
    try {
      const result = await startGoogleSignIn(
        typeof window === "undefined" ? undefined : window.location.origin,
        supabase,
      );
      if (result.error) {
        setError(result.error.message);
        setAuthAction(null);
      }
    } catch (googleError) {
      setError(
        googleError instanceof Error
          ? googleError.message
          : t("googleSignInError"),
      );
      setAuthAction(null);
    }
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
        <button
          className="button button-ghost auth-google"
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={authAction !== null}
        >
          <GoogleMark />
          {authAction === "google"
            ? t("connectingGoogle")
            : t("continueWithGoogle")}
        </button>
        <div className="auth-divider" aria-hidden="true">
          <span>{t("orContinueWith")}</span>
        </div>
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
        <button
          className="button button-primary auth-submit"
          type="submit"
          disabled={authAction !== null}
        >
          {authMode === "sign-in" ? t("signIn") : t("createAccount")}{" "}
          <ArrowRight size={15} />
        </button>
        {authMode === "sign-in" && (
          <button
            className="text-button auth-magic"
            type="button"
            onClick={() => void sendMagicLink()}
            disabled={authAction !== null}
          >
            {t("magicLink")}
          </button>
        )}
        <button
          className="text-button auth-magic"
          type="button"
          disabled={authAction !== null}
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

function GoogleMark() {
  return (
    <svg
      className="auth-google-mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.68-.06-1.34-.18-1.97H12v3.73h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.15Z"
      />
      <path
        fill="#34A853"
        d="M12 21.6c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.6Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.68A5.86 5.86 0 0 1 6.23 12c0-.58.1-1.15.31-1.68V7.79H3.3A9.6 9.6 0 0 0 2.27 12c0 1.52.36 2.96 1.03 4.21l3.24-2.53Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.29c1.43 0 2.71.49 3.72 1.46l2.79-2.79C16.84 3.39 14.63 2.4 12 2.4a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03Z"
      />
    </svg>
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
