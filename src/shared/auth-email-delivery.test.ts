import { describe, expect, it } from "vitest";
import {
  isAuthEmailDeliveryError,
  isAuthEmailDeliveryReady,
} from "./auth-email-delivery";

describe("auth email delivery", () => {
  it("is ready only when the deployment explicitly enables it", () => {
    expect(isAuthEmailDeliveryReady("1")).toBe(true);
    expect(isAuthEmailDeliveryReady("0")).toBe(false);
    expect(isAuthEmailDeliveryReady(undefined)).toBe(false);
  });

  it("recognizes confirmation delivery failures from Auth", () => {
    expect(
      isAuthEmailDeliveryError({
        code: "unexpected_failure",
        message: "Error sending confirmation email",
      }),
    ).toBe(true);
    expect(isAuthEmailDeliveryError({ code: "email_provider_disabled" })).toBe(
      true,
    );
  });

  it("does not treat normal auth or password errors as delivery failures", () => {
    expect(
      isAuthEmailDeliveryError({
        code: "invalid_grant",
        message: "Invalid login credentials",
      }),
    ).toBe(false);
    expect(
      isAuthEmailDeliveryError({
        code: "weak_password",
        message: "Password should be at least 8 characters",
      }),
    ).toBe(false);
  });
});
