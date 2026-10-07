import { expect, test, type Page } from "@playwright/test";

type ProjectRecord = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: "active" | "archived";
  version: number;
};

async function mockProjects(page: Page) {
  const records: ProjectRecord[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      key: "Zelo",
      name: "Zelo",
      description: "Produto de bem-estar financeiro.",
      status: "active",
      version: 1,
    },
  ];
  let conflictNextSave = false;

  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { data: records } });
      return;
    }

    const { record, version } = route.request().postDataJSON() as {
      record: Omit<ProjectRecord, "version">;
      version: number | null;
    };
    expect(record).not.toHaveProperty("version");
    if (conflictNextSave) {
      conflictNextSave = false;
      const current = records.find((project) => project.id === record.id);
      if (current) current.version += 1;
      await route.fulfill({
        status: 409,
        json: { error: { code: "project_conflict", message: "Conflict" } },
      });
      return;
    }

    const current = records.find((project) => project.id === record.id);
    if (current && version !== current.version) {
      await route.fulfill({
        status: 409,
        json: { error: { code: "project_conflict", message: "Conflict" } },
      });
      return;
    }

    const saved: ProjectRecord = {
      ...record,
      version: current ? current.version + 1 : 1,
    };
    if (current) records[records.indexOf(current)] = saved;
    else records.push(saved);
    await route.fulfill({ json: saved });
  });

  return {
    records,
    conflictNextSave: () => {
      conflictNextSave = true;
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

test("projects lists live records and links each card to its finance view", async ({
  page,
}) => {
  await mockProjects(page);
  await page.goto("/projects?demo=1");

  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Zelo" })).toBeVisible();
  const financeLink = page.getByRole("link", { name: "Open finance" });
  await expect(financeLink).toHaveAttribute("href", "/financeiro?project=Zelo");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`projects-${theme}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }

  if (test.info().project.name === "desktop") {
    await expect(
      page.getByRole("link", { name: "Projects", exact: true }),
    ).toBeVisible();
  }
});

test("projects create, edit with conflict recovery, and archive", async ({
  page,
}) => {
  const api = await mockProjects(page);
  await page.goto("/projects?demo=1");

  await page.getByRole("button", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Zelo Sites");
  await page.getByLabel("Description").fill("Web products and systems.");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("heading", { name: "Zelo Sites" })).toBeVisible();
  expect(
    api.records.find((project) => project.name === "Zelo Sites")?.key,
  ).toBe("Zelo Sites");

  await page.getByRole("button", { name: "Edit Zelo Sites" }).click();
  const nameField = page.getByLabel("Project name");
  await nameField.fill("Zelo Sites & Systems");
  api.conflictNextSave();
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "This project changed in another session",
  );
  await expect(nameField).toHaveValue("Zelo Sites & Systems");
  await page.getByRole("button", { name: "Reload data" }).click();
  await expect(nameField).toHaveValue("Zelo Sites & Systems");

  await page.getByRole("button", { name: "Save project" }).click();
  await expect(
    page.getByRole("heading", { name: "Zelo Sites & Systems" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Archive Zelo Sites & Systems" })
    .click();
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(page.getByRole("heading", { name: "Archived" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Zelo Sites & Systems" }),
  ).toBeVisible();
  expect(
    api.records.find((project) => project.name === "Zelo Sites & Systems")
      ?.status,
  ).toBe("archived");
});

test("project editor traps keyboard focus and returns focus on Escape", async ({
  page,
}) => {
  await mockProjects(page);
  await page.goto("/projects?demo=1");

  const createButton = page.getByRole("button", { name: "New project" });
  await createButton.click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  const nameField = dialog.getByLabel("Project name");
  const closeButton = dialog.getByRole("button", { name: "Close" });
  await expect(nameField).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(closeButton).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(nameField).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(dialog).toHaveCount(0);
  await expect(createButton).toBeFocused();
});
