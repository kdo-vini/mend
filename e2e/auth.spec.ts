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
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.locator(".auth-submit").click();

  await expect(page.getByRole("status")).toContainText(
    "Check your email to confirm, then come back to sign in.",
  );
  expect(signUpPayload).toMatchObject({
    email: testUser.email,
    password: "password-123",
  });
  expect(baseURL).toBeDefined();
  expect(signUpRedirect).toBe(new URL("/?auth=1", baseURL!).toString());
});

test("register rejects disposable email addresses before calling Auth", async ({
  page,
}) => {
  let signUpCalled = false;
  await page.route("**/auth/v1/signup**", async (route) => {
    signUpCalled = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: testUser, session: null }),
    });
  });

  await page.goto("/?auth=1");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page
    .getByRole("textbox", { name: "Email" })
    .fill("founder@mailinator.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.locator(".auth-submit").click();

  await expect(page.getByRole("alert")).toContainText(
    "Use a permanent email address to create your account.",
  );
  await expect(page.locator(".auth-input-invalid")).toHaveCount(1);
  expect(signUpCalled).toBe(false);
});

test("password auth shows a clear message for malformed email", async ({
  page,
}) => {
  let tokenCalled = false;
  await page.route("**/auth/v1/token**", async (route) => {
    tokenCalled = true;
    await route.continue();
  });

  await page.goto("/?auth=1");
  await page.getByRole("textbox", { name: "Email" }).fill("founder@company");
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Enter a valid email address.",
  );
  await expect(page.locator(".auth-input-invalid")).toHaveCount(1);
  expect(tokenCalled).toBe(false);
});

test("Gmail signup offers a direct inbox shortcut", async ({ page }) => {
  await page.route("**/auth/v1/signup**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: testUser, session: null }),
    });
  });

  await page.goto("/?auth=1");
  await page.getByRole("tab", { name: "Create account" }).click();
  await page.getByRole("textbox", { name: "Email" }).fill("founder@gmail.com");
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.locator(".auth-submit").click();

  await expect(page.getByRole("status")).toContainText(
    "Check your email to confirm, then come back to sign in.",
  );
  await expect(
    page.getByRole("button", { name: "Open Gmail", exact: true }),
  ).toBeVisible();
});

test("password auth stops repeated attempts before the provider call", async ({
  page,
}) => {
  let tokenCalls = 0;
  await page.route("**/auth/v1/token**", async (route) => {
    tokenCalls += 1;
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
    });
  });

  await page.goto("/?auth=1");
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.locator(".auth-submit").click();
    await expect(page.locator(".auth-submit")).toBeEnabled();
  }

  await expect(page.getByRole("alert")).toContainText(
    "Too many attempts in a short time.",
  );
  expect(tokenCalls).toBe(5);
});

test("mobile auth uses a full-screen card for both account modes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?auth=1");

  await expect(page.locator(".auth-context")).toBeHidden();
  const card = page.locator(".auth-card-primary");
  const signInRect = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const signInOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );

  await page.getByRole("tab", { name: "Create account" }).click();
  const signUpRect = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });

  expect(signInRect).toEqual({ width: 390, height: 844 });
  expect(signUpRect).toEqual(signInRect);
  expect(signInOverflow).toBe(false);
});

test("auth errors stay soft and inside the mobile frame", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
    });
  });

  await page.goto("/?auth=1");
  const card = page.locator(".auth-card-primary");
  const before = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  await expect(page.getByRole("alert")).toContainText(
    "Incorrect email or password.",
  );
  await expect(page.locator(".auth-input-invalid")).toHaveCount(2);
  await expect(page.locator(".auth-feedback-slot .auth-error")).toContainText(
    "Don't have an account?",
  );
  await expect(
    page
      .locator(".auth-feedback-slot")
      .getByRole("button", { name: "Create your account", exact: true }),
  ).toBeVisible();
  const after = await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  const mobileAuthGeometry = await page.evaluate(() => {
    const cardRect = document
      .querySelector(".auth-card-primary")
      ?.getBoundingClientRect();
    const submitRect = document
      .querySelector(".auth-submit")
      ?.getBoundingClientRect();
    const magicRect = document
      .querySelector(".auth-magic")
      ?.getBoundingClientRect();
    const feedback = document.querySelector(".auth-feedback-slot");
    return {
      cardBottom: cardRect?.bottom,
      submitBottom: submitRect?.bottom,
      magicBottom: magicRect?.bottom,
      feedbackPosition: feedback ? getComputedStyle(feedback).position : null,
      overflow: document.documentElement.scrollHeight > window.innerHeight,
    };
  });

  expect(after).toEqual(before);
  expect(mobileAuthGeometry.submitBottom).toBeLessThanOrEqual(
    mobileAuthGeometry.cardBottom ?? 0,
  );
  expect(mobileAuthGeometry.magicBottom).toBeLessThanOrEqual(
    mobileAuthGeometry.cardBottom ?? 0,
  );
  expect(mobileAuthGeometry.feedbackPosition).toBe("fixed");
  expect(mobileAuthGeometry.overflow).toBe(false);
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
