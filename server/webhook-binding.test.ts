import { describe, expect, it } from "vitest";
import {
  selectExactChannelBinding,
  type WebhookChannelBinding,
} from "../supabase/functions/whats-mend-webhook/binding.js";

const channels: WebhookChannelBinding[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    provider_instance_name: "zelo-support",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    workspace_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    provider_instance_name: "mend-support",
  },
];

describe("Whatsmiau webhook tenant binding", () => {
  it("does not assign an unknown instance to another workspace's open channel", () => {
    expect(selectExactChannelBinding(channels, "unknown-instance")).toBeNull();
  });

  it("returns only the exact provider instance binding", () => {
    expect(selectExactChannelBinding(channels, "mend-support")).toEqual(
      channels[1],
    );
  });

  it("rejects duplicate exact bindings instead of choosing one", () => {
    expect(() =>
      selectExactChannelBinding(
        [...channels, { ...channels[0], id: "duplicate" }],
        "zelo-support",
      ),
    ).toThrow("channel_instance_ambiguous");
  });

  it("does not bind an event that omits its instance identifier", () => {
    expect(selectExactChannelBinding(channels, undefined)).toBeNull();
  });
});
