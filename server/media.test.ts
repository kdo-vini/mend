import { createCipheriv, createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryMediaStorage,
  buildMediaStoragePath,
  extractEncryptedWhatsAppMedia,
  fetchWhatsAppMedia,
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

  it("decrypts Baileys WhatsApp media before validating and storing it", async () => {
    const originalFetch = globalThis.fetch;
    const mediaKey = Buffer.alloc(32, 7);
    const plain = Buffer.from("whatsapp-media");
    const expanded = hkdf(mediaKey, 112, "WhatsApp Image Keys");
    const iv = expanded.subarray(0, 16);
    const cipherKey = expanded.subarray(16, 48);
    const macKey = expanded.subarray(48, 80);
    const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    const encrypted = Buffer.concat([
      ciphertext,
      createHmac("sha256", macKey)
        .update(iv)
        .update(ciphertext)
        .digest()
        .subarray(0, 10),
    ]);
    const raw = {
      message: {
        imageMessage: {
          url: "https://mmg.whatsapp.net/image.enc",
          mediaKey: mediaKey.toString("base64"),
          mimetype: "image/png",
          fileSha256: createHash("sha256").update(plain).digest("base64"),
          fileEncSha256: createHash("sha256")
            .update(encrypted)
            .digest("base64"),
        },
      },
    };
    const reference = extractEncryptedWhatsAppMedia(raw, "image");
    if (!reference) throw new Error("expected encrypted reference");
    globalThis.fetch = vi.fn(
      async () =>
        new Response(encrypted, {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    try {
      const media = await fetchWhatsAppMedia(reference);
      expect(media.data).toEqual(plain);
      expect(media.mimeType).toBe("image/png");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function hkdf(input: Buffer, length: number, info: string): Buffer {
  const prk = createHmac("sha256", Buffer.alloc(32)).update(input).digest();
  let previous = Buffer.alloc(0);
  let output = Buffer.alloc(0);
  for (let index = 1; output.length < length; index += 1) {
    previous = createHmac("sha256", prk)
      .update(
        Buffer.concat([previous, Buffer.from(info), Buffer.from([index])]),
      )
      .digest();
    output = Buffer.concat([output, previous]);
  }
  return output.subarray(0, length);
}
