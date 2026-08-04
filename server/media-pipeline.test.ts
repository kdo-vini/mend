import { describe, expect, it } from "vitest";
import {
  MEDIA_BATCH_MAX_BYTES,
  MEDIA_BATCH_MAX_COUNT,
  mediaKindForMime,
  mediaLimitForMime,
  validateMediaAssetInput,
} from "./media-pipeline.js";
import { safeMediaFileName } from "./media-policy.js";

describe("media pipeline boundaries", () => {
  it("classifies supported media and applies support-sized limits", () => {
    expect(mediaKindForMime("image/heic")).toBe("image");
    expect(mediaKindForMime("video/quicktime")).toBe("video");
    expect(mediaKindForMime("audio/ogg")).toBe("audio");
    expect(mediaKindForMime("application/zip")).toBe("archive");
    expect(mediaLimitForMime("image/png")).toBe(20 * 1024 * 1024);
    expect(mediaLimitForMime("video/mp4")).toBe(100 * 1024 * 1024);
  });

  it("normalizes names and rejects unsafe upload metadata", () => {
    expect(safeMediaFileName("../customer proof (1).png")).toBe(
      "customer-proof-1-.png",
    );
    expect(() =>
      validateMediaAssetInput({
        conversationId: "not-a-uuid",
        fileName: "proof.png",
        declaredMimeType: "image/png",
        sizeBytes: 10,
      }),
    ).toThrow("conversation_id_invalid");
    expect(() =>
      validateMediaAssetInput({
        conversationId: "55555555-5555-4555-8555-555555555555",
        fileName: "video.mp4",
        declaredMimeType: "video/mp4",
        sizeBytes: 101 * 1024 * 1024,
      }),
    ).toThrow("media_size_limit_exceeded");
    expect(() =>
      validateMediaAssetInput({
        conversationId: "55555555-5555-4555-8555-555555555555",
        fileName: "malware.exe",
        declaredMimeType: "application/x-msdownload",
        sizeBytes: 10,
      }),
    ).toThrow("unsupported_media_type");
  });

  it("keeps the batch contract explicit", () => {
    expect(MEDIA_BATCH_MAX_COUNT).toBe(10);
    expect(MEDIA_BATCH_MAX_BYTES).toBe(200 * 1024 * 1024);
  });
});
