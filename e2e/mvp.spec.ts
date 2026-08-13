import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "en-US");
  });
});

async function openCommandPalette(page: Page, projectName: string) {
  await page
    .getByRole("button", {
      name: projectName === "mobile" ? "Search workspace" : /Search everything/,
    })
    .click();
}

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("public landing makes the support-to-fix loop visible", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "Your support loop, finally off your plate.",
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Interactive Mend case playback")).toBeVisible();
  await expect(
    page.locator("#product").getByRole("link", { name: "See Mend at work" }),
  ).toBeVisible();
});

test("landing product proof can play and select support-loop scenes", async ({
  page,
}) => {
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-scene", "signal");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(playback).toHaveAttribute("data-scene", "investigate");
  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(playback).toHaveAttribute("data-playing", "false");
});

test("reduced motion keeps playback static and manually selectable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-playing", "false");
  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "signal");
  await page.getByRole("button", { name: "Verified reply" }).click();
  await expect(playback).toHaveAttribute("data-scene", "verify");
});

test("hovering the playback pauses autoplay and resumes on pointer leave", async ({
  page,
}) => {
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-scene", "signal");

  await playback.hover();
  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "signal");

  await page.mouse.move(0, 0);
  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "context");
});

test("a manual pause survives a focus change", async ({ page }) => {
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");

  await page.getByRole("button", { name: "Pause playback" }).click();
  await expect(playback).toHaveAttribute("data-playing", "false");
  await expect(playback).toHaveAttribute("data-scene", "signal");

  await page.getByRole("link", { name: "Sign in" }).first().focus();
  await expect(playback).toHaveAttribute("data-playing", "false");

  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "signal");
});

test("toggling reduced motion mid-session stops live playback", async ({
  page,
}) => {
  await page.goto("/");
  const playback = page.getByLabel("Interactive Mend case playback");
  await expect(playback).toHaveAttribute("data-playing", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(playback).toHaveAttribute("data-playing", "false");

  await page.waitForTimeout(3400);
  await expect(playback).toHaveAttribute("data-scene", "signal");
});

test("explicit auth link renders the sign-in form while the session probe runs", async ({
  page,
}) => {
  await page.goto("/?auth=1");

  await expect(
    page.getByRole("heading", { name: "Sign in to Mend" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  await expect(page.getByText("Loading secure workspace")).not.toBeVisible();
});

test("auth callback hashes stay in the sign-in flow instead of opening the landing", async ({
  page,
}) => {
  await page.goto(
    "/#access_token=e2e-token&refresh_token=e2e-refresh&type=signup",
  );

  await expect(
    page.getByRole("heading", { name: "Sign in to Mend" }),
  ).toBeVisible();
  await expect(
    page.locator(".marketing-page").getByRole("heading", {
      name: "Stay close to the customer without leaving the product.",
    }),
  ).toHaveCount(0);
});

test("uses the explicit Portuguese interface choice after reload", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("mend.interface-language", "pt-BR");
  });
  await page.goto("/inbox?demo=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  if (testInfo.project.name === "mobile")
    await page.getByText("Mais", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Configurações" }).first(),
  ).toBeVisible();
});

test("operator can open the shared issues board and personal work", async ({
  page,
}) => {
  await page.goto("/issues?demo=1&view=board");
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Personal" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "New issue", exact: true }),
  ).toBeVisible();

  await page.goto("/my-work?demo=1");
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Shared" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Add a task…")).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "New personal task" }),
  ).toBeFocused();
});

test("operator can move from inbox to issues and create an issue", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("link", { name: "Issues" })
      .click();
  } else {
    await openCommandPalette(page, testInfo.project.name);
    await page.getByRole("button", { name: "Browse issues" }).click();
  }
  await expect(page.getByRole("heading", { name: "Issues" })).toBeVisible();

  await page
    .getByRole("button", { name: /New issue/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Create issue" }),
  ).toBeVisible();
  await page.getByLabel("Title").fill("E2E issue from Mend");
  await page.getByRole("button", { name: "Create issue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(/TEC-\d+ created/);
  await page.getByRole("button", { name: "Close issue inspector" }).click();

  const issueCollection =
    testInfo.project.name === "mobile"
      ? page.locator(".issues-mobile-list")
      : page.locator(".issues-desktop-table");
  await expect(
    issueCollection.getByText("E2E issue from Mend", { exact: true }),
  ).toBeVisible();

  const createdIssueRow = issueCollection
    .locator(testInfo.project.name === "mobile" ? ".issue-mobile-item" : "tr")
    .filter({ hasText: "E2E issue from Mend" });
  await createdIssueRow.getByRole("button", { name: /Actions for/ }).click();
  const issueMenu = page.getByRole("menu");
  await expect(issueMenu).toBeVisible();
  await issueMenu.getByRole("menuitem", { name: "Edit issue" }).click();
  await expect(page.getByRole("heading", { name: "Edit issue" })).toBeVisible();
  await page.getByLabel("Title").fill("Edited E2E issue from Mend");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    issueCollection.getByText("Edited E2E issue from Mend", { exact: true }),
  ).toBeVisible();

  const editedIssueRow = issueCollection
    .locator(testInfo.project.name === "mobile" ? ".issue-mobile-item" : "tr")
    .filter({ hasText: "Edited E2E issue from Mend" });
  await editedIssueRow.getByRole("button", { name: /Actions for/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await expect(issueMenu).toBeVisible();
  await issueMenu.getByRole("menuitem", { name: "Delete issue" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete issue", exact: true })
    .click();
  await expect(page.getByText("Edited E2E issue from Mend")).toHaveCount(0);
});

test("operator can use the command palette and navigate to runs", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await openCommandPalette(page, testInfo.project.name);
  await expect(
    page.getByPlaceholder("Search actions or jump to…"),
  ).toBeVisible();
  await page.getByRole("button", { name: "View Agent runs" }).click();
  await expect(
    page.getByRole("heading", { name: "Engineering runs" }),
  ).toBeVisible();
});

test("operator can assign and resolve a conversation", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Open conversation with/ })
    .first()
    .click();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Conversation actions" }).click();
    await page
      .getByRole("menu")
      .getByRole("combobox", {
        name: "Conversation assignee",
      })
      .click();
    await page.getByRole("option", { name: "Unassigned", exact: true }).click();
  } else {
    await chooseOption(page, "Conversation assignee", "Unassigned");
  }
  await expect(page.getByRole("status")).toContainText("Assigned to");

  await page.getByRole("button", { name: "Conversation actions" }).click();
  await page.getByRole("menuitem", { name: "Resolve conversation" }).click();
  await expect(page.getByRole("status")).toContainText("Conversation resolved");
});

test("operator can update an issue and return to its conversation", async ({
  page,
}) => {
  await page.goto("/issues/TEC-24?demo=1");
  await expect(
    page.getByRole("heading", { name: /Fechamento de caixa/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Status" }).click();
  await chooseOption(page, "Edit Status", "Review");
  await expect(page.getByText("Review", { exact: true }).first()).toBeVisible();

  await page
    .getByLabel("Internal comment")
    .fill("Validated in the E2E workflow");
  await page.getByRole("button", { name: "Comment" }).click();
  await expect(page.getByText(/Validated in the E2E workflow/)).toBeVisible();

  await page.getByLabel("New issue label").fill("e2e");
  await page.getByRole("button", { name: "Add issue label" }).click();
  await expect(page.getByText("e2e", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Resolve & notify" }).click();
  await page
    .getByLabel("Resolution message")
    .fill("E2E resolution sent to the customer");
  await page.getByRole("button", { name: "Resolve and send" }).click();
  await expect(page.getByRole("status")).toContainText(
    "resolved and customer notified",
  );

  await page.getByRole("button", { name: /Cliente Exemplo/ }).click();
  await expect(page).toHaveURL(/\/inbox\?conversation=/);
  await expect(
    page.locator(".message-bubble", {
      hasText: "E2E resolution sent to the customer",
    }),
  ).toBeVisible();
});

test("operator can review checks and approve an engineering diff", async ({
  page,
}) => {
  await page.goto("/agent-runs?demo=1");
  await page.getByRole("button", { name: /TEC-19/ }).click();

  await expect(page.getByLabel("Engineering diff")).toContainText(
    "parseInviteToken",
  );
  await page.getByText("test", { exact: true }).click();
  await expect(page.getByText("12 tests passed")).toBeVisible();

  await page.getByRole("button", { name: "Approve local commit" }).click();
  await expect(page.getByRole("status")).toContainText("Agent result approved");
  await expect(
    page.getByText("Approved", { exact: true }).first(),
  ).toBeVisible();
});

test("unauthenticated live mode does not render demo customer records", async ({
  page,
}) => {
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: "Sign in to Mend" }),
  ).toBeVisible();
  await expect(page.getByText("Cliente Exemplo")).toHaveCount(0);
});
