import { describe, expect, it } from "vitest";
import {
  InMemoryMediaStorage,
  buildMediaStoragePath,
  mediaMaxBytesForMime,
  parseMediaInput,
  validateMedia,
  validateRemoteMediaUrl,
} from "./media.js";

describe("media boundaries", () => {
  it("validates data URLs and generates traversal-safe storage paths", async () => {
    const media = parseMediaInput(
      "data:text/plain;base64,aGVsbG8=",
      undefined,
      "../hello.txt",
    );
    if ("url" in media) throw new Error("expected inline media");
    const path = buildMediaStoragePath("workspace-1", "conversation-1", media);
    const storage = new InMemoryMediaStorage();
    await storage.upload(path, media);
    expect(path).toMatch(
      /^workspace-1\/conversation-1\/[a-f0-9]{16}-hello.txt$/,
    );
    expect(await storage.createSignedUrl(path)).toContain("memory://signed/");
  });

  it("rejects unsafe remote media URLs", () => {
    expect(() => validateRemoteMediaUrl("http://localhost/file")).toThrow(
      "media_url_must_be_public_https",
    );
    expect(() =>
      validateRemoteMediaUrl("https://user:password@files.example/file"),
    ).toThrow("media_url_must_be_public_https");
    expect(() => validateRemoteMediaUrl("https://127.0.0.1/file")).toThrow(
      "media_url_must_be_public_https",
    );
    expect(() =>
      validateRemoteMediaUrl("https://files.example/file"),
    ).not.toThrow();
  });

  it("applies the handoff limits by media category and blocks executable signatures", () => {
    expect(mediaMaxBytesForMime("image/png")).toBe(20 * 1024 * 1024);
    expect(mediaMaxBytesForMime("audio/ogg")).toBe(25 * 1024 * 1024);
    expect(mediaMaxBytesForMime("video/mp4")).toBe(100 * 1024 * 1024);
    expect(() =>
      validateMedia(Uint8Array.from([0x4d, 0x5a, 0x00]), "image/png"),
    ).toThrow("executable_media_blocked");
    const media = parseMediaInput("data:text/plain;base64,aGVsbG8=");
    if ("url" in media) throw new Error("expected inline media");
    expect(() =>
      buildMediaStoragePath("../workspace", "conversation-1", media),
    ).toThrow("invalid_storage_path_segment");
  });
});
