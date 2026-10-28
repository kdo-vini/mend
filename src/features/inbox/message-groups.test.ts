import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { continuesGroup } from "./message-groups";

const message = (patch: Partial<Message> = {}): Message => ({
  id: "m-1",
  conversationId: "c-1",
  direction: "inbound",
  sender: "Cliente",
  text: "Oi",
  time: "10:00",
  createdAt: "2026-10-28T10:00:00.000Z",
  type: "text",
  ...patch,
});

describe("continuesGroup", () => {
  it("joins a quick follow-up from the same sender", () => {
    expect(
      continuesGroup(
        message(),
        message({ id: "m-2", createdAt: "2026-10-28T10:02:00.000Z" }),
      ),
    ).toBe(true);
  });

  it("starts a new group on a reply, a pause or another author", () => {
    const later = { id: "m-2", createdAt: "2026-10-28T10:02:00.000Z" };
    expect(
      continuesGroup(message(), message({ ...later, direction: "outbound" })),
    ).toBe(false);
    expect(
      continuesGroup(
        message(),
        message({ id: "m-2", createdAt: "2026-10-28T10:06:00.000Z" }),
      ),
    ).toBe(false);
    expect(
      continuesGroup(
        message({ direction: "outbound", aiGenerated: true }),
        message({ ...later, direction: "outbound" }),
      ),
    ).toBe(false);
    expect(continuesGroup(undefined, message())).toBe(false);
  });
});
