import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("Issues owns list and board views", async ({ page }, testInfo) => {
  await page.goto("/issues?demo=1");
  await expect(page.getByRole("link", { name: "List" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/view=board/);
  const statusHeading =
    testInfo.project.name === "mobile"
      ? page
          .locator(".kanban-mobile-status-list section > header > span")
          .getByText("Triage", { exact: true })
      : page
          .locator(".kanban-column-heading > span")
          .getByText("Triage", { exact: true });
  await expect(statusHeading).toBeVisible();
});

test("advanced filters stay behind one explicit control", async ({ page }) => {
  await page.goto("/issues?demo=1");
  const advanced = page.getByRole("region", { name: "Advanced filters" });
  await expect(advanced).toBeHidden();
  await page.getByRole("button", { name: "More filters" }).click();
  await expect(advanced).toBeVisible();
  await expect(page.getByLabel("Priority")).toBeVisible();
  await expect(page.getByLabel("Labels")).toBeVisible();
});

test("mobile issues use compact rows and a grouped board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues?demo=1");
  await expect(page.locator(".issues-mobile-list")).toBeVisible();
  await expect(page.locator(".issues-desktop-table")).toBeHidden();
  await page.getByLabel("Search issues").fill("missing issue title");
  await expect(
    page.locator(".issues-mobile-list").getByText("No matching issues"),
  ).toBeVisible();
  await page.getByLabel("Search issues").fill("");
  await page.getByRole("link", { name: "Board" }).click();
  const mobileBoard = page.locator(".kanban-mobile-status-list");
  await expect(mobileBoard).toBeVisible();
  await expect(
    mobileBoard.getByRole("combobox", { name: /^Move TEC-/ }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("desktop board uses six adaptive columns inside explicit scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/issues?demo=1&view=board");

  const scroll = page.locator(".kanban-board-scroll");
  const board = page.locator(".kanban-board");
  await expect(scroll).toBeVisible();
  await expect(board).toBeVisible();

  const wideGeometry = await page.evaluate(() => {
    const scrollElement = document.querySelector<HTMLElement>(
      ".kanban-board-scroll",
    );
    const boardElement = document.querySelector<HTMLElement>(".kanban-board");
    if (!scrollElement || !boardElement) throw new Error("Board not found");
    const style = getComputedStyle(boardElement);
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      scrollWidth: scrollElement.scrollWidth,
      clientWidth: scrollElement.clientWidth,
    };
  });
  expect(wideGeometry.display).toBe("grid");
  expect(wideGeometry.columns).toBe(6);
  expect(wideGeometry.scrollWidth).toBeLessThanOrEqual(
    wideGeometry.clientWidth,
  );

  await page.setViewportSize({ width: 760, height: 900 });
  const compactGeometry = await scroll.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(compactGeometry.scrollWidth).toBeGreaterThan(
    compactGeometry.clientWidth,
  );
});
