export type GuidedHowToStatus =
  | "awaiting_confirmation"
  | "in_progress"
  | "completed";

export type GuidedHowToState = {
  status: GuidedHowToStatus;
  step: number;
  topic: string;
};

export function readGuidedHowToState(value: unknown): GuidedHowToState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!row.topic || typeof row.topic !== "string") return null;
  if (
    row.status !== "awaiting_confirmation" &&
    row.status !== "in_progress" &&
    row.status !== "completed"
  )
    return null;
  return {
    status: row.status,
    step:
      typeof row.step === "number" && Number.isFinite(row.step)
        ? Math.max(1, Math.floor(row.step))
        : 1,
    topic: row.topic.slice(0, 500),
  };
}

export function initialGuidedHowToState(topic: string): GuidedHowToState {
  return {
    status: "awaiting_confirmation",
    step: 1,
    topic: topic.slice(0, 500),
  };
}

export function advanceGuidedHowToState(
  state: GuidedHowToState,
  text: string,
): GuidedHowToState {
  const normalized = text.trim().toLocaleLowerCase("pt-BR");
  if (/^(?:n[aã]o|parar|cancelar|depois|agora n[aã]o)$/.test(normalized)) {
    return { ...state, status: "completed" };
  }
  if (state.status === "awaiting_confirmation") {
    if (/^(?:sim|s|yes|y|pode|quero)$/.test(normalized)) {
      return { ...state, status: "in_progress", step: 1 };
    }
    return state;
  }
  if (state.status !== "in_progress") return state;
  return { ...state, step: state.step + 1 };
}
