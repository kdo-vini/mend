import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMIT_POLICY,
  consumeAuthAttempt,
  resetAuthRateLimit,
} from "./auth-rate-limit";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("auth rate limit", () => {
  it("allows the safe burst, then blocks further attempts", () => {
    const storage = memoryStorage();
    const now = 1_000_000;

    for (
      let attempt = 0;
      attempt < AUTH_RATE_LIMIT_POLICY.maxAttempts;
      attempt += 1
    ) {
      expect(consumeAuthAttempt(storage, now)).toEqual({
        allowed: true,
        retryAfterSeconds: 0,
      });
    }

    expect(consumeAuthAttempt(storage, now)).toMatchObject({
      allowed: false,
    });
  });

  it("opens again after the rolling window expires", () => {
    const storage = memoryStorage();
    const now = 1_000_000;

    for (
      let attempt = 0;
      attempt <= AUTH_RATE_LIMIT_POLICY.maxAttempts;
      attempt += 1
    ) {
      consumeAuthAttempt(storage, now);
    }

    expect(
      consumeAuthAttempt(storage, now + AUTH_RATE_LIMIT_POLICY.blockMs + 1),
    ).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("can be reset after a trusted session boundary", () => {
    const storage = memoryStorage();
    consumeAuthAttempt(storage, 1_000_000);
    resetAuthRateLimit(storage);

    expect(consumeAuthAttempt(storage, 1_000_001)).toEqual({
      allowed: true,
      retryAfterSeconds: 0,
    });
  });
});
