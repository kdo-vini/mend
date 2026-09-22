import { describe, expect, it } from "vitest";
import type { WorkspaceNotification } from "../../api/notifications";
import { notificationCopyKeys } from "./notification-copy";

const base = (
  kind: string,
  payload: WorkspaceNotification["payload_json"] = {},
): WorkspaceNotification =>
  ({
    kind,
    title: "English title",
    body: "English body",
    payload_json: payload,
  }) as WorkspaceNotification;

describe("notificationCopyKeys", () => {
  it("maps AI human escalation to i18n keys", () => {
    expect(
      notificationCopyKeys(
        base("ai.human_escalation", {
          summary: "Cliente pediu renovação",
          i18n: {
            params: { summary: "Cliente pediu renovação" },
          },
        }),
      ),
    ).toEqual({
      titleKey: "aiHumanEscalationTitle",
      bodyKey: "aiHumanEscalationBody",
      params: { summary: "Cliente pediu renovação" },
    });
  });

  it("maps agent ready fix variant", () => {
    expect(
      notificationCopyKeys(
        base("ai.agent_ready", {
          i18n: {
            params: { identifier: "TEC-1", fixReady: true },
          },
        }),
      ),
    ).toEqual({
      titleKey: "aiAgentFixReadyTitle",
      bodyKey: "aiAgentFixReadyBody",
      params: { identifier: "TEC-1" },
    });
  });
});
