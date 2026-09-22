import type { TriageResult } from "../../triage.js";
import type { LiveWorkerAutomationInput } from "../../live-worker.js";
import type { ConversationPendingActionStore } from "../../adapters/supabase/pending-actions.js";
import {
  createZeloPdvGerenteClientFromEnv,
  type ZeloPdvGerenteClient,
  type ZeloPdvGerenteChannelResult,
} from "./client.js";
import { isCatalogMutationIntent } from "./catalog-intent.js";
import {
  isConfirmWord,
  isNoConfirmWord,
  isYesConfirmWord,
} from "./confirm-words.js";

export type GerenteBridgeOutcome = {
  reply: string;
  triage: TriageResult;
  pendingCreated: boolean;
  paired: boolean;
};

function appendConfirmOptions(reply: string): string {
  const trimmed = reply.trim();
  if (!trimmed) return trimmed;
  if (/\[\[opcoes:/i.test(trimmed) || /\bSim\s*\|\s*Não\b/i.test(trimmed))
    return trimmed;
  return `${trimmed}\n\n[[opcoes: Sim | Não]]`;
}

export function shouldBridgeToZeloPdvGerente(input: {
  text: string;
  hasLocalPending: boolean;
}): boolean {
  if (isCatalogMutationIntent(input.text)) return true;
  // Zelinho keeps pending by paired phone; bare Sim/Não must try the channel.
  if (isConfirmWord(input.text)) return true;
  return input.hasLocalPending;
}

export async function runZeloPdvGerenteBridge(input: {
  automationInput: LiveWorkerAutomationInput;
  text: string;
  phone: string;
  pendingStore: ConversationPendingActionStore;
  client?: ZeloPdvGerenteClient | null;
  now?: Date;
}): Promise<GerenteBridgeOutcome | null> {
  const client = input.client ?? createZeloPdvGerenteClientFromEnv();
  if (!client) return null;
  if (
    !client.isEnabledForWorkspace(input.automationInput.binding.workspaceId)
  )
    return null;

  const now = input.now ?? new Date();
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
    // Table may not be migrated yet; Zelinho session pending still works by phone.
    pending = null;
  }

  if (
    !shouldBridgeToZeloPdvGerente({
      text: input.text,
      hasLocalPending: Boolean(pending),
    })
  )
    return null;

  let remote: ZeloPdvGerenteChannelResult;
  try {
    if (pending?.externalActionId && isYesConfirmWord(input.text)) {
      remote = await client.sendMessage({
        phone: input.phone,
        text: input.text,
        kind: "confirm",
        actionId: pending.externalActionId,
      });
    } else if (pending?.externalActionId && isNoConfirmWord(input.text)) {
      remote = await client.sendMessage({
        phone: input.phone,
        text: input.text,
        kind: "cancel",
        actionId: pending.externalActionId,
      });
    } else {
      remote = await client.sendMessage({
        phone: input.phone,
        text: input.text,
        kind: "message",
      });
    }
  } catch {
    return null;
  }

  // Unpaired confirm words must not steal normal support turns.
  if (!remote.paired && isConfirmWord(input.text) && !isCatalogMutationIntent(input.text))
    return null;
  if (!remote.reply) return null;

  let pendingCreated = false;
  if (remote.pending_action?.id) {
    const expiresAt = remote.pending_action.expires_at
      ? new Date(remote.pending_action.expires_at)
      : new Date(now.getTime() + 10 * 60_000);
    try {
      await input.pendingStore.create({
        workspaceId: input.automationInput.binding.workspaceId,
        conversationId: input.automationInput.persisted.conversationId,
        ownerRef: input.phone,
        toolName: "zelopdv_gerente_pending",
        argumentsJson: { phone: input.phone },
        summary:
          remote.pending_action.summary?.trim() ||
          remote.reply.slice(0, 240) ||
          "Confirmação pendente no ZeloPDV",
        externalActionId: remote.pending_action.id,
        idempotencyKey: `gerente:${remote.pending_action.id}`,
        expiresAt,
      });
      pendingCreated = true;
    } catch {
      pendingCreated = Boolean(remote.pending_action?.id);
    }
  } else if (pending && isConfirmWord(input.text)) {
    try {
      await input.pendingStore.markStatus(
        pending.id,
        input.automationInput.binding.workspaceId,
        isYesConfirmWord(input.text) ? "executed" : "cancelled",
        { reply: remote.reply, paired: remote.paired },
      );
    } catch {
      // best-effort local audit
    }
  }

  // Even without local row, a remote pending still needs Sim/Não affordance.
  const hasRemotePending = Boolean(remote.pending_action?.id);
  const reply =
    pendingCreated || hasRemotePending
      ? appendConfirmOptions(remote.reply)
      : remote.reply.trim();

  const triage: TriageResult = {
    intent: "how_to",
    priority: "medium",
    confidence: 0.99,
    summary:
      pendingCreated || hasRemotePending
        ? "Catalog change awaiting owner confirmation via ZeloPDV Gerente."
        : "Catalog change handled by ZeloPDV Gerente.",
    unsafe: false,
  };

  return {
    reply,
    triage,
    pendingCreated: pendingCreated || hasRemotePending,
    paired: remote.paired,
  };
}
