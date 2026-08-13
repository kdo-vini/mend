import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("Automation separates customer replies from intake", async ({ page }) => {
  await page.goto("/settings/automation/replies?demo=1");
  await expect(page.getByRole("link", { name: "Replies" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Intake" }).click();
  await expect(page).toHaveURL(/\/settings\/automation\/intake/);
});

test("Agents and models separates providers from run policy", async ({
  page,
}) => {
  await page.goto("/settings/engineering/agents/providers?demo=1");
  await expect(
    page.getByRole("heading", { name: "Agents & models" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Providers" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Run policy" }).click();
  await expect(page).toHaveURL(/\/settings\/engineering\/agents\/run-policy/);
});

test("integration providers remain details, not sidebar destinations", async ({
  page,
}) => {
  await page.goto("/settings/integrations?demo=1");
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByText("Not configured", { exact: true })).toHaveCount(
    4,
  );
  await expect(
    page.locator(".settings-v2-nav").getByText("GitHub"),
  ).toHaveCount(0);
});
