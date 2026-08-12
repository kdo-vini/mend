import { expect, test } from "@playwright/test";

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "e2e-owner@example.com",
  created_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};

const testSession = {
  access_token: "e2e-access-token",
  token_type: "bearer",
  expires_in: 3_600,
  expires_at: Math.floor(Date.now() / 1_000) + 3_600,
  refresh_token: "e2e-refresh-token",
  user: testUser,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("register submits the confirmation redirect and shows the next step", async ({
  page,
  baseURL,
}) => {
  let signUpPayload: Record<string, unknown> | undefined;
  let signUpRedirect: string | null = null;
  await page.route("**/auth/v1/signup**", async (route) => {
    signUpRedirect = new URL(route.request().url()).searchParams.get(
      "redirect_to",
    );
    signUpPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: testUser, session: null }),
    });
  });

  await page.goto("/?auth=1");
  await page.getByRole("button", { name: "Create a new account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();

  await expect(page.getByRole("status")).toContainText(
    "Check your inbox to confirm your email, then sign in.",
  );
  expect(signUpPayload).toMatchObject({
    email: testUser.email,
    password: "password-123",
  });
  expect(baseURL).toBeDefined();
  expect(signUpRedirect).toBe(new URL("/?auth=1", baseURL!).toString());
});

test("login creates a session and leaves the auth route for the workspace", async ({
  page,
}) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(testSession),
    });
  });
  await page.route("**/auth/v1/user**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: testUser }),
    });
  });
  await page.route("**/rest/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });

  await page.goto("/?auth=1");
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Mend" }),
  ).toHaveCount(0);
});
