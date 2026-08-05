import crypto from "node:crypto";

export const googleCalendarScopes = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

export interface GoogleCalendarSummary {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  timeZone?: string;
}

export interface GoogleConnectionRecord {
  id: string;
  workspaceId: string;
  googleAccountId: string;
  accountEmail: string | null;
  accountName: string | null;
  status: "connected" | "error" | "disconnected";
  scopes: string[];
  calendars: GoogleCalendarSummary[];
  selectedCalendarIds: string[];
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleConnectionPort {
  list(context: {
    workspaceId: string;
    userId?: string;
  }): Promise<GoogleConnectionRecord[]>;
  startOAuth(context: {
    workspaceId: string;
    userId: string;
  }): Promise<{ oauthUrl: string }>;
  completeOAuth(code: string, state: string): Promise<GoogleConnectionRecord>;
  updateCalendars(
    context: { workspaceId: string; userId?: string },
    connectionId: string,
    selectedCalendarIds: string[],
  ): Promise<GoogleConnectionRecord | null>;
  disconnect(
    context: { workspaceId: string; userId?: string },
    connectionId: string,
  ): Promise<GoogleConnectionRecord | null>;
}

export class GoogleConnectionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleConnectionError";
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEncryptionKey: string;
}

export function readGoogleOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  const tokenEncryptionKey = env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !tokenEncryptionKey)
    return null;
  return { clientId, clientSecret, redirectUri, tokenEncryptionKey };
}

export function requireGoogleOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleOAuthConfig {
  const config = readGoogleOAuthConfig(env);
  if (!config)
    throw new GoogleConnectionError(
      503,
      "google_oauth_not_configured",
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_TOKEN_ENCRYPTION_KEY on the server.",
    );
  return config;
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function stateSignature(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

export function createGoogleOAuthState(
  workspaceId: string,
  userId: string,
  secret: string,
  expiresAt = Date.now() + 10 * 60_000,
): { state: string; expiresAt: string } {
  const payload = base64Url(JSON.stringify({ workspaceId, userId, expiresAt }));
  return {
    state: `${payload}.${stateSignature(payload, secret)}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function verifyGoogleOAuthState(
  state: string,
  secret: string,
): { workspaceId: string; userId: string; expiresAt: string } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature)
    throw new GoogleConnectionError(
      400,
      "google_oauth_state_invalid",
      "Google OAuth state is invalid.",
    );
  const expected = stateSignature(payload, secret);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right))
    throw new GoogleConnectionError(
      400,
      "google_oauth_state_invalid",
      "Google OAuth state is invalid.",
    );
  try {
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      typeof value.workspaceId !== "string" ||
      typeof value.userId !== "string" ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now()
    )
      throw new Error("expired");
    return {
      workspaceId: value.workspaceId,
      userId: value.userId,
      expiresAt: new Date(value.expiresAt).toISOString(),
    };
  } catch {
    throw new GoogleConnectionError(
      400,
      "google_oauth_state_invalid",
      "Google OAuth state is invalid or expired.",
    );
  }
}

export function hashGoogleOAuthState(state: string): string {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export function encryptGoogleToken(value: string, secret: string): string {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    base64Url(iv),
    base64Url(cipher.getAuthTag()),
    base64Url(ciphertext),
  ].join(".");
}

export function decryptGoogleToken(value: string, secret: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue)
    throw new Error("invalid_google_token_ciphertext");
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function googleAuthorizationUrl(
  config: GoogleOAuthConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: googleCalendarScopes.join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
