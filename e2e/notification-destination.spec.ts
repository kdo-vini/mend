import { expect, test, type Page } from "@playwright/test";

const testUser = {
  id: "33333333-3333-4333-8333-333333333333",
  aud: "authenticated",
  role: "authenticated",
  email: "alerts-owner@example.com",
  created_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};

const testSession = {
  access_token: "alerts-e2e-access-token",
  token_type: "bearer",
  expires_in: 3_600,
  expires_at: Math.floor(Date.now() / 1_000) + 3_600,
  refresh_token: "alerts-e2e-refresh-token",
  user: testUser,
};

const liveWorkspace = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Alerts QA",
  slug: "alerts-qa",
  issue_prefix: "AQA",
  next_issue_number: 9,
  timezone: "America/Sao_Paulo",
  default_language: "en-US",
  ai_policy_json: {},
  github_connected_at: null,
  github_installation_id: null,
  github_owner: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const liveIssue = {
  id: "55555555-5555-4555-8555-555555555555",
  workspace_id: liveWorkspace.id,
  identifier: "AQA-8",
  number: 8,
  title: "Checkout stalls on the last order",
  type: "bug",
  status: "in_progress",
  priority: "urgent",
  source: "conversation",
  created_by: "operator",
  created_by_user_id: testUser.id,
  assigned_user_id: null,
  contact_id: null,
  conversation_id: null,
  description: "Reported by the founder from the shop floor.",
  ai_summary: "Checkout stalls on the last order of the shift.",
  impact: "The shop cannot close the register.",
  kanban_position: 1,
  reproduction_steps_json: [],
  confidence: null,
  actual_behavior: null,
  affected_environment: null,
  affected_product: null,
  completed_at: null,
  customer_notified_at: null,
  due_on: null,
  duplicate_of_issue_id: null,
  expected_behavior: null,
  parent_issue_id: null,
  resolved_at: null,
  created_at: "2026-08-13T12:00:00.000Z",
  updated_at: "2026-08-13T12:30:00.000Z",
};

const issueNotification = {
  id: "66666666-6666-4666-8666-666666666666",
  workspace_id: liveWorkspace.id,
  user_id: testUser.id,
  kind: "issue_updated",
  title: "Issue needs your decision",
  body: "AQA-8 is waiting on you.",
  entity_type: "issue",
  entity_id: liveIssue.id,
  dedupe_key: null,
  payload_json: {},
  read_at: null,
  created_at: "2026-08-13T12:31:00.000Z",
};

async function installLiveAlertsHarness(page: Page) {
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
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").at(-1);
    let response: unknown = [];

    if (table === "workspaces") response = [liveWorkspace];
    if (table === "issues") response = [liveIssue];
    if (table === "notifications" && route.request().method() === "GET")
      response = [issueNotification];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Content-Range": "0-0/*" },
      body: JSON.stringify(response),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
  await installLiveAlertsHarness(page);
});

test("an issue notification opens that issue, not the issue list", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?auth=1");
  await page.getByRole("textbox", { name: "Email" }).fill(testUser.email);
  await page.getByRole("textbox", { name: "Password" }).fill("password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const shell =
    testInfo.project.name === "mobile" ? ".mobile-topbar" : ".sidebar";
  const trigger = page
    .locator(shell)
    .getByRole("button", { name: /Notifications/ });
  await expect(trigger).toHaveAccessibleName(/1 unread/);
  await trigger.click();

  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toBeVisible();
  await panel
    .getByRole("button", { name: /Issue needs your decision/ })
    .click();

  await expect(page).toHaveURL(/\/issues\/AQA-8$/);
  await expect(
    page.getByRole("heading", { name: "Checkout stalls on the last order" }),
  ).toBeVisible();
  await expect(panel).toBeHidden();
});
