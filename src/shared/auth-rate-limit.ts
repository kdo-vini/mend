export const AUTH_RATE_LIMIT_POLICY = {
  maxAttempts: 5,
  windowMs: 5 * 60 * 1000,
  blockMs: 5 * 60 * 1000,
} as const;

const storageKey = "mend.auth-rate-limit.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type AuthRateLimitState = {
  attempts: number;
  blockedUntil: number;
  windowStartedAt: number;
};

export type AuthRateLimitResult =
  | { allowed: true; retryAfterSeconds: 0 }
  | { allowed: false; retryAfterSeconds: number };

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emptyState(now: number): AuthRateLimitState {
  return { attempts: 0, blockedUntil: 0, windowStartedAt: now };
}

function readState(storage: StorageLike, now: number): AuthRateLimitState {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return emptyState(now);
    const parsed = JSON.parse(raw) as Partial<AuthRateLimitState>;
    if (
      typeof parsed.attempts !== "number" ||
      typeof parsed.blockedUntil !== "number" ||
      typeof parsed.windowStartedAt !== "number"
    ) {
      return emptyState(now);
    }
    return parsed as AuthRateLimitState;
  } catch {
    return emptyState(now);
  }
}

function writeState(storage: StorageLike, state: AuthRateLimitState) {
  try {
    storage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Supabase Auth remains the authoritative server-side rate limit.
  }
}

export function consumeAuthAttempt(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): AuthRateLimitResult {
  if (!storage) return { allowed: true, retryAfterSeconds: 0 };

  const state = readState(storage, now);
  if (state.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((state.blockedUntil - now) / 1000),
      ),
    };
  }

  if (now - state.windowStartedAt >= AUTH_RATE_LIMIT_POLICY.windowMs) {
    state.attempts = 0;
    state.blockedUntil = 0;
    state.windowStartedAt = now;
  }

  if (state.attempts >= AUTH_RATE_LIMIT_POLICY.maxAttempts) {
    state.blockedUntil = now + AUTH_RATE_LIMIT_POLICY.blockMs;
    writeState(storage, state);
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil(AUTH_RATE_LIMIT_POLICY.blockMs / 1000),
    };
  }

  state.attempts += 1;
  writeState(storage, state);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetAuthRateLimit(
  storage: StorageLike | null = browserStorage(),
) {
  try {
    storage?.removeItem(storageKey);
  } catch {
    // Ignore unavailable browser storage; the server limit still applies.
  }
}
