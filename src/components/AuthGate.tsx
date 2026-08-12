import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  acceptWorkspaceInvitation,
  sendMagicLink as sendMagicLinkRequest,
  signInWithGoogle as startGoogleSignIn,
  signUpWithPassword,
  updatePassword,
} from "../api/auth";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { BrandMark } from "./BrandLockup";
import { LandingPage } from "../features/marketing/LandingPage";
import { resolveInterfaceLanguage } from "../i18n/preferences";
import {
  consumeAuthAttempt,
  resetAuthRateLimit,
} from "../shared/auth-rate-limit";
import {
  isGmailAddress,
  validateSignupEmail,
} from "../shared/email-validation";

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

const authCallbackKeys = [
  "access_token",
  "refresh_token",
  "code",
  "error",
  "error_code",
  "error_description",
  "token_hash",
  "type",
] as const;

function authRedirectUrl() {
  if (typeof window === "undefined") return undefined;
  return new URL("/?auth=1", window.location.origin).toString();
}

function hasAuthCallback() {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  if (url.hash === "#") return true;
  const hashParams = new URLSearchParams(url.hash.slice(1));
  return authCallbackKeys.some(
    (key) => url.searchParams.has(key) || hashParams.has(key),
  );
}

function isAuthRateLimitError(
  error: { message?: string; status?: number } | null,
) {
  if (!error) return false;
  return (
    error.status === 429 ||
    /rate[ -]?limit|too many|over[ _-]?rate/i.test(error.message ?? "")
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authAction, setAuthAction] = useState<"password" | "google" | null>(
    null,
  );
  const [credentialsInvalid, setCredentialsInvalid] = useState(false);
  const [emailInvalid, setEmailInvalid] = useState(false);
  const [passwordInvalid, setPasswordInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGmailShortcut, setShowGmailShortcut] = useState(false);
  const { t } = useTranslation("auth");
  const invitePath =
    typeof window !== "undefined" &&
    window.location.pathname === "/accept-invite";
  const invitationId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("invitation")
      : null;
  const authRequested =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("auth") === "1";
  const authCallbackPresent = hasAuthCallback();
  const authRouteRequested = authRequested || authCallbackPresent;
  const publicLanding =
    typeof window !== "undefined" &&
    window.location.pathname === "/" &&
    !authRouteRequested;

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    const hydrate = async () => {
      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) setError(i18n.t("sessionError", { ns: "auth" }));
      if (data.session) {
        await resolveInterfaceLanguage(client);
        if (!active) return;
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
        void resolveInterfaceLanguage(client);
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
  if (loading && !authRouteRequested)
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
        <div className="auth-feedback-slot" aria-live="polite">
          <p className="auth-error" role="alert">
            {invitationId ? t("inviteSessionExpired") : t("inviteLinkInvalid")}
          </p>
        </div>
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
    setCredentialsInvalid(false);
    setEmailInvalid(false);
    setPasswordInvalid(false);
    setShowGmailShortcut(false);

    const emailValidation = validateSignupEmail(email);
    if (!emailValidation.valid) {
      setEmailInvalid(true);
      setError(
        t(
          emailValidation.reason === "disposable" && authMode === "sign-up"
            ? "disposableEmail"
            : "invalidEmail",
        ),
      );
      return;
    }
    if (!password) {
      setPasswordInvalid(true);
      setError(t("enterPassword"));
      return;
    }

    const rateLimit = consumeAuthAttempt();
    if (!rateLimit.allowed) {
      setError(t("rateLimitError"));
      return;
    }

    setAuthAction("password");
    try {
      const result =
        authMode === "sign-in"
          ? await supabase.auth.signInWithPassword({
              email: email.trim(),
              password,
            })
          : await signUpWithPassword(
              email,
              password,
              authRedirectUrl(),
              supabase,
            );
      if (result.error) {
        const rateLimited = isAuthRateLimitError(result.error);
        setCredentialsInvalid(!rateLimited);
        setError(
          t(
            rateLimited
              ? "rateLimitError"
              : authMode === "sign-in"
                ? "authError"
                : "signUpError",
          ),
        );
      } else if (authMode === "sign-up" && !result.data.session) {
        setNotice(t("checkInboxConfirm"));
        setShowGmailShortcut(isGmailAddress(email));
      } else {
        resetAuthRateLimit();
        setNotice(authMode === "sign-up" ? t("accountCreated") : t("signedIn"));
      }
    } finally {
      setAuthAction(null);
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase || authAction) return;
    setError(null);
    setNotice(null);
    setCredentialsInvalid(false);
    setEmailInvalid(false);
    setPasswordInvalid(false);
    setShowGmailShortcut(false);
    setAuthAction("google");
    try {
      const result = await startGoogleSignIn(authRedirectUrl(), supabase);
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
    setCredentialsInvalid(false);
    setEmailInvalid(false);
    setPasswordInvalid(false);
    setShowGmailShortcut(false);
    if (!supabase || !email.trim()) {
      setError(t("enterEmail"));
      return;
    }
    setError(null);
    const result = await sendMagicLinkRequest(
      email,
      authRedirectUrl(),
      supabase,
    );
    if (result.error) setError(t("magicLinkError"));
    else setNotice(t("magicLinkSent"));
  };

  return (
    <AuthShell
      className="auth-card-primary"
      shellClassName="auth-shell-primary"
      title={
        authMode === "sign-in" ? t("signInTitle") : t("createAccountTitle")
      }
      message={t("authDescription")}
    >
      <form
        className="auth-form auth-mode-content"
        data-mode={authMode}
        noValidate
        onSubmit={submit}
      >
        <div
          className="auth-mode-toggle"
          role="tablist"
          aria-label={t("authModeLabel")}
        >
          <button
            className={authMode === "sign-in" ? "is-active" : undefined}
            type="button"
            role="tab"
            aria-selected={authMode === "sign-in"}
            onClick={() => {
              setAuthMode("sign-in");
              setShowPassword(false);
              setCredentialsInvalid(false);
              setEmailInvalid(false);
              setPasswordInvalid(false);
              setError(null);
              setNotice(null);
              setShowGmailShortcut(false);
            }}
            disabled={authAction !== null}
          >
            {t("signIn")}
          </button>
          <button
            className={authMode === "sign-up" ? "is-active" : undefined}
            type="button"
            role="tab"
            aria-selected={authMode === "sign-up"}
            onClick={() => {
              setAuthMode("sign-up");
              setShowPassword(false);
              setCredentialsInvalid(false);
              setEmailInvalid(false);
              setPasswordInvalid(false);
              setError(null);
              setNotice(null);
              setShowGmailShortcut(false);
            }}
            disabled={authAction !== null}
          >
            {t("createAccount")}
          </button>
        </div>
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
        <label
          className={
            credentialsInvalid || emailInvalid
              ? "auth-label-invalid"
              : undefined
          }
        >
          <span>{t("email")}</span>
          <div
            className={`auth-input${credentialsInvalid || emailInvalid ? " auth-input-invalid" : ""}`}
          >
            <Mail size={15} />
            <input
              type="email"
              autoComplete="email"
              required
              aria-invalid={credentialsInvalid || emailInvalid}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setShowGmailShortcut(false);
                if (credentialsInvalid || emailInvalid) {
                  setCredentialsInvalid(false);
                  setEmailInvalid(false);
                  setError(null);
                }
              }}
              placeholder="you@company.com"
            />
          </div>
        </label>
        <label
          className={
            credentialsInvalid || passwordInvalid
              ? "auth-label-invalid"
              : undefined
          }
        >
          <span>{t("password")}</span>
          <div
            className={`auth-input${credentialsInvalid || passwordInvalid ? " auth-input-invalid" : ""}`}
          >
            <LockKeyhole size={15} />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete={
                authMode === "sign-in" ? "current-password" : "new-password"
              }
              required
              aria-invalid={credentialsInvalid || passwordInvalid}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (credentialsInvalid || passwordInvalid) {
                  setCredentialsInvalid(false);
                  setPasswordInvalid(false);
                  setError(null);
                }
              }}
              placeholder="••••••••"
            />
            <button
              className="auth-password-toggle"
              type="button"
              aria-label={t(showPassword ? "hidePassword" : "showPassword")}
              title={t(showPassword ? "hidePassword" : "showPassword")}
              aria-pressed={showPassword}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </label>
        <button
          className="button button-primary auth-submit"
          type="submit"
          disabled={authAction !== null}
        >
          {authMode === "sign-in" ? t("signIn") : t("createAccount")}{" "}
          <ArrowRight size={15} />
        </button>
        <div className="auth-magic-slot">
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
        </div>
      </form>
      <div className="auth-feedback-slot" aria-live="polite">
        {error && (
          <div className="auth-error" role="alert">
            <span>{error}</span>
            {credentialsInvalid && authMode === "sign-in" && (
              <span className="auth-error-prompt">
                {t("noAccount")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("sign-up");
                    setShowPassword(false);
                    setCredentialsInvalid(false);
                    setEmailInvalid(false);
                    setPasswordInvalid(false);
                    setError(null);
                    setNotice(null);
                    setShowGmailShortcut(false);
                  }}
                >
                  {t("createAccountPrompt")}
                </button>
              </span>
            )}
          </div>
        )}
        {notice && (
          <div className="auth-notice" role="status">
            <span>{notice}</span>
            {showGmailShortcut && (
              <button
                className="auth-toast-action"
                type="button"
                onClick={() =>
                  window.open(
                    "https://mail.google.com/",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                {t("openGmail")}
              </button>
            )}
          </div>
        )}
      </div>
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
        <Button className="auth-submit" type="submit" disabled={action}>
          {action ? t("acceptingInvite") : t("acceptInvite")}{" "}
          <ArrowRight size={15} />
        </Button>
      </form>
      <div className="auth-feedback-slot" aria-live="polite">
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </div>
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
  className,
  shellClassName,
}: {
  title: string;
  message: string;
  children?: ReactNode;
  className?: string;
  shellClassName?: string;
}) {
  const { t } = useTranslation("auth");
  return (
    <main className={`auth-shell${shellClassName ? ` ${shellClassName}` : ""}`}>
      <div className="auth-context">
        <span className="landing-signal">
          <span /> {t("contextSignal")}
        </span>
        <h2>{t("contextTitle")}</h2>
        <p>{t("contextDescription")}</p>
      </div>
      <div className={`auth-card${className ? ` ${className}` : ""}`}>
        <div className="brand-row auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">{t("brandName")}</div>
            <div className="brand-subtitle">{t("supportDescriptor")}</div>
          </div>
        </div>
        <h1 key={title}>{title}</h1>
        <p>{message}</p>
        {children}
      </div>
    </main>
  );
}
