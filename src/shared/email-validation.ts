const disposableEmailDomains = [
  "10minutemail.com",
  "33mail.com",
  "crazymailing.com",
  "dispostable.com",
  "dropmail.me",
  "emailfake.com",
  "emailondeck.com",
  "emailtemporanea.net",
  "fakeinbox.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "inboxbear.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mintemail.com",
  "moakt.com",
  "mytemp.email",
  "one-time.email",
  "sharklasers.com",
  "tempmail.com",
  "tempmailo.com",
  "temp-mail.org",
  "tempinbox.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
] as const;

/**
 * This list catches common disposable providers; it cannot prove that a
 * mailbox exists. Supabase confirmation remains the source of truth.
 */
export const DISPOSABLE_EMAIL_DOMAINS = new Set<string>(disposableEmailDomains);

export type SignupEmailValidation =
  | { valid: true; domain: string }
  | { valid: false; reason: "invalid" | "disposable" };

export function validateSignupEmail(value: string): SignupEmailValidation {
  const normalized = value.trim().toLowerCase();
  const [localPart, domain, ...extraParts] = normalized.split("@");
  const validDomain =
    typeof domain === "string" &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain);
  if (
    !localPart ||
    !domain ||
    extraParts.length > 0 ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    /\s/.test(localPart) ||
    !validDomain
  )
    return { valid: false, reason: "invalid" };

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain))
    return { valid: false, reason: "disposable" };

  return { valid: true, domain };
}

export function isGmailAddress(value: string): boolean {
  const domain = value.trim().toLowerCase().split("@").at(-1);
  return domain === "gmail.com" || domain === "googlemail.com";
}
