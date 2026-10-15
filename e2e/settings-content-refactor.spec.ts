import { expect, test } from "@playwright/test";

test("Automation separates customer replies from intake", async ({ page }) => {
  await page.goto("/settings/automation/replies?demo=1");
  await expect(page.getByRole("link", { name: "Respostas" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Coleta inicial" }).click();
  await expect(page).toHaveURL(/\/settings\/automation\/intake/);
});

test("Agents and models separates providers from run policy", async ({
  page,
}) => {
  await page.goto("/settings/engineering/agents/providers?demo=1");
  await expect(
    page.getByRole("heading", { name: "Agentes e modelos" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Provedores" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Política de execução" }).click();
  await expect(page).toHaveURL(
    /\/settings\/engineering\/agents\/issues\/run-policy/,
  );
});

test("integration providers remain details, not sidebar destinations", async ({
  page,
}) => {
  await page.goto("/settings/integrations?demo=1");
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByText("Não configurado", { exact: true })).toHaveCount(
    4,
  );
  await expect(
    page.locator(".settings-v2-nav").getByText("GitHub"),
  ).toHaveCount(0);
});
