import type { TriageResult } from "../../triage.js";
import type { LiveWorkerAutomationInput } from "../../live-worker.js";
import type { ConversationPendingActionStore } from "../../adapters/supabase/pending-actions.js";
import {
  createZeloPdvCatalogClientFromEnv,
  type ZeloPdvCatalogClient,
  type ZeloPdvCatalogPreview,
} from "./catalog-client.js";
import {
  extractCatalogDeleteTerm,
  isCatalogDeleteIntent,
  isPairingCode,
} from "./catalog-intent.js";
import {
  isConfirmWord,
  isNoConfirmWord,
  isYesConfirmWord,
} from "./confirm-words.js";

export type CatalogFlowOutcome = {
  reply: string;
  triage: TriageResult;
  pendingCreated: boolean;
};

const PAIRING_HELP =
  "Para eu alterar o cadastro da loja por aqui, vincule este WhatsApp no ZeloPDV em Gestão > Zelinho Gerente > Preferências (Conectar no WhatsApp) e me envie o código de 6 dígitos.";

function triage(summary: string): TriageResult {
  return {
    intent: "how_to",
    priority: "medium",
    confidence: 0.99,
    summary,
    unsafe: false,
  };
}

function confirmPrompt(preview: ZeloPdvCatalogPreview): string {
  const names = [
    ...(preview.excluir ?? []).map((row) => row.nome),
    ...(preview.arquivar ?? []).map((row) => row.nome),
  ];
  const label =
    names.length === 1
      ? `"${names[0]}"`
      : `${names.length} itens (${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""})`;
  const detailParts: string[] = [];
  if (preview.excluir?.length)
    detailParts.push(`${preview.excluir.length} serão excluídos`);
  if (preview.arquivar?.length)
    detailParts.push(
      `${preview.arquivar.length} serão arquivados (já tiveram venda/comanda)`,
    );
  const detail = detailParts.length ? ` ${detailParts.join("; ")}.` : "";
  return `Confirma remover ${label} do cadastro?${detail}\n\n[[opcoes: Sim | Não]]`;
}

function summarizeExecute(result: Record<string, unknown> | undefined): string {
  const deleted = Array.isArray(result?.excluidos) ? result.excluidos.length : 0;
  const archived = Array.isArray(result?.arquivados)
    ? result.arquivados.length
    : 0;
  return `Pronto. ${deleted} produto(s) excluído(s) e ${archived} arquivado(s).`;
}

export async function runMendCatalogDeleteFlow(input: {
  automationInput: LiveWorkerAutomationInput;
  text: string;
  phone: string;
  pendingStore: ConversationPendingActionStore;
  client?: ZeloPdvCatalogClient | null;
  now?: Date;
}): Promise<CatalogFlowOutcome | null> {
  const client = input.client ?? createZeloPdvCatalogClientFromEnv();
  if (!client) return null;
  if (
    !client.isEnabledForWorkspace(input.automationInput.binding.workspaceId)
  )
    return null;

  const now = input.now ?? new Date();
  const text = input.text.trim();
  let pending = null as Awaited<
    ReturnType<ConversationPendingActionStore["getPending"]>
  >;
  try {
    pending = await input.pendingStore.getPending(
      input.automationInput.binding.workspaceId,
      input.automationInput.persisted.conversationId,
      now,
    );
  } catch {
    pending = null;
  }

  if (pending && isConfirmWord(text)) {
    const args = pending.argumentsJson as {
      produto_ids?: number[];
      categoria_ids?: number[];
      phone?: string;
    };
    if (isNoConfirmWord(text)) {
      try {
        await input.pendingStore.markStatus(
          pending.id,
          input.automationInput.binding.workspaceId,
          "cancelled",
        );
      } catch {
        // best-effort
      }
      return {
        reply: "Cancelado. Nada foi alterado no cadastro.",
        triage: triage("Owner cancelled a pending catalog delete."),
        pendingCreated: false,
      };
    }
    if (isYesConfirmWord(text)) {
      const executed = await client.call("execute_delete", {
        phone: args.phone ?? input.phone,
        produto_ids: args.produto_ids ?? [],
        categoria_ids: args.categoria_ids ?? [],
      });
      try {
        await input.pendingStore.markStatus(
          pending.id,
          input.automationInput.binding.workspaceId,
          executed.ok ? "executed" : "failed",
          { result: executed.result ?? null, code: executed.code },
        );
      } catch {
        // best-effort
      }
      if (!executed.ok) {
        return {
          reply:
            executed.code === "NOT_PAIRED"
              ? PAIRING_HELP
              : executed.error ||
                "Não consegui concluir a exclusão agora. Tente de novo em instantes.",
          triage: triage("Catalog delete execution failed."),
          pendingCreated: false,
        };
      }
      return {
        reply: summarizeExecute(executed.result),
        triage: triage("Catalog delete executed after owner confirmation."),
        pendingCreated: false,
      };
    }
  }

  if (isPairingCode(text)) {
    const paired = await client.call("pair", {
      phone: input.phone,
      code: text,
    });
    if (!paired.ok) {
      return {
        reply:
          "Não consegui validar esse código. Gere um novo em Gestão > Zelinho Gerente > Preferências e me envie de novo.",
        triage: triage("Catalog pairing code rejected."),
        pendingCreated: false,
      };
    }
    return {
      reply:
        "WhatsApp vinculado. Pode me pedir, por exemplo: exclui o produto Mini pizza.",
      triage: triage("Catalog WhatsApp pairing completed."),
      pendingCreated: false,
    };
  }

  if (!isCatalogDeleteIntent(text)) return null;

  const term = extractCatalogDeleteTerm(text);
  if (!term) {
    return {
      reply:
        'Me diga qual produto remover, por exemplo: exclui o produto "Mini pizza".',
      triage: triage("Catalog delete missing product name."),
      pendingCreated: false,
    };
  }

  const resolved = await client.call("resolve", { phone: input.phone });
  if (!resolved.ok || !resolved.paired) {
    return {
      reply: PAIRING_HELP,
      triage: triage("Catalog delete blocked until WhatsApp is paired."),
      pendingCreated: false,
    };
  }

  const search = await client.call("search", {
    phone: input.phone,
    termo: term,
    limite: 5,
  });
  if (!search.ok) {
    return {
      reply: search.error || "Não consegui consultar o catálogo agora.",
      triage: triage("Catalog search failed."),
      pendingCreated: false,
    };
  }
  const products = search.produtos ?? [];
  if (!products.length) {
    return {
      reply: `Não encontrei nenhum produto com o nome "${term}". Confira o cadastro e tente de novo.`,
      triage: triage("Catalog delete product not found."),
      pendingCreated: false,
    };
  }
  if (products.length > 1) {
    const list = products
      .map((product, index) => `${index + 1}. ${product.nome}`)
      .join("\n");
    return {
      reply: `Encontrei mais de um produto. Qual você quer remover?\n${list}\n\nResponda com o nome exato.`,
      triage: triage("Catalog delete needs product disambiguation."),
      pendingCreated: false,
    };
  }

  const product = products[0]!;
  const prepared = await client.call("prepare_delete", {
    phone: input.phone,
    produto_ids: [product.id],
  });
  if (!prepared.ok || !prepared.preview) {
    return {
      reply:
        prepared.error ||
        "Não consegui preparar a exclusão desse produto agora.",
      triage: triage("Catalog delete prepare failed."),
      pendingCreated: false,
    };
  }

  const preview = prepared.preview;
  try {
    await input.pendingStore.create({
      workspaceId: input.automationInput.binding.workspaceId,
      conversationId: input.automationInput.persisted.conversationId,
      ownerRef: input.phone,
      toolName: "excluir_catalogo",
      argumentsJson: {
        phone: input.phone,
        produto_ids: preview.produto_ids,
        categoria_ids: preview.categoria_ids ?? [],
        productName: product.nome,
      },
      summary: `Remover ${product.nome}`,
      idempotencyKey: `catalog-delete:${input.automationInput.persisted.conversationId}:${product.id}:${input.automationInput.persisted.id}`,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
    });
  } catch {
    // Confirmation can still proceed if create failed only when table missing;
    // without persistence, Sim/Não cannot execute — surface that clearly.
    return {
      reply:
        "Preparei a exclusão, mas não consegui registrar a confirmação. Tente de novo em instantes.",
      triage: triage("Catalog pending persistence failed."),
      pendingCreated: false,
    };
  }

  return {
    reply: confirmPrompt(preview),
    triage: triage("Catalog delete awaiting owner Sim/Não confirmation."),
    pendingCreated: true,
  };
}
