import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("workspace navigation exposes the product loop without standalone Kanban", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  const navigation =
    testInfo.project.name === "mobile"
      ? page.locator(".mobile-bottom-nav")
      : page.locator(".primary-nav");
  await expect(navigation.getByText("Inbox", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Issues", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Runs", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Kanban", { exact: true })).toHaveCount(0);
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
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("link", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: /theme/i })).toBeVisible();
  await page.getByRole("link", { name: "My work" }).click();
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
    tab.textContent = "List";
    tabs.append(tab);
    document.querySelector("main")?.append(tabs);
  });

  const viewTab = page.getByRole("link", { name: "List" });
  await page.getByRole("button", { name: "More" }).click();
  const controls = [
    ["view tab", viewTab],
    ["Knowledge", page.getByRole("link", { name: "Knowledge" })],
    ["My work", page.getByRole("link", { name: "My work" })],
    ["Settings", page.getByRole("link", { name: "Settings" })],
    ["Profile", page.getByRole("link", { name: "Profile", exact: true })],
    ["theme", page.getByRole("button", { name: /theme/i })],
  ];
  const heights: Record<string, number | undefined> = {};
  for (const [name, control] of controls) {
    heights[name] = (await control.boundingBox())?.height;
  }
  expect(heights).toEqual({
    "view tab": 44,
    Knowledge: 44,
    "My work": 44,
    Settings: 44,
    Profile: 44,
    theme: 44,
  });
});
