import { describe, expect, it } from "vitest";
import { InMemoryJobStore } from "./jobs.js";
import {
  enqueueWhatsmiauEvent,
  messageDedupeKey,
  type WhatsmiauMessageJobPayload,
  WhatsmiauWorker,
} from "./worker.js";

describe("Whatsmiau worker contracts", () => {
  it("enqueues normalized messages idempotently and invokes the handler", async () => {
    const store = new InMemoryJobStore<WhatsmiauMessageJobPayload>();
    const payload = {
      event: "messages.upsert",
      instance: "mend-demo",
      data: {
        key: { id: "wamid-1", remoteJid: "5511999999999@s.whatsapp.net" },
        message: { conversation: "oi" },
      },
    };
    const first = await enqueueWhatsmiauEvent(store, payload, "mend-demo");
    const second = await enqueueWhatsmiauEvent(store, payload, "mend-demo");
    expect(first[0].id).toBe(second[0].id);
    const seen: string[] = [];
    const worker = new WhatsmiauWorker(store, {
      onMessage: async (message) => {
        seen.push(message.providerMessageId);
      },
    });
    expect(await worker.runOnce()).toBe(true);
    expect(await worker.runOnce()).toBe(false);
    expect(seen).toEqual(["wamid-1"]);
  });
});

describe("messageDedupeKey event type", () => {
  it("does not collide across event types for the same provider id", () => {
    const message = {
      instanceName: "i",
      providerMessageId: "p",
    } as Parameters<typeof messageDedupeKey>[0];
    expect(messageDedupeKey(message, "messages.upsert")).not.toBe(
      messageDedupeKey(message, "messages.update"),
    );
  });
});
