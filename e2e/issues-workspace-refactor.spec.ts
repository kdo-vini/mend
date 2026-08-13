import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem("mend.interface-language")) {
      window.localStorage.setItem("mend.interface-language", "en-US");
    }
  });
});

test("Issues owns list and board views", async ({ page }, testInfo) => {
  await page.goto("/issues?demo=1&status=open&view=board");
  await expect(page.getByRole("link", { name: "Board" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.getByRole("link", { name: "List" }).click();
  await expect(page).toHaveURL(/\/issues\?demo=1&status=open$/);
  await page.getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/issues\?demo=1&status=open&view=board$/);
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
  await expect(page.getByLabel("Customer")).toBeVisible();

  await page.getByLabel("Priority").click();
  await page.getByRole("option", { name: "Urgent", exact: true }).click();
  await page.getByLabel("Customer").click();
  await page
    .getByRole("option", { name: "Cliente Exemplo", exact: true })
    .click();
  const moreFilters = page.getByRole("button", { name: /More filters/ });
  await expect(moreFilters.locator(".filter-count")).toHaveText("2");
  await expect(page.locator(".issues-desktop-table tbody tr")).toHaveCount(1);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(moreFilters.locator(".filter-count")).toHaveCount(0);
  await expect(page.getByLabel("Priority")).toContainText("All");
  await expect(page.getByLabel("Customer")).toContainText("All customers");
  await expect(page.locator(".issues-desktop-table tbody tr")).toHaveCount(6);
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
  const triage = mobileBoard.locator("section").filter({
    has: page.locator("header", { hasText: "Triage" }),
  });
  const backlog = mobileBoard.locator("section").filter({
    has: page.locator("header", { hasText: "Backlog" }),
  });
  const triageIssue = triage.locator(".mobile-shared-issue-row", {
    hasText: "TEC-23",
  });
  const statusSelect = triageIssue.getByRole("combobox", {
    name: "Move TEC-23",
  });
  await statusSelect.selectOption("Backlog");
  await expect(triageIssue).toHaveCount(0);
  const movedIssue = backlog.locator(".mobile-shared-issue-row", {
    hasText: "TEC-23",
  });
  await expect(movedIssue).toBeVisible();
  await expect(
    movedIssue.getByRole("combobox", { name: "Move TEC-23" }),
  ).toHaveValue("Backlog");
  expect(
    await page.evaluate(() => document.body.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("shown canceled mobile issue keeps Canceled as a valid status option", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues?demo=1");

  const issueRow = page
    .locator(".issue-mobile-item")
    .filter({ hasText: "TEC-24" });
  await issueRow.getByRole("button", { name: "Actions for TEC-24" }).click();
  await page.getByRole("menuitem", { name: "Edit issue" }).click();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Canceled", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.getByRole("link", { name: "Board" }).click();
  await page.getByRole("button", { name: "Canceled", exact: true }).click();
  const canceledGroup = page
    .locator(".kanban-mobile-status-list section")
    .filter({ has: page.locator("header", { hasText: "Canceled" }) });
  const canceledIssue = canceledGroup.locator(".mobile-shared-issue-row", {
    hasText: "TEC-24",
  });
  await expect(canceledIssue).toBeVisible();
  const statusSelect = canceledIssue.getByRole("combobox", {
    name: "Move TEC-24",
  });
  await expect(statusSelect).toHaveValue("Canceled");
  await expect(
    statusSelect.getByRole("option", { name: "Canceled", exact: true }),
  ).toHaveCount(1);
});

test("mobile critical issue controls meet the touch target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/issues?demo=1");

  const controls = [
    page.locator(".page-actions > .button-primary"),
    page.getByRole("button", { name: "More filters", exact: true }),
    page.getByRole("button", { name: "Clear filters", exact: true }),
    page.getByRole("button", { name: "Actions for TEC-24" }),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("link", { name: "Board" }).click();
  const boardPrimary = page.locator(".kanban-primary-action");
  const boardBox = await boardPrimary.boundingBox();
  expect(boardBox?.height).toBeGreaterThanOrEqual(44);
});

test("Portuguese issue views localize status, type, internal, and assignee", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/issues?demo=1");
  await page.evaluate(() => {
    window.localStorage.setItem("mend.interface-language", "pt-BR");
  });
  await page.reload();

  const internalIssue = page
    .locator(".issues-desktop-table tbody tr")
    .filter({ hasText: "TEC-21" });
  await expect(internalIssue).toContainText("Interno");

  await page.getByRole("link", { name: "Quadro" }).click();
  const board = page.locator(".kanban-board");
  await expect(
    board.locator(".kanban-column-heading > span", { hasText: "Em andamento" }),
  ).toBeVisible();
  const productionBug = board.locator(".issue-card", { hasText: "TEC-24" });
  await expect(productionBug).toContainText("Bug de produção");
  await expect(productionBug).toContainText("Marina");
  await expect(
    productionBug.getByRole("option", { name: "Em andamento" }),
  ).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const aiIssue = page
    .locator(".kanban-mobile-status-list .mobile-shared-issue-row")
    .filter({ hasText: "TEC-22" });
  await expect(aiIssue).toContainText("Usuário AI");
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
