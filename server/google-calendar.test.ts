import { describe, expect, it } from "vitest";
import {
  createGoogleOAuthState,
  decryptGoogleToken,
  encryptGoogleToken,
  googleAuthorizationUrl,
  readGoogleOAuthConfig,
  verifyGoogleOAuthState,
} from "./google-calendar.js";

describe("Google workspace connections", () => {
  it("does not claim OAuth is configured when a server secret is missing", () => {
    expect(
      readGoogleOAuthConfig({
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_OAUTH_REDIRECT_URI:
          "https://mend.test/api/google/connections/oauth/callback",
      }),
    ).toBeNull();
  });

  it("signs and verifies one-time OAuth state payloads without exposing secrets", () => {
    const { state } = createGoogleOAuthState(
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "state-secret",
    );
    expect(verifyGoogleOAuthState(state, "state-secret")).toMatchObject({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    });
    expect(() => verifyGoogleOAuthState(`${state}x`, "state-secret")).toThrow(
      "state is invalid",
    );
  });

  it("builds a calendar-read OAuth URL and encrypts tokens server-side", () => {
    const config = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://mend.test/api/google/connections/oauth/callback",
      tokenEncryptionKey: "encryption-key",
    };
    const url = googleAuthorizationUrl(config, "signed-state");
    expect(url).toContain("calendar.readonly");
    expect(url).toContain("state=signed-state");
    expect(url).not.toContain("client-secret");
    const encrypted = encryptGoogleToken(
      "refresh-token",
      config.tokenEncryptionKey,
    );
    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(encrypted).not.toContain("refresh-token");
    expect(decryptGoogleToken(encrypted, config.tokenEncryptionKey)).toBe(
      "refresh-token",
    );
  });
});
