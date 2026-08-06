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

test("defaults to Portuguese on the first visit", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("mend.e2e.locale-reset")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("mend.e2e.locale-reset", "1");
    }
  });
  await page.goto("/inbox?demo=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  if (testInfo.project.name === "mobile")
    await page.getByText("Mais", { exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Configurações" }).first(),
  ).toBeVisible();
});

test("persists an explicit English choice and allows switching back", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("mend.e2e.locale-reset")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("mend.e2e.locale-reset", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByRole("link", { name: "Pricing" })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await page.getByRole("button", { name: "PT", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
});

test("operator can open the shared and personal Kanban views", async ({
  page,
}, testInfo) => {
  await page.goto("/kanban?demo=1");
  await expect(page.getByRole("heading", { name: "Kanban" })).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("tab", { name: "Pessoal" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("button", { name: /Revisar lista de onboarding/ }).first(),
    ).toBeVisible();
    await expect(
      page.locator(".mobile-bottom-nav").getByRole("link", { name: "Kanban" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nova tarefa", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Nova tarefa pessoal" }),
    ).toBeFocused();
  } else {
    await expect(
      page.locator(".kanban-column-heading").filter({ hasText: "Triagem" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".kanban-column-heading")
        .filter({ hasText: "Em andamento" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Pessoal" }).click();
    await expect(page.getByPlaceholder("Adicionar uma tarefa…")).toBeVisible();
    await page
      .getByRole("button", { name: "Nova tarefa", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Nova tarefa pessoal" }),
    ).toBeFocused();
  }
});

test("operator can move from inbox to issues and create an issue", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await expect(
    page.getByRole("heading", { name: "Caixa de entrada" }),
  ).toBeVisible();

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

  if (testInfo.project.name === "mobile") {
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("link", { name: "Chamados" })
      .click();
  } else {
    await openCommandPalette(page, testInfo.project.name);
    await page.getByRole("button", { name: "Ver chamados" }).click();
  }
  await expect(page.getByRole("heading", { name: "Chamados" })).toBeVisible();
  await expect(page.getByText("E2E issue from Mend")).toBeVisible();

  const createdIssueRow = page
    .locator("tr")
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
  await expect(page.getByText("Edited E2E issue from Mend")).toBeVisible();

  const editedIssueRow = page
    .locator("tr")
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

test("operator can use the command palette and navigate to runs", async ({
  page,
}, testInfo) => {
  await page.goto("/inbox?demo=1");
  await openCommandPalette(page, testInfo.project.name);
  await expect(
    page.getByPlaceholder("Pesquisar ações ou ir para…"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver execuções do Codex" }).click();
  await expect(
    page.getByRole("heading", { name: "Execuções do Codex" }),
  ).toBeVisible();
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

test("operator can review checks and approve a Codex diff", async ({
  page,
}) => {
  await page.goto("/codex-runs?demo=1");
  await page.getByRole("button", { name: /TEC-19/ }).click();

  await expect(page.getByLabel("Diff do Codex")).toContainText(
    "parseInviteToken",
  );
  await page.getByText("test", { exact: true }).click();
  await expect(page.getByText("12 tests passed")).toBeVisible();

  await page.getByRole("button", { name: "Aprovar commit local" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Resultado do Codex aprovado",
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
