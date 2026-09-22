import { describe, expect, it, vi } from "vitest";
import { isCatalogMutationIntent } from "./catalog-intent.js";
import {
  isConfirmWord,
  isNoConfirmWord,
  isYesConfirmWord,
} from "./confirm-words.js";
import {
  runZeloPdvGerenteBridge,
  shouldBridgeToZeloPdvGerente,
} from "./bridge.js";
import type { ZeloPdvGerenteClient } from "./client.js";
import type { ConversationPendingActionStore } from "../../adapters/supabase/pending-actions.js";
import type { LiveWorkerAutomationInput } from "../../live-worker.js";

describe("zelopdv gerente confirm words", () => {
  it("accepts the same yes/no vocabulary as Zelinho", () => {
    expect(isYesConfirmWord("sim")).toBe(true);
    expect(isYesConfirmWord("Confirmo")).toBe(true);
    expect(isNoConfirmWord("não")).toBe(true);
    expect(isNoConfirmWord("cancelar")).toBe(true);
    expect(isConfirmWord("talvez")).toBe(false);
  });
});

describe("isCatalogMutationIntent", () => {
  it("detects delete/edit catalog asks", () => {
    expect(isCatalogMutationIntent('exclui o produto "mini pizza"')).toBe(true);
    expect(isCatalogMutationIntent("apagar produto refri")).toBe(true);
    expect(isCatalogMutationIntent("alterar o preço do pudim")).toBe(true);
    expect(isCatalogMutationIntent("como cadastrar produtos?")).toBe(false);
    expect(isCatalogMutationIntent("quero renovar o plano")).toBe(false);
  });
});

describe("shouldBridgeToZeloPdvGerente", () => {
  it("bridges catalog mutations and confirm words", () => {
    expect(
      shouldBridgeToZeloPdvGerente({
        text: "exclui o produto mini pizza",
        hasLocalPending: false,
      }),
    ).toBe(true);
    expect(
      shouldBridgeToZeloPdvGerente({ text: "sim", hasLocalPending: true }),
    ).toBe(true);
    expect(
      shouldBridgeToZeloPdvGerente({ text: "sim", hasLocalPending: false }),
    ).toBe(true);
  });
});

describe("runZeloPdvGerenteBridge", () => {
  const automationInput = {
    binding: { workspaceId: "ws-1" },
    persisted: { conversationId: "conv-1", id: "msg-1" },
    idempotencyKey: "idem-1",
  } as LiveWorkerAutomationInput;

  it("creates local pending and appends Sim/Não options", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => null),
      create: vi.fn(async (row) => ({ id: "local-1", ...row })),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      sendMessage: vi.fn(async () => ({
        reply: 'Preparei a exclusão de "Mini pizza".',
        pending_action: {
          id: "ext-1",
          summary: 'Excluir "Mini pizza"',
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        },
        paired: true,
      })),
    } as unknown as ZeloPdvGerenteClient;

    const result = await runZeloPdvGerenteBridge({
      automationInput,
      text: "exclui o produto mini pizza",
      phone: "5511999999999",
      pendingStore,
      client,
    });

    expect(result?.pendingCreated).toBe(true);
    expect(result?.reply).toContain("[[opcoes: Sim | Não]]");
    expect(pendingStore.create).toHaveBeenCalledOnce();
    expect(client.sendMessage).toHaveBeenCalledWith({
      phone: "5511999999999",
      text: "exclui o produto mini pizza",
      kind: "message",
    });
  });

  it("confirms remote pending on sim and marks local executed", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => ({
        id: "local-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        externalActionId: "ext-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      create: vi.fn(),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      sendMessage: vi.fn(async () => ({
        reply: 'Excluí "Mini pizza".',
        pending_action: null,
        paired: true,
      })),
    } as unknown as ZeloPdvGerenteClient;

    const result = await runZeloPdvGerenteBridge({
      automationInput,
      text: "sim",
      phone: "5511999999999",
      pendingStore,
      client,
    });

    expect(result?.pendingCreated).toBe(false);
    expect(result?.reply).toBe('Excluí "Mini pizza".');
    expect(client.sendMessage).toHaveBeenCalledWith({
      phone: "5511999999999",
      text: "sim",
      kind: "confirm",
      actionId: "ext-1",
    });
    expect(pendingStore.markStatus).toHaveBeenCalledWith(
      "local-1",
      "ws-1",
      "executed",
      expect.any(Object),
    );
  });

  it("does not steal a bare sim from an unpaired support contact", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => null),
      create: vi.fn(),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      sendMessage: vi.fn(async () => ({
        reply: "Oi! Para conversar, me mande o código.",
        pending_action: null,
        paired: false,
      })),
    } as unknown as ZeloPdvGerenteClient;

    const result = await runZeloPdvGerenteBridge({
      automationInput,
      text: "sim",
      phone: "5511888888888",
      pendingStore,
      client,
    });

    expect(result).toBeNull();
    expect(client.sendMessage).toHaveBeenCalledOnce();
  });
});