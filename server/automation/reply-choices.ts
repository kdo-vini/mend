export type AiReplyChoice = {
  id: string;
  label: string;
};

const MAX_BUTTON_LABEL = 20;
const MAX_CHOICES = 3;

function slugId(label: string, index: number): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return slug || `choice_${index + 1}`;
}

function truncateLabel(label: string): string {
  const trimmed = label.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_BUTTON_LABEL) return trimmed;
  return `${trimmed.slice(0, MAX_BUTTON_LABEL - 1).trimEnd()}…`;
}

/** Normalize model-provided or heuristic choices for WhatsApp reply buttons. */
export function normalizeAiReplyChoices(value: unknown): AiReplyChoice[] {
  if (!Array.isArray(value)) return [];
  const choices: AiReplyChoice[] = [];
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (choices.length >= MAX_CHOICES) break;
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const labelRaw =
      typeof row.label === "string"
        ? row.label
        : typeof row.displayText === "string"
          ? row.displayText
          : typeof row.title === "string"
            ? row.title
            : "";
    const label = truncateLabel(labelRaw);
    if (!label) continue;
    const idRaw =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim().slice(0, 80)
        : slugId(label, index);
    let id = idRaw;
    if (seen.has(id)) id = `${id}_${index + 1}`;
    seen.add(id);
    choices.push({ id, label });
  }
  return choices.length >= 2 ? choices : [];
}

/** Strip "Responda 1 para… / reply with 1…" prompts once buttons will carry the options. */
export function stripNumericChoicePrompt(body: string): string {
  return body
    .replace(
      /\s*responda\s+1\s+para\s+.+?\s+ou\s+2\s+para\s+.+?(?:\.|$)/giu,
      "",
    )
    .replace(
      /\s*reply\s+(?:with\s+)?1\s+for\s+.+?\s+or\s+2\s+for\s+.+?(?:\.|$)/giu,
      "",
    )
    .replace(/\s*responda\s+[12]\b[^.?!]*[.?!]?\s*$/giu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Pull 2–3 choices out of common free-text clarification patterns so we can
 * upgrade "Responda 1 ou 2" into WhatsApp buttons.
 */
export function parseReplyChoicesFromBody(body: string): {
  body: string;
  choices: AiReplyChoice[];
} {
  const responda = body.match(
    /responda\s+1\s+para\s+(.+?)\s+ou\s+2\s+para\s+(.+?)(?:\.|$)/iu,
  );
  if (responda) {
    const choices = normalizeAiReplyChoices([
      { label: responda[1] },
      { label: responda[2] },
    ]);
    if (choices.length >= 2)
      return { body: stripNumericChoicePrompt(body), choices };
  }

  const replyFor = body.match(
    /reply\s+(?:with\s+)?1\s+for\s+(.+?)\s+or\s+2\s+for\s+(.+?)(?:\.|$)/iu,
  );
  if (replyFor) {
    const choices = normalizeAiReplyChoices([
      { label: replyFor[1] },
      { label: replyFor[2] },
    ]);
    if (choices.length >= 2)
      return { body: stripNumericChoicePrompt(body), choices };
  }

  const numbered: Array<{ index: number; label: string }> = [];
  const linePattern = /(?:^|\n)\s*(\d)[.)]\s+([^\n]+)/g;
  for (const match of body.matchAll(linePattern)) {
    const index = Number(match[1]);
    if (index < 1 || index > MAX_CHOICES) continue;
    numbered.push({ index, label: match[2].trim() });
  }
  if (numbered.length >= 2 && numbered.length <= MAX_CHOICES) {
    const firstChoiceLine = body.search(/(?:^|\n)\s*1[.)]\s+/);
    const lead = firstChoiceLine >= 0 ? body.slice(0, firstChoiceLine) : body;
    const hasExplicitChoiceCue =
      /\b(?:escolha|opç(?:ão|ões)|qual prefere|como prefere|quer .+\s+ou\s+|prefere .+\s+ou\s+)\b/iu.test(
        lead,
      );
    if (!hasExplicitChoiceCue) return { body, choices: [] };
    const choices = normalizeAiReplyChoices(
      numbered
        .sort((a, b) => a.index - b.index)
        .map((item) => ({ label: item.label })),
    );
    if (choices.length >= 2) {
      const cleaned = body
        .replace(/(?:^|\n)\s*\d[.)]\s+[^\n]+/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { body: cleaned || body, choices };
    }
  }

  return { body, choices: [] };
}

export function resolveAiReplyChoices(input: {
  body: string;
  structuredChoices?: unknown;
}): { body: string; choices: AiReplyChoice[] } {
  const structured = normalizeAiReplyChoices(input.structuredChoices);
  if (structured.length >= 2) {
    return {
      body: stripNumericChoicePrompt(input.body),
      choices: structured,
    };
  }
  return parseReplyChoicesFromBody(input.body);
}

export function formatChoicesAsTextFallback(
  body: string,
  choices: readonly AiReplyChoice[],
): string {
  if (!choices.length) return body;
  const lines = choices.map((choice, index) => `${index + 1}. ${choice.label}`);
  const lead = body.trim();
  return lead ? `${lead}\n\n${lines.join("\n")}` : lines.join("\n");
}

export function resolveInboundChoiceLabel(
  choices: readonly AiReplyChoice[],
  interactionId: string | undefined,
  text: string | undefined,
): string | null {
  const normalizedText = text?.trim().toLocaleLowerCase("pt-BR") ?? "";
  if (interactionId) {
    const byId = choices.find((choice) => choice.id === interactionId);
    if (byId) return byId.label;
  }
  if (normalizedText) {
    const byLabel = choices.find(
      (choice) =>
        choice.label.toLocaleLowerCase("pt-BR") === normalizedText ||
        choice.id.toLocaleLowerCase("pt-BR") === normalizedText,
    );
    if (byLabel) return byLabel.label;
    if (/^[123]$/.test(normalizedText)) {
      const index = Number(normalizedText) - 1;
      if (choices[index]) return choices[index].label;
    }
  }
  return null;
}
