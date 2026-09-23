import type { SupportedLocale } from "../locale.js";

export type NotificationCopyParams = {
  summary?: string;
  identifier?: string;
  detail?: string;
  fixReady?: boolean;
  fixStarted?: boolean;
  startFailed?: boolean;
};

export type LocalizedNotificationCopy = {
  title: string;
  body: string;
  titleKey: string;
  bodyKey: string;
  params: NotificationCopyParams;
};

function interpolate(template: string, params: NotificationCopyParams): string {
  return template
    .replace(/\{\{summary\}\}/g, params.summary ?? "")
    .replace(/\{\{identifier\}\}/g, params.identifier ?? "")
    .replace(/\{\{detail\}\}/g, params.detail ?? "");
}

const catalogs: Record<
  SupportedLocale,
  Record<string, { title: string; body: string }>
> = {
  "pt-BR": {
    "ai.human_escalation": {
      title: "IA encaminhou para atendimento humano",
      body: "A conversa precisa de você: {{summary}}",
    },
    "ai.bug_reported": {
      title: "Bug reportado em {{identifier}}",
      body: "Um cliente relatou um possível bug: {{summary}}",
    },
    "ai.agent_started": {
      title: "Agente iniciado para {{identifier}}",
      body: "A investigação automática começou. A publicação ainda exige revisão.",
    },
    "ai.agent_fix_started": {
      title: "Correção automática iniciada para {{identifier}}",
      body: "A execução está implementando a correção. A publicação ainda exige revisão.",
    },
    "ai.agent_ready": {
      title: "Investigação pronta para {{identifier}}",
      body: "A evidência e o veredito estão prontos para revisão humana.",
    },
    "ai.agent_fix_ready": {
      title: "Correção pronta para {{identifier}}",
      body: "Revise o patch e as verificações antes de publicar.",
    },
    "ai.agent_failed": {
      title: "Falha na investigação de {{identifier}}",
      body: "A investigação automática não pôde ser concluída: {{detail}}",
    },
    "ai.agent_start_failed": {
      title: "Não foi possível iniciar o agente para {{identifier}}",
      body: "Configure um repositório antes das correções automáticas: {{detail}}",
    },
    support_ai_configuration_required: {
      title: "Configuração da IA de suporte necessária",
      body: "Configure a credencial e os modelos de suporte do espaço de trabalho e retome a IA.",
    },
    conversation_message: {
      title: "Nova mensagem no WhatsApp",
      body: "Uma conversa atribuída a você precisa de atenção.",
    },
    "ai.conversation_assigned": {
      title: "Conversa atribuída a você",
      body: "Uma conversa precisa da sua atenção.",
    },
    "ai.assignment_waiting": {
      title: "Conversa aguardando responsável",
      body: "Não há uma pessoa ativa disponível para assumir esta conversa.",
    },
  },
  "en-US": {
    "ai.human_escalation": {
      title: "AI escalated to a human",
      body: "This conversation needs you: {{summary}}",
    },
    "ai.bug_reported": {
      title: "Bug reported in {{identifier}}",
      body: "A customer reported a possible bug: {{summary}}",
    },
    "ai.agent_started": {
      title: "Coding agent started for {{identifier}}",
      body: "Automatic investigation started. Publication still requires review.",
    },
    "ai.agent_fix_started": {
      title: "Automatic fix started for {{identifier}}",
      body: "The run is implementing the fix. Publication still requires review.",
    },
    "ai.agent_ready": {
      title: "Investigation ready for {{identifier}}",
      body: "Evidence and verdict are ready for human review.",
    },
    "ai.agent_fix_ready": {
      title: "Fix ready for {{identifier}}",
      body: "Review the patch and checks before publishing.",
    },
    "ai.agent_failed": {
      title: "Investigation failed for {{identifier}}",
      body: "Automatic investigation could not finish: {{detail}}",
    },
    "ai.agent_start_failed": {
      title: "Could not start the agent for {{identifier}}",
      body: "Configure a repository before automatic fixes: {{detail}}",
    },
    support_ai_configuration_required: {
      title: "Support AI configuration required",
      body: "Configure the workspace support credential and models, then resume AI.",
    },
    conversation_message: {
      title: "New WhatsApp message",
      body: "A conversation assigned to you needs attention.",
    },
    "ai.conversation_assigned": {
      title: "Conversation assigned to you",
      body: "A conversation needs your attention.",
    },
    "ai.assignment_waiting": {
      title: "Conversation waiting for an assignee",
      body: "No active team member is available to take this conversation.",
    },
  },
};

const titleKeys: Record<string, string> = {
  "ai.human_escalation": "aiHumanEscalationTitle",
  "ai.bug_reported": "aiBugReportedTitle",
  "ai.agent_started": "aiAgentStartedTitle",
  "ai.agent_fix_started": "aiAgentFixStartedTitle",
  "ai.agent_ready": "aiAgentReadyTitle",
  "ai.agent_fix_ready": "aiAgentFixReadyTitle",
  "ai.agent_failed": "aiAgentFailedTitle",
  "ai.agent_start_failed": "aiAgentStartFailedTitle",
  support_ai_configuration_required: "supportAiConfigurationTitle",
  conversation_message: "conversationMessageTitle",
  "ai.conversation_assigned": "aiConversationAssignedTitle",
  "ai.assignment_waiting": "aiAssignmentWaitingTitle",
};

const bodyKeys: Record<string, string> = {
  "ai.human_escalation": "aiHumanEscalationBody",
  "ai.bug_reported": "aiBugReportedBody",
  "ai.agent_started": "aiAgentStartedBody",
  "ai.agent_fix_started": "aiAgentFixStartedBody",
  "ai.agent_ready": "aiAgentReadyBody",
  "ai.agent_fix_ready": "aiAgentFixReadyBody",
  "ai.agent_failed": "aiAgentFailedBody",
  "ai.agent_start_failed": "aiAgentStartFailedBody",
  support_ai_configuration_required: "supportAiConfigurationBody",
  conversation_message: "conversationMessageBody",
  "ai.conversation_assigned": "aiConversationAssignedBody",
  "ai.assignment_waiting": "aiAssignmentWaitingBody",
};

function resolveCatalogKind(
  kind: string,
  params: NotificationCopyParams,
): string {
  if (kind === "ai.agent_ready" && params.fixReady) return "ai.agent_fix_ready";
  if (kind === "ai.agent_started" && params.fixStarted)
    return "ai.agent_fix_started";
  if (kind === "ai.agent_failed" && params.startFailed)
    return "ai.agent_start_failed";
  return kind;
}

export function buildNotificationCopy(
  kind: string,
  locale: SupportedLocale,
  params: NotificationCopyParams = {},
): LocalizedNotificationCopy | null {
  const catalogKind = resolveCatalogKind(kind, params);
  const entry = catalogs[locale][catalogKind] ?? catalogs["en-US"][catalogKind];
  if (!entry) return null;
  return {
    title: interpolate(entry.title, params),
    body: interpolate(entry.body, params),
    titleKey: titleKeys[catalogKind] ?? "workspaceNotificationFallback",
    bodyKey: bodyKeys[catalogKind] ?? "workspaceNotificationFallback",
    params,
  };
}
