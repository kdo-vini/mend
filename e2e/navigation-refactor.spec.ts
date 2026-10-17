import { expect, test } from "@playwright/test";

test("workspace navigation exposes the product loop without standalone Kanban", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  const navigation =
    testInfo.project.name === "mobile"
      ? page.locator(".mobile-bottom-nav")
      : page.locator(".primary-nav");
  await expect(
    navigation.getByText("Caixa de entrada", { exact: true }),
  ).toBeVisible();
  await expect(navigation.getByText("Chamados", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Kanban", { exact: true })).toHaveCount(0);
  // Fase A: AI/agent surfaces are hidden while Mend is the WhatsApp bridge.
  await expect(navigation.getByText("Execuções", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    navigation.getByText("Base de conhecimento", { exact: true }),
  ).toHaveCount(0);
});

test("legacy Kanban destinations preserve demo state", async ({ page }) => {
  await page.goto("/kanban?demo=1");
  await expect(page).toHaveURL(/\/issues\?demo=1&view=board$/);
  await page.goto("/kanban?mode=personal&demo=1");
  await expect(page).toHaveURL(/\/my-work\?demo=1$/);
});

test("mobile More keeps secondary work and controls reachable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/inbox?demo=1");
  await page.getByRole("button", { name: "Mais" }).click();
  await expect(page.getByRole("link", { name: "Meu trabalho" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
  await expect(page.getByRole("button", { name: /tema/i })).toBeVisible();
  await page.getByRole("link", { name: "Meu trabalho" }).click();
  await expect(page).toHaveURL(/\/my-work\?demo=1$/);
});

test("mobile view tabs and More actions meet the minimum touch target", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await page.goto("/inbox?demo=1");
  await page.evaluate(() => {
    const tabs = document.createElement("nav");
    tabs.className = "view-tabs";
    tabs.setAttribute("aria-label", "Issue views");
    const tab = document.createElement("a");
    tab.href = "/issues";
    tab.textContent = "Lista";
    tabs.append(tab);
    document.querySelector("main")?.append(tabs);
  });

  const viewTab = page.getByRole("link", { name: "Lista" });
  await page.getByRole("button", { name: "Mais" }).click();
  const controls = [
    ["view tab", viewTab],
    ["Meu trabalho", page.getByRole("link", { name: "Meu trabalho" })],
    ["Configurações", page.getByRole("link", { name: "Configurações" })],
    ["Perfil", page.getByRole("link", { name: "Perfil", exact: true })],
    ["theme", page.getByRole("button", { name: /tema/i })],
  ];
  const heights: Record<string, number | undefined> = {};
  for (const [name, control] of controls) {
    heights[name] = (await control.boundingBox())?.height;
  }
  expect(heights).toEqual({
    "view tab": 44,
    "Meu trabalho": 44,
    Configurações: 44,
    Perfil: 44,
    theme: 44,
  });
});
