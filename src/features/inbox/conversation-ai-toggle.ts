import type { AiMode, AutomationState } from "../../types";

interface ConversationAiAxes {
  aiMode: AiMode;
  automationState: AutomationState;
}

/**
 * The conversation screen shows one "IA ativa" switch over the two stored
 * axes: on only while ai_mode is not off and no human has taken over.
 */
export function isConversationAiActive(conversation: ConversationAiAxes) {
  return (
    conversation.aiMode !== "off" &&
    conversation.automationState !== "human_paused"
  );
}

export interface ConversationAiToggleWrite {
  /** New ai_mode to persist, or undefined to leave the column untouched. */
  aiMode?: AiMode;
  /** Clear human_paused through the existing resume path. */
  resume: boolean;
}

/**
 * Minimal writes to move the switch to `active`; null when it already shows
 * that state. Off writes ai_mode=off only; on writes safe_auto and resumes a
 * human_paused conversation, skipping whichever axis is already in place.
 */
export function planConversationAiToggle(
  conversation: ConversationAiAxes,
  active: boolean,
): ConversationAiToggleWrite | null {
  if (isConversationAiActive(conversation) === active) return null;
  if (!active) return { aiMode: "off", resume: false };
  return {
    ...(conversation.aiMode === "safe_auto" ? {} : { aiMode: "safe_auto" }),
    resume: conversation.automationState === "human_paused",
  };
}
