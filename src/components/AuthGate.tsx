import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

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

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setLoading(false);
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
      <AuthShell
        title="Loading secure workspace"
        message="Checking your Mend session…"
      />
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
      setNotice("Check your inbox to confirm your email, then sign in.");
    else
      setNotice(
        authMode === "sign-up"
          ? "Account created. Loading your workspace…"
          : "Signed in. Loading your workspace…",
      );
  };

  const sendMagicLink = async () => {
    if (!supabase || !email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    const result = await supabase.auth.signInWithOtp({ email: email.trim() });
    if (result.error) setError(result.error.message);
    else setNotice("Check your inbox for a secure sign-in link.");
  };

  return (
    <AuthShell
      title={
        authMode === "sign-in" ? "Sign in to Mend" : "Create your Mend account"
      }
      message="Your workspace data is protected by Supabase Auth and workspace membership."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          <span>Email</span>
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
          <span>Password</span>
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
          {authMode === "sign-in" ? "Sign in" : "Create account"}{" "}
          <ArrowRight size={15} />
        </button>
        {authMode === "sign-in" && (
          <button
            className="text-button auth-magic"
            type="button"
            onClick={() => void sendMagicLink()}
          >
            Send me a magic link
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
            ? "Create a new account"
            : "Already have an account? Sign in"}
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
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand-row auth-brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <div className="brand-name">Mend</div>
            <div className="brand-subtitle">support operations</div>
          </div>
        </div>
        <span className="page-kicker">Secure workspace</span>
        <h1>{title}</h1>
        <p>{message}</p>
        {children}
      </div>
    </main>
  );
}
