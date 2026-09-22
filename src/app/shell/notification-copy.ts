import type { WorkspaceNotification } from "../../api/notifications";

export type NotificationCopyParams = {
  summary?: string;
  identifier?: string;
  detail?: string;
  fixReady?: boolean;
  fixStarted?: boolean;
  startFailed?: boolean;
};

export type NotificationCopyKeys = {
  titleKey: string;
  bodyKey: string;
  params: NotificationCopyParams;
};

function payloadParams(
  payload: WorkspaceNotification["payload_json"],
): NotificationCopyParams {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return {};
  const row = payload as Record<string, unknown>;
  const i18n =
    row.i18n && typeof row.i18n === "object" && !Array.isArray(row.i18n)
      ? (row.i18n as Record<string, unknown>)
      : null;
  const params =
    i18n?.params && typeof i18n.params === "object" && !Array.isArray(i18n.params)
      ? (i18n.params as Record<string, unknown>)
      : row;
  return {
    ...(typeof params.summary === "string" ? { summary: params.summary } : {}),
    ...(typeof params.identifier === "string"
      ? { identifier: params.identifier }
      : {}),
    ...(typeof params.detail === "string" ? { detail: params.detail } : {}),
    ...(typeof params.fixReady === "boolean"
      ? { fixReady: params.fixReady }
      : {}),
    ...(typeof params.fixStarted === "boolean"
      ? { fixStarted: params.fixStarted }
      : {}),
    ...(typeof params.startFailed === "boolean"
      ? { startFailed: params.startFailed }
      : {}),
  };
}

/** Maps persisted notification kinds to the notifications i18n catalog. */
export function notificationCopyKeys(
  notification: WorkspaceNotification,
): NotificationCopyKeys | null {
  const params = payloadParams(notification.payload_json);
  switch (notification.kind) {
    case "conversation_message":
      return {
        titleKey: "conversationMessageTitle",
        bodyKey: "conversationMessageBody",
        params: {},
      };
    case "ai.human_escalation":
      return {
        titleKey: "aiHumanEscalationTitle",
        bodyKey: "aiHumanEscalationBody",
        params: {
          summary: params.summary ?? notification.body,
        },
      };
    case "ai.bug_reported":
      return {
        titleKey: "aiBugReportedTitle",
        bodyKey: "aiBugReportedBody",
        params: {
          identifier: params.identifier ?? "",
          summary: params.summary ?? notification.body,
        },
      };
    case "ai.agent_started":
      return {
        titleKey: params.fixStarted
          ? "aiAgentFixStartedTitle"
          : "aiAgentStartedTitle",
        bodyKey: params.fixStarted
          ? "aiAgentFixStartedBody"
          : "aiAgentStartedBody",
        params: { identifier: params.identifier ?? "" },
      };
    case "ai.agent_ready":
      return {
        titleKey: params.fixReady
          ? "aiAgentFixReadyTitle"
          : "aiAgentReadyTitle",
        bodyKey: params.fixReady
          ? "aiAgentFixReadyBody"
          : "aiAgentReadyBody",
        params: { identifier: params.identifier ?? "" },
      };
    case "ai.agent_failed":
      return {
        titleKey: params.startFailed
          ? "aiAgentStartFailedTitle"
          : "aiAgentFailedTitle",
        bodyKey: params.startFailed
          ? "aiAgentStartFailedBody"
          : "aiAgentFailedBody",
        params: {
          identifier: params.identifier ?? "",
          detail: params.detail ?? notification.body,
        },
      };
    case "support_ai_configuration_required":
      return {
        titleKey: "supportAiConfigurationTitle",
        bodyKey: "supportAiConfigurationBody",
        params: {},
      };
    default:
      return null;
  }
}
