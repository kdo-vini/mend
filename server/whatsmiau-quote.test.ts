import { describe, expect, it } from "vitest";
import {
  normalizeConnectionState,
  resolveQuotedProviderMessageId as resolveEdge,
} from "../supabase/functions/whats-mend-webhook/quote.js";
import {
  normalizeWhatsmiauEvent,
  resolveQuotedProviderMessageId as resolveServer,
} from "./whatsmiau.js";

const key = {
  remoteJid: "5514999999999@s.whatsapp.net",
  fromMe: false,
  id: "3EB0MESSAGE",
};

function payload(data: Record<string, unknown>) {
  return {
    event: "messages.upsert",
    instance: "mend-zelo",
    data: { key, messageType: "conversation", ...data },
  };
}

const cases: Array<[string, Record<string, unknown>, string | undefined]> = [
  [
    "data.contextInfo.stanzaId (production shape)",
    {
      message: { conversation: "ok" },
      contextInfo: {
        stanzaId: "3EB0QUOTEDID",
        participant: key.remoteJid,
        quotedMessage: { conversation: "original text" },
      },
    },
    "3EB0QUOTEDID",
  ],
  [
    "extendedTextMessage.contextInfo.stanzaId",
    {
      message: {
        extendedTextMessage: {
          text: "ok",
          contextInfo: { stanzaId: "3EB0EXTENDED" },
        },
      },
    },
    "3EB0EXTENDED",
  ],
  [
    "legacy quotedMessage.key.id",
    {
      message: {
        extendedTextMessage: {
          text: "ok",
          contextInfo: { quotedMessage: { key: { id: "3EB0LEGACY" } } },
        },
      },
    },
    "3EB0LEGACY",
  ],
  [
    "reaction key fallback",
    {
      messageType: "reactionMessage",
      message: {
        reactionMessage: { key: { id: "3EB0REACTED" }, text: "x" },
      },
    },
    "3EB0REACTED",
  ],
  ["no quote", { message: { conversation: "ok" } }, undefined],
];

describe("quoted provider message id", () => {
  for (const [name, data, expected] of cases) {
    it(`resolves ${name} on the edge helper`, () => {
      const message = data.message as Record<string, unknown>;
      expect(resolveEdge(data, message)).toBe(expected);
    });

    it(`resolves ${name} through the server normalizer`, () => {
      const [normalized] = normalizeWhatsmiauEvent(payload(data));
      expect(normalized?.quotedProviderMessageId).toBe(expected);
      const message = data.message as Record<string, unknown>;
      expect(resolveServer(data, message)).toBe(expected);
    });
  }

  it("prefers data.contextInfo.stanzaId over the legacy key", () => {
    expect(
      resolveEdge(
        { contextInfo: { stanzaId: "TOP" } },
        {
          extendedTextMessage: {
            contextInfo: { quotedMessage: { key: { id: "OLD" } } },
          },
        },
      ),
    ).toBe("TOP");
  });
});

describe("connection state normalization", () => {
  it("maps the provider's close to closed", () => {
    expect(normalizeConnectionState("close")).toBe("closed");
  });

  it("keeps known states and drops unknown ones", () => {
    for (const state of ["open", "closed", "connecting", "qr-code"]) {
      expect(normalizeConnectionState(state)).toBe(state);
    }
    expect(normalizeConnectionState("refused")).toBeUndefined();
    expect(normalizeConnectionState(undefined)).toBeUndefined();
  });
});
