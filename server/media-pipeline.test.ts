import { describe, expect, it, vi } from "vitest";
import {
  SupabaseMediaPipeline,
  MEDIA_BATCH_MAX_BYTES,
  MEDIA_BATCH_MAX_COUNT,
  mediaKindForMime,
  mediaLimitForMime,
  resolveDetectedMediaMime,
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

  it("keeps browser-recorded WebM audio on the audio pipeline", () => {
    expect(resolveDetectedMediaMime("audio/webm", "video/webm")).toBe(
      "audio/webm",
    );
    expect(resolveDetectedMediaMime("video/webm", "video/webm")).toBe(
      "video/webm",
    );
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

describe("batched media signed URLs", () => {
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const mine = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const foreign = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("only signs assets of the caller workspace and reports the rest as not found", async () => {
    const assetRows = [
      {
        id: mine,
        workspace_id: workspaceId,
        original_storage_path: `${workspaceId}/original.png`,
        declared_mime_type: "image/png",
      },
      {
        id: foreign,
        workspace_id: "22222222-2222-4222-8222-222222222222",
        original_storage_path: "other/original.png",
        declared_mime_type: "image/png",
      },
    ];
    const scopedWorkspaces: unknown[] = [];
    const query = (table: string) => {
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (column === "workspace_id") scopedWorkspaces.push(value);
          return chain;
        },
        in: (_column: string, ids: string[]) =>
          Promise.resolve({
            data:
              table === "media_assets"
                ? assetRows.filter(
                    (row) =>
                      row.workspace_id === workspaceId && ids.includes(row.id),
                  )
                : [],
            error: null,
          }),
      };
      return chain;
    };
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://signed.test/${path}`,
        error: null,
      })),
      error: null,
    }));
    const pipeline = new SupabaseMediaPipeline({
      from: query,
      storage: { from: () => ({ createSignedUrls }) },
    } as never);
    const result = await pipeline.signedUrls(
      { userId: "u", workspaceId, role: "agent" },
      [mine, foreign, mine],
      "browser",
    );
    expect(result).toEqual([
      {
        id: mine,
        url: `https://signed.test/${workspaceId}/original.png`,
        mimeType: "image/png",
      },
      { id: foreign, error: "media_asset_not_found" },
    ]);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0]?.[0]).toEqual([
      `${workspaceId}/original.png`,
    ]);
    expect(scopedWorkspaces.every((value) => value === workspaceId)).toBe(true);
  });
});
