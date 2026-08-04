import { z } from "zod";
import type { SupportAiProvider } from "./providers.js";

export const TriageIntentSchema = z.enum([
  "question",
  "how_to",
  "status",
  "bug",
  "incident",
  "billing",
  "feature",
  "other",
]);

export const TriagePrioritySchema = z.enum([
  "urgent",
  "high",
  "medium",
  "low",
  "no_priority",
]);

export const TriageResultSchema = z.object({
  intent: TriageIntentSchema,
  priority: TriagePrioritySchema,
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1).max(2_000),
  unsafe: z.boolean().default(false),
  unsafeReason: z.string().trim().max(500).optional(),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;
export type AiMode = "off" | "draft" | "safe_auto";
export type AiAction = "off" | "draft" | "auto_reply" | "blocked";

export interface AiGateDecision {
  action: AiAction;
  allowed: boolean;
  reason: string;
}

export class TriageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TriageValidationError";
  }
}

const safeAutoIntents = new Set<TriageResult["intent"]>([
  "question",
  "how_to",
  "status",
]);
const unsafeRequestPattern =
  /\b(password|passcode|api[ -]?key|secret|token|credential|credit card|card number|cvv|one[ -]?time code|otp|bypass|disable security|drop database|delete all|wire transfer)\b/i;

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw))
    return raw as Record<string, unknown>;
  if (typeof raw !== "string")
    throw new TriageValidationError("AI triage output must be a JSON object");

  const withoutFence = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start)
    throw new TriageValidationError(
      "AI triage output did not contain a JSON object",
    );

  try {
    const parsed: unknown = JSON.parse(withoutFence.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new TriageValidationError("AI triage output contained invalid JSON");
  }
}

function normalizeOutput(raw: unknown): Record<string, unknown> {
  const value = parseJsonObject(raw);
  const intent =
    typeof value.intent === "string"
      ? value.intent.trim().toLowerCase().replace(/[ -]+/g, "_")
      : value.intent;
  const priority =
    typeof value.priority === "string"
      ? value.priority.trim().toLowerCase().replace(/[ -]+/g, "_")
      : value.priority;
  return { ...value, intent, priority };
}

export function parseTriageOutput(raw: unknown): TriageResult {
  const parsed = TriageResultSchema.safeParse(normalizeOutput(raw));
  if (!parsed.success)
    throw new TriageValidationError(
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
  return parsed.data;
}

export function isUnsafeRequest(conversation: string): boolean {
  return unsafeRequestPattern.test(conversation);
}

export async function triageConversation(
  provider: SupportAiProvider,
  conversation: string,
): Promise<TriageResult> {
  const result = parseTriageOutput(await provider.triage(conversation));
  if (!result.unsafe && isUnsafeRequest(conversation)) {
    return {
      ...result,
      unsafe: true,
      unsafeReason:
        result.unsafeReason ??
        "The conversation contains a sensitive or destructive request.",
    };
  }
  return result;
}

export function gateAiAction(
  mode: AiMode,
  triage: TriageResult,
  safeAutoConfidence = 0.85,
): AiGateDecision {
  if (mode === "off")
    return {
      action: "off",
      allowed: false,
      reason: "AI is disabled for this conversation.",
    };
  if (triage.unsafe)
    return {
      action: "blocked",
      allowed: false,
      reason: triage.unsafeReason ?? "Unsafe request requires a human.",
    };
  if (mode === "draft")
    return {
      action: "draft",
      allowed: true,
      reason: "Draft is available for human review.",
    };
  if (triage.confidence < safeAutoConfidence) {
    return {
      action: "blocked",
      allowed: false,
      reason: `Confidence ${triage.confidence.toFixed(2)} is below the safe-auto threshold.`,
    };
  }
  if (!safeAutoIntents.has(triage.intent)) {
    return {
      action: "blocked",
      allowed: false,
      reason: `Intent ${triage.intent} is not eligible for safe auto-reply.`,
    };
  }
  return {
    action: "auto_reply",
    allowed: true,
    reason: "High-confidence low-risk intent is eligible for safe auto-reply.",
  };
}
