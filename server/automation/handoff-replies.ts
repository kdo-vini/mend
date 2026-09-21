import type { SupportedLocale } from "../locale.js";

export function humanHandoffReplyBody(locale: SupportedLocale): string {
  return locale === "en-US"
    ? "Thanks for your message. To help you with this, I'm connecting you with a teammate now."
    : "Obrigado pela mensagem. Para te ajudar com isso, vou encaminhar para o atendimento humano.";
}

export function bugAcknowledgmentReplyBody(locale: SupportedLocale): string {
  return locale === "en-US"
    ? "Thanks for reporting this. I logged it for the team and a teammate will continue from here."
    : "Obrigado por avisar. Registrei o caso para a equipe e um atendente humano vai continuar daqui.";
}
