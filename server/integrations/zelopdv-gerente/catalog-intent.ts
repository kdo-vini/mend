/**
 * Detects imperative ZeloPDV catalog mutations that should go through Zelinho
 * Gerente (propose → Sim/Não → RPC). How-to questions stay on Knowledge.
 */
export function isCatalogMutationIntent(text: string): boolean {
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

  const deletesCatalog =
    /\b(exclu[ií]r?|apag(a|ar|ue)|delet(a|ar|e)|remov(a|er|e))\b/.test(value) &&
    /\b(produto|produtos|item|itens|categoria|categorias|cat[aá]logo)\b/.test(
      value,
    );
  return (
    deletesCatalog ||
    /\b(produto|item)\b.{0,40}\b(exclu|apag|delet|remov)/.test(value) ||
    /\b(alter(a|ar)|mud(a|ar)|troc(a|ar))\s+(o\s+)?pre[cç]o\b/.test(value) ||
    /\bpaus(a|ar|e)\b.{0,40}\b(card[aá]pio|produto|item)\b/.test(value) ||
    /\bocult(a|ar)\b.{0,40}\b(pdv|caixa|produto|item)\b/.test(value) ||
    /\b(cadastra|cadastre|cadastrar)\b.{0,40}\b(produto|produtos|item)\b/.test(
      value,
    )
  );
}
