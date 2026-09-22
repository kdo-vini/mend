/**
 * Detects imperative ZeloPDV catalog delete requests for Mend's own AI flow.
 * How-to questions stay on Knowledge.
 */
export function isCatalogDeleteIntent(text: string): boolean {
  const value = String(text || "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  if (!value) return false;
  if (
    /^(como|o que|quando|onde|por\s*que|porque|me explica|pode me (ensinar|explicar)|quero saber)\b/.test(
      value,
    )
  )
    return false;
  return (
    (/\b(exclu[ií]r?|apag(a|ar|ue)|delet(a|ar|e)|remov(a|er|e))\b/.test(
      value,
    ) &&
      /\b(produto|produtos|item|itens|categoria|categorias|cat[aá]logo)\b/.test(
        value,
      )) ||
    /\b(produto|item)\b.{0,40}\b(exclu|apag|delet|remov)/.test(value)
  );
}

/** Pulls a product name from an imperative delete request. */
export function extractCatalogDeleteTerm(text: string): string | null {
  const value = String(text || "").trim();
  if (!value) return null;
  const patterns = [
    /(?:exclu[ií]r?|apag(?:a|ar|ue)|delet(?:a|ar|e)|remov(?:a|er|e))\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:produto|item|categoria)?\s*["“]?(.+?)["”]?$/i,
    /(?:produto|item)\s+["“]?(.+?)["”]?\s+(?:exclu|apag|delet|remov)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    const term = match?.[1]?.trim();
    if (term && term.length >= 2) {
      return term
        .replace(/^(o|a|os|as|produto|item)\s+/i, "")
        .replace(/[?.!]+$/, "")
        .trim();
    }
  }
  return null;
}

export function isPairingCode(text: string): boolean {
  return /^\d{6}$/.test(String(text || "").trim());
}
