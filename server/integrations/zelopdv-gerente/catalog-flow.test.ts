import { describe, expect, it, vi } from "vitest";
import {
  extractCatalogDeleteTerm,
  isCatalogDeleteIntent,
} from "./catalog-intent.js";
import { runMendCatalogDeleteFlow } from "./catalog-flow.js";
import type { ZeloPdvCatalogClient } from "./catalog-client.js";
import type { ConversationPendingActionStore } from "../../adapters/supabase/pending-actions.js";
import type { LiveWorkerAutomationInput } from "../../live-worker.js";

describe("catalog delete intent", () => {
  it("detects imperative deletes and ignores how-to questions", () => {
    expect(isCatalogDeleteIntent('exclui o produto "mini pizza"')).toBe(true);
    expect(isCatalogDeleteIntent("como excluo um produto?")).toBe(false);
    expect(extractCatalogDeleteTerm('exclui o produto "Mini pizza"')).toBe(
      "Mini pizza",
    );
  });
});

describe("runMendCatalogDeleteFlow", () => {
  const automationInput = {
    binding: { workspaceId: "ws-1" },
    persisted: { conversationId: "conv-1", id: "msg-1" },
    idempotencyKey: "idem-1",
  } as LiveWorkerAutomationInput;

  it("asks Sim/Não as Mend after preparing a delete", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "local-1" })),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      call: vi.fn(async (action: string) => {
        if (action === "resolve") return { ok: true, paired: true };
        if (action === "search")
          return { ok: true, produtos: [{ id: 9, nome: "Mini pizza" }] };
        if (action === "prepare_delete")
          return {
            ok: true,
            preview: {
              produto_ids: [9],
              categoria_ids: [],
              excluir: [{ id: 9, nome: "Mini pizza" }],
              arquivar: [],
            },
          };
        return { ok: false };
      }),
    } as unknown as ZeloPdvCatalogClient;

    const result = await runMendCatalogDeleteFlow({
      automationInput,
      text: 'exclui o produto "Mini pizza"',
      phone: "5511999999999",
      pendingStore,
      client,
    });

    expect(result?.pendingCreated).toBe(true);
    expect(result?.reply).toContain("Confirma remover");
    expect(result?.reply).toContain("[[opcoes: Sim | Não]]");
    expect(result?.reply).not.toMatch(/Eu sou o Zelinho/i);
  });

  it("executes on sim using Mend copy", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => ({
        id: "local-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        argumentsJson: {
          phone: "5511999999999",
          produto_ids: [9],
          categoria_ids: [],
        },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })),
      create: vi.fn(),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      call: vi.fn(async () => ({
        ok: true,
        result: { excluidos: [{ id: 9 }], arquivados: [] },
      })),
    } as unknown as ZeloPdvCatalogClient;

    const result = await runMendCatalogDeleteFlow({
      automationInput,
      text: "sim",
      phone: "5511999999999",
      pendingStore,
      client,
    });

    expect(result?.reply).toContain("Pronto.");
    expect(result?.reply).not.toMatch(/Zelinho Gerente/i);
    expect(client.call).toHaveBeenCalledWith(
      "execute_delete",
      expect.objectContaining({ produto_ids: [9] }),
    );
  });

  it("asks to pair without speaking as Zelinho", async () => {
    const pendingStore = {
      getPending: vi.fn(async () => null),
      create: vi.fn(),
      markStatus: vi.fn(),
    } as unknown as ConversationPendingActionStore;
    const client = {
      isEnabledForWorkspace: () => true,
      call: vi.fn(async () => ({ ok: false, code: "NOT_PAIRED", paired: false })),
    } as unknown as ZeloPdvCatalogClient;

    const result = await runMendCatalogDeleteFlow({
      automationInput,
      text: "exclui o produto mini pizza",
      phone: "5511888888888",
      pendingStore,
      client,
    });

    expect(result?.reply).toContain("vincule este WhatsApp");
    expect(result?.reply).not.toMatch(/Eu sou o Zelinho Gerente/i);
  });
});
