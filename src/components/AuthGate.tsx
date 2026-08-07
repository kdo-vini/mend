import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  acceptWorkspaceInvitation,
  signInWithGoogle as startGoogleSignIn,
  updatePassword,
} from "../api/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { BrandMark } from "./BrandLockup";
import { LandingPage } from "../features/marketing/LandingPage";
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
  const invitePath =
    typeof window !== "undefined" &&
    window.location.pathname === "/accept-invite";
  const invitationId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invitation")
      : null;
  const publicLanding =
    typeof window !== "undefined" &&
    window.location.pathname === "/" &&
    new URLSearchParams(window.location.search).get("auth") !== "1";
  const authRequested =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("auth") === "1";

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
      if (sessionError) setError(i18n.t("authError", { ns: "auth" }));
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

  // The public landing has no dependency on session hydration. Render it
  // immediately so a slow auth check never flashes a loading shell on "/".
  if (publicLanding) return <LandingPage />;
  if (!isSupabaseConfigured || localOperatorMode || explicitDemoMode)
    return children;
  // The explicit auth route must show the sign-in form even if Supabase's
  // session probe is slow or unavailable. The probe still runs in the
  // background and will swap in the workspace when it finds a session.
  if (loading && !authRequested)
    return (
      <AuthShell title={t("loadingTitle")} message={t("checkingSession")} />
    );
  if (session)
    return invitePath ? (
      <InviteAcceptance invitationId={invitationId} />
    ) : (
      children
    );

  if (invitePath)
    return (
      <AuthShell
        title={t("inviteSessionTitle")}
        message={t("inviteSessionRequired")}
      >
        <p className="auth-error" role="alert">
          {invitationId ? t("inviteSessionExpired") : t("inviteLinkInvalid")}
        </p>
        <Button
          className="auth-submit"
          type="button"
          onClick={() => window.location.replace("/")}
        >
          {t("backToSignIn")} <ArrowRight size={15} />
        </Button>
      </AuthShell>
    );

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
      if (result.error) setError(t("authError"));
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
        setError(t("googleSignInError"));
        setAuthAction(null);
      }
    } catch {
      setError(t("googleSignInError"));
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
    if (result.error) setError(t("authError"));
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

function InviteAcceptance({ invitationId }: { invitationId: string | null }) {
  const { t } = useTranslation("auth");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [action, setAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (action) return;
    if (!invitationId) {
      setError(t("inviteLinkInvalid"));
      return;
    }
    if (password.length < 8) {
      setError(t("invitePasswordTooShort"));
      return;
    }
    if (password !== confirmation) {
      setError(t("invitePasswordsMismatch"));
      return;
    }
    if (!supabase) {
      setError(t("inviteUnavailable"));
      return;
    }
    setAction(true);
    setError(null);
    try {
      const passwordResult = await updatePassword(password, supabase);
      if (passwordResult.error) throw new Error(passwordResult.error.message);
      await acceptWorkspaceInvitation(invitationId, supabase);
      window.location.replace("/inbox");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      const normalized = message.toLowerCase();
      if (normalized.includes("expired")) setError(t("inviteExpired"));
      else if (normalized.includes("revoked")) setError(t("inviteRevoked"));
      else if (normalized.includes("accepted"))
        setError(t("inviteAlreadyAccepted"));
      else if (normalized.includes("email")) setError(t("inviteEmailMismatch"));
      else setError(t("inviteAcceptError"));
    } finally {
      setAction(false);
    }
  };

  return (
    <AuthShell title={t("inviteTitle")} message={t("inviteDescription")}>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <div className="auth-form-field">
          <Label htmlFor="invite-password">{t("newPassword")}</Label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="auth-form-field">
          <Label htmlFor="invite-password-confirm">
            {t("confirmPassword")}
          </Label>
          <Input
            id="invite-password-confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </div>
        <p className="auth-hint">{t("invitePasswordHint")}</p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <Button className="auth-submit" type="submit" disabled={action}>
          {action ? t("acceptingInvite") : t("acceptInvite")}{" "}
          <ArrowRight size={15} />
        </Button>
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
      <div className="auth-context">
        <span className="landing-signal">
          <span /> {t("contextSignal")}
        </span>
        <h2>{t("contextTitle")}</h2>
        <p>{t("contextDescription")}</p>
        <div className="auth-context-flow" aria-hidden="true">
          <span>{t("channelWhatsApp")}</span>
          <i>→</i>
          <span>{t("contextIssue")}</span>
          <i>→</i>
          <span>{t("contextShip")}</span>
        </div>
      </div>
      <div className="auth-card">
        <div className="brand-row auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">{t("brandName")}</div>
            <div className="brand-subtitle">{t("supportDescriptor")}</div>
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
