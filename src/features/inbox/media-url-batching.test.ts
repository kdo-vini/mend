import { afterEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("../../api/transport", async () => ({
  ...(await vi.importActual<typeof import("../../api/transport")>(
    "../../api/transport",
  )),
  apiRequest,
}));

import { getMessageMediaUrl } from "./api";
import type { Message } from "../../types";

const media = (id: string) => ({ mediaAssetId: id }) as unknown as Message;

describe("media URL batching", () => {
  afterEach(() => {
    vi.useRealTimers();
    apiRequest.mockReset();
  });

  it("coalesces concurrent per-bubble requests into one batch call and caches results", async () => {
    vi.useFakeTimers();
    apiRequest.mockImplementation(async (_path: string, init: RequestInit) => ({
      data: (JSON.parse(String(init.body)) as { ids: string[] }).ids.map(
        (id) => ({ id, url: `https://signed.test/${id}` }),
      ),
    }));
    const first = getMessageMediaUrl("ws-batch", media("asset-a"), "preview");
    const second = getMessageMediaUrl("ws-batch", media("asset-b"), "preview");
    const duplicate = getMessageMediaUrl(
      "ws-batch",
      media("asset-a"),
      "preview",
    );
    await vi.advanceTimersByTimeAsync(25);
    await expect(Promise.all([first, second, duplicate])).resolves.toEqual([
      "https://signed.test/asset-a",
      "https://signed.test/asset-b",
      "https://signed.test/asset-a",
    ]);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest.mock.calls[0]?.[0]).toBe("/api/media/urls");
    expect(JSON.parse(String(apiRequest.mock.calls[0]?.[1].body))).toEqual({
      ids: ["asset-a", "asset-b"],
      purpose: "preview",
    });

    await expect(
      getMessageMediaUrl("ws-batch", media("asset-a"), "preview"),
    ).resolves.toBe("https://signed.test/asset-a");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects only the ids the server reports as failed", async () => {
    vi.useFakeTimers();
    apiRequest.mockResolvedValue({
      data: [
        { id: "ok-1", url: "https://signed.test/ok-1" },
        { id: "gone-1", error: "media_asset_not_found" },
      ],
    });
    const ok = getMessageMediaUrl("ws-err", media("ok-1"), "browser");
    const gone = getMessageMediaUrl("ws-err", media("gone-1"), "browser");
    const rejected = expect(gone).rejects.toThrow("media_asset_not_found");
    await vi.advanceTimersByTimeAsync(25);
    await expect(ok).resolves.toBe("https://signed.test/ok-1");
    await rejected;
  });
});
