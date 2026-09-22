/** Confirm/cancel words — same semantics as ZeloPDV Zelinho Gerente. */
export const YES_WORDS =
  /^(sim|s|ok|confirmar|confirma|confirmo|pode|isso)[.!]?$/i;
export const NO_WORDS =
  /^(n[aã]o|n|cancelar|cancela|deixa|para)[.!]?$/i;

export function isYesConfirmWord(text: string): boolean {
  return YES_WORDS.test(String(text || "").trim());
}

export function isNoConfirmWord(text: string): boolean {
  return NO_WORDS.test(String(text || "").trim());
}

export function isConfirmWord(text: string): boolean {
  return isYesConfirmWord(text) || isNoConfirmWord(text);
}
