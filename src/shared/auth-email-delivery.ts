export type AuthEmailError = {
  code?: string;
  message?: string;
};

/**
 * This is a deployment readiness flag, not a security boundary. It is set to
 * 1 only after Supabase Auth is connected to a verified Resend SMTP sender.
 */
export function isAuthEmailDeliveryReady(value: string | undefined): boolean {
  return value?.trim() === "1";
}

export function isAuthEmailDeliveryError(
  error: AuthEmailError | null,
): boolean {
  if (!error) return false;
  const code = error.code?.toLowerCase() ?? "";
  const message = error.message?.toLowerCase() ?? "";
  const signal = `${code} ${message}`;

  if (code === "weak_password" || code === "invalid_grant") return false;
  if (code === "email_provider_disabled" || code === "email_delivery_failed")
    return true;

  return (
    /email|e-mail|smtp|mailer|confirmation/.test(signal) &&
    /send|deliver|provider|smtp|mailer|confirmation|delivery/.test(signal)
  );
}
