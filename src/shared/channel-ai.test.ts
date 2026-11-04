import { describe, expect, it } from "vitest";
import {
  allowedChannelProductIds,
  channelAiFromSettings,
  lockedChannelAiSettings,
  scopeProductIds,
} from "./channel-ai";

const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";

describe("channel AI lock", () => {
  it("fails closed when the channel has no or an invalid ai block", () => {
    for (const settings of [
      undefined,
      null,
      {},
      { ai: { enabled: true } },
      { ai: { enabled: "yes", knowledge: { mode: "workspace" } } },
      { ai: [] },
    ])
      expect(channelAiFromSettings(settings)).toEqual(
        lockedChannelAiSettings(),
      );
  });

  it("reads a complete ai block next to other channel settings", () => {
    const ai = {
      enabled: true,
      knowledge: { mode: "products", productIds: [PRODUCT_A] },
      mcpEnabled: false,
      zeloCustomerLookup: false,
    };
    expect(
      channelAiFromSettings({ supportFlow: { enabled: false }, ai }),
    ).toEqual(ai);
  });

  it("only product-scoped channels restrict products", () => {
    expect(
      allowedChannelProductIds({
        ...lockedChannelAiSettings(),
        knowledge: { mode: "workspace" },
      }),
    ).toBeUndefined();
    expect(allowedChannelProductIds(lockedChannelAiSettings())).toEqual([]);
  });

  it("never widens a resolution beyond the channel's products", () => {
    expect(scopeProductIds([PRODUCT_A, PRODUCT_B], [PRODUCT_B])).toEqual([
      PRODUCT_B,
    ]);
    // Another client's product, or an ambiguous message, falls back to the
    // channel's own products — never to the whole workspace.
    expect(scopeProductIds([PRODUCT_A], [PRODUCT_B])).toEqual([PRODUCT_B]);
    expect(scopeProductIds([], [PRODUCT_B])).toEqual([PRODUCT_B]);
    expect(scopeProductIds([PRODUCT_A], [])).toEqual([]);
    expect(scopeProductIds([PRODUCT_A], undefined)).toEqual([PRODUCT_A]);
  });
});
