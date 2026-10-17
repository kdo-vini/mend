import { expect, test, type Page } from "@playwright/test";

async function openCommandPalette(page: Page, projectName: string) {
  await page
    .getByRole("button", {
      name:
        projectName === "mobile"
          ? "Pesquisar no espaço de trabalho"
          : /Pesquisar em tudo/,
    })
    .click();
}

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("explicit auth link renders the sign-in form while the session probe runs", async ({
  page,
}) => {
  await page.goto("/?auth=1");

  await expect(
    page.getByRole("heading", { name: "Entrar no Mend" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "E-mail" })).toBeVisible();
  await expect(
    page.getByText("Carregando espaço de trabalho seguro"),
  ).not.toBeVisible();
});

test("auth callback hashes stay in the sign-in flow instead of opening the landing", async ({
  page,
}) => {
  await page.goto(
    "/#access_token=e2e-token&refresh_token=e2e-refresh&type=signup",
  );

  await expect(
    page.getByRole("heading", { name: "Entrar no Mend" }),
  ).toBeVisible();
  await expect(
    page.locator(".marketing-page").getByRole("heading", {
      name: "Fique perto do cliente sem sair do produto.",
    }),
  ).toHaveCount(0);
});

test("uses the explicit Portuguese interface choice after reload", async ({
  page,
}, testInfo) => {
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
  await expect(page.getByRole("heading", { name: "Casos" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pessoal" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Novo chamado", exact: true }),
  ).toBeVisible();

  await page.goto("/my-work?demo=1");
  await expect(
    page.getByRole("heading", { name: "Meu trabalho" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Compartilhado" })).toHaveCount(0);
  await expect(page.getByPlaceholder("Adicionar uma tarefa…")).toBeVisible();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Nova tarefa pessoal" }),
  ).toBeFocused();
});

test("operator can move from inbox to issues and create an issue", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await expect(
    page.getByRole("heading", { name: "Caixa de entrada" }),
  ).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("link", { name: "Chamados" })
      .click();
  } else {
    await openCommandPalette(page, testInfo.project.name);
    await page.getByRole("button", { name: "Ver chamados" }).click();
  }
  await expect(page.getByRole("heading", { name: "Casos" })).toBeVisible();

  await page
    .getByRole("button", { name: /Novo chamado/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Criar chamado" }),
  ).toBeVisible();
  await page.getByLabel("Título").fill("E2E issue from Mend");
  await page
    .getByRole("button", { name: "Criar chamado", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/TEC-\d+ criado/);
  await page
    .getByRole("button", { name: "Fechar inspetor do chamado" })
    .click();

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
  await createdIssueRow.getByRole("button", { name: /Ações para/ }).click();
  const issueMenu = page.getByRole("menu");
  await expect(issueMenu).toBeVisible();
  await issueMenu.getByRole("menuitem", { name: "Editar chamado" }).click();
  await expect(
    page.getByRole("heading", { name: "Editar chamado" }),
  ).toBeVisible();
  await page.getByLabel("Título").fill("Edited E2E issue from Mend");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    issueCollection.getByText("Edited E2E issue from Mend", { exact: true }),
  ).toBeVisible();

  const editedIssueRow = issueCollection
    .locator(testInfo.project.name === "mobile" ? ".issue-mobile-item" : "tr")
    .filter({ hasText: "Edited E2E issue from Mend" });
  await editedIssueRow.getByRole("button", { name: /Ações para/ }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await expect(issueMenu).toBeVisible();
  await issueMenu.getByRole("menuitem", { name: "Excluir chamado" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Excluir chamado", exact: true })
    .click();
  await expect(page.getByText("Edited E2E issue from Mend")).toHaveCount(0);
});

test("operator can use the command palette without AI surfaces", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await openCommandPalette(page, testInfo.project.name);
  await expect(
    page.getByPlaceholder("Pesquisar ações ou ir para…"),
  ).toBeVisible();
  // Fase A hides Agent runs and Knowledge from the palette.
  await expect(
    page.getByRole("button", { name: "Ver execuções do Agent" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir configurações" }).click();
  await expect(page).toHaveURL(/\/settings/);
});

test("operator can assign and resolve a conversation", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await page
    .getByRole("button", { name: /Abrir conversa com/ })
    .first()
    .click();

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Ações da conversa" }).click();
    await page
      .getByRole("menu")
      .getByRole("combobox", {
        name: "Responsável pela conversa",
      })
      .click();
    await page
      .getByRole("option", { name: "Não atribuído", exact: true })
      .click();
  } else {
    await chooseOption(page, "Responsável pela conversa", "Não atribuído");
  }
  await expect(page.getByRole("status")).toContainText("Atribuído a");

  await page.getByRole("button", { name: "Ações da conversa" }).click();
  await page.getByRole("menuitem", { name: "Resolver conversa" }).click();
  await expect(page.getByRole("status")).toContainText("Conversa resolvida");
});

test("operator can update an issue and return to its conversation", async ({
  page,
}) => {
  await page.goto("/issues/TEC-24?demo=1");
  await expect(
    page.getByRole("heading", { name: /Fechamento de caixa/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Editar Status" }).click();
  await chooseOption(page, "Editar Status", "Revisão");
  await expect(
    page.getByText("Revisão", { exact: true }).first(),
  ).toBeVisible();

  await page
    .getByLabel("Comentário interno")
    .fill("Validated in the E2E workflow");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText(/Validated in the E2E workflow/)).toBeVisible();

  await page.getByLabel("Novo rótulo do chamado").fill("e2e");
  await page
    .getByRole("button", { name: "Adicionar rótulo do chamado" })
    .click();
  await expect(page.getByText("e2e", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Concluir e avisar" }).click();
  await page
    .getByLabel("Mensagem de conclusão")
    .fill("E2E resolution sent to the customer");
  await page.getByRole("button", { name: "Concluir e enviar" }).click();
  await expect(page.getByRole("status")).toContainText(
    "concluído e cliente avisado",
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

  await expect(page.getByLabel("Diff de engenharia")).toContainText(
    "parseInviteToken",
  );
  await page.getByText("test", { exact: true }).click();
  await expect(page.getByText("12 tests passed")).toBeVisible();

  await page.getByRole("button", { name: "Aprovar commit local" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Resultado do Agent aprovado e commit local criado",
  );
  await expect(
    page.getByText("Aprovada", { exact: true }).first(),
  ).toBeVisible();
});

test("unauthenticated live mode does not render demo customer records", async ({
  page,
}) => {
  await page.goto("/inbox");
  await expect(
    page.getByRole("heading", { name: "Entrar no Mend" }),
  ).toBeVisible();
  await expect(page.getByText("Cliente Exemplo")).toHaveCount(0);
});
