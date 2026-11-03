// @vitest-environment jsdom
// i18n-exempt: test renders translated output via the shared i18n instance directly, not useTranslation().

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../../../i18n";
import { LiveActionError } from "../../../api/transport";
import type { AgentKey } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listLiveAgentKeys: vi.fn(),
    createLiveAgentKey: vi.fn(),
    revokeLiveAgentKey: vi.fn(),
  };
});

import * as settingsApi from "../api";
import { SettingsAgentKeysPage } from "./SettingsAgentKeysPage";

const { mcpServerUrl } = settingsApi;

const maria: AgentKey = {
  id: "key-1",
  label: "Maria",
  scopes: ["suporte:ler", "suporte:responder"],
  created_by: "user-1",
  created_at: "2026-11-04T12:00:00.000Z",
  last_used_at: null,
  revoked_at: null,
};

let container: HTMLDivElement;
let root: Root;

async function render(confirm = vi.fn(async () => true)) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const toast = vi.fn();
  await act(async () => {
    root.render(
      <SettingsAgentKeysPage
        workspaceId="workspace-1"
        onToast={toast}
        onConfirm={confirm}
      />,
    );
  });
  return { toast, confirm };
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function button(text: string) {
  return Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

describe("SettingsAgentKeysPage", () => {
  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("lists active keys with their permissions and hides revoked ones", async () => {
    vi.mocked(settingsApi.listLiveAgentKeys).mockResolvedValue([
      maria,
      { ...maria, id: "key-2", label: "Antiga", revoked_at: maria.created_at },
    ]);
    await render();
    expect(container.textContent).toContain("Maria");
    expect(container.textContent).toContain(
      "Ler mensagens e histórico do suporte · Responder clientes no WhatsApp",
    );
    expect(container.textContent).toContain("Ainda não usada");
    expect(container.textContent).not.toContain("Antiga");
  });

  it("creates a key only with a name and at least one permission, then shows it once", async () => {
    vi.mocked(settingsApi.listLiveAgentKeys).mockResolvedValue([]);
    vi.mocked(settingsApi.createLiveAgentKey).mockResolvedValue({
      secret: "mend_agent_secret",
      record: { ...maria, label: "Rafa", scopes: ["diario:escrever"] },
    });
    await render();
    const submit = button("Criar chave")!;
    expect(submit.disabled).toBe(true);

    await act(async () => {
      setInput(container.querySelector("input:not([type])")!, "Rafa");
    });
    expect(submit.disabled).toBe(true);
    const diario = Array.from(
      container.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
    ).find((input) =>
      input.parentElement?.textContent?.includes("Registrar no Diário"),
    )!;
    await act(async () => diario.click());
    expect(submit.disabled).toBe(false);

    await act(async () => submit.click());
    expect(settingsApi.createLiveAgentKey).toHaveBeenCalledWith("workspace-1", {
      label: "Rafa",
      scopes: ["diario:escrever"],
    });
    expect(
      container.querySelector<HTMLInputElement>(
        "input[aria-label='Chave do agente']",
      )?.value,
    ).toBe("mend_agent_secret");
    expect(container.textContent).toContain("Chave criada para Rafa");
    expect(
      Array.from(container.querySelectorAll("input")).map(
        (input) => input.value,
      ),
    ).toContain(mcpServerUrl());
    expect(mcpServerUrl("https://app.techneia.com.br")).toBe(
      "https://app.techneia.com.br/mcp",
    );

    await act(async () => button("Já copiei")!.click());
    expect(container.textContent).not.toContain("mend_agent_secret");
  });

  it("asks before revoking and removes the key after confirmation", async () => {
    vi.mocked(settingsApi.listLiveAgentKeys).mockResolvedValue([maria]);
    vi.mocked(settingsApi.revokeLiveAgentKey).mockResolvedValue();
    const confirm = vi.fn(async () => false);
    const { toast } = await render(confirm);

    const revoke = container.querySelector<HTMLButtonElement>(
      "button[aria-label='Revogar a chave de Maria']",
    )!;
    await act(async () => revoke.click());
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true }),
    );
    expect(settingsApi.revokeLiveAgentKey).not.toHaveBeenCalled();

    confirm.mockResolvedValueOnce(true);
    await act(async () => revoke.click());
    expect(settingsApi.revokeLiveAgentKey).toHaveBeenCalledWith(
      "workspace-1",
      "key-1",
    );
    expect(toast).toHaveBeenCalledWith("Chave revogada");
    expect(container.textContent).toContain("Nenhuma chave ativa");
  });

  it("explains that only owners and admins manage agent keys", async () => {
    vi.mocked(settingsApi.listLiveAgentKeys).mockRejectedValue(
      new LiveActionError("forbidden", 403),
    );
    await render();
    expect(container.querySelector("[role=alert]")?.textContent).toContain(
      "Só donos e admins do workspace podem gerenciar as chaves de agente.",
    );
  });
});
