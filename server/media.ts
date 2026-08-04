import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allowedMediaMimeTypes,
  normalizeMediaMime,
  safeMediaFileName,
} from "./media-policy.js";

export interface MediaLimits {
  maxBytes?: number;
  allowedMimeTypes?: ReadonlySet<string>;
}

export interface ValidatedMedia {
  data: Uint8Array;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface RemoteMediaReference {
  url: string;
  mimeType?: string;
  fileName?: string;
}

export interface MediaStorage {
  upload(path: string, media: ValidatedMedia): Promise<void>;
  createSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}

const megabyte = 1024 * 1024;
const defaultMaxBytes = Number(process.env.MEDIA_MAX_BYTES ?? 100 * megabyte);
const defaultMaxBytesByMime = {
  image: 20 * megabyte,
  audio: 25 * megabyte,
  video: 100 * megabyte,
  other: 100 * megabyte,
} as const;
export function mediaMaxBytesForMime(
  mimeType: string,
  requestedMaxBytes?: number,
): number {
  if (requestedMaxBytes !== undefined) return requestedMaxBytes;
  const mime = normalizeMediaMime(mimeType);
  const category = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("video/")
        ? "video"
        : "other";
  return Math.min(defaultMaxBytes, defaultMaxBytesByMime[category]);
}

function isExecutable(data: Uint8Array): boolean {
  const prefix = Buffer.from(data.subarray(0, 4));
  return (
    (prefix[0] === 0x4d && prefix[1] === 0x5a) || // Windows PE
    (prefix[0] === 0x7f &&
      prefix[1] === 0x45 &&
      prefix[2] === 0x4c &&
      prefix[3] === 0x46) || // ELF
    (prefix[0] === 0xcf &&
      prefix[1] === 0xfa &&
      prefix[2] === 0xed &&
      prefix[3] === 0xfe) || // Mach-O
    Buffer.from(data.subarray(0, 32)).toString("utf8").startsWith("#!")
  );
}

function isUnsafeSvg(data: Uint8Array): boolean {
  return /<script\b|on[a-z]+\s*=|javascript:/i.test(
    Buffer.from(data).toString("utf8"),
  );
}

function privateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
  );
}

function privateIpv6(value: string): boolean {
  const host = value.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return (
    host === "::" ||
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe8") ||
    host.startsWith("fe9") ||
    host.startsWith("fea") ||
    host.startsWith("feb")
  );
}

export function validateRemoteMediaUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const ipVersion = isIP(host.replace(/^\[/, "").replace(/\]$/, ""));
  const privateHost =
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".local") ||
    (ipVersion === 4 && privateIpv4(host)) ||
    (ipVersion === 6 && privateIpv6(host));
  if (url.protocol !== "https:" || url.username || url.password || privateHost)
    throw new Error("media_url_must_be_public_https");
  return url;
}

function decodeDataUrl(value: string): { mimeType: string; data: Uint8Array } {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!match) throw new Error("invalid_media_data_url");
  const mimeType = match[1].toLowerCase();
  if (!match[2]) throw new Error("media_data_url_must_be_base64");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(match[3]) || match[3].length % 4 === 1)
    throw new Error("invalid_media_base64");
  const data = Uint8Array.from(Buffer.from(match[3], "base64"));
  return { mimeType, data };
}

export function validateMedia(
  data: Uint8Array,
  mimeType: string,
  fileName = "file",
  limits: MediaLimits = {},
): ValidatedMedia {
  const mime = normalizeMediaMime(mimeType);
  const allowed = limits.allowedMimeTypes ?? allowedMediaMimeTypes;
  const maxBytes = mediaMaxBytesForMime(mime, limits.maxBytes);
  if (!allowed.has(mime)) throw new Error(`unsupported_media_type:${mime}`);
  if (mime === "image/svg+xml" && isUnsafeSvg(data))
    throw new Error("unsafe_svg_blocked");
  if (isExecutable(data)) throw new Error("executable_media_blocked");
  if (data.byteLength === 0 || data.byteLength > maxBytes)
    throw new Error("media_size_limit_exceeded");
  return {
    data,
    mimeType: mime,
    fileName: safeMediaFileName(fileName, 120),
    size: data.byteLength,
  };
}

export function parseMediaInput(
  input: unknown,
  mimeType?: string,
  fileName = "file",
  limits: MediaLimits = {},
): ValidatedMedia | RemoteMediaReference {
  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    if (!mimeType) throw new Error("media_mime_type_required");
    return validateMedia(input, mimeType, fileName, limits);
  }
  if (typeof input !== "string") throw new Error("unsupported_media_input");
  if (input.startsWith("data:")) {
    const decoded = decodeDataUrl(input);
    return validateMedia(
      decoded.data,
      mimeType ?? decoded.mimeType,
      fileName,
      limits,
    );
  }
  const url = validateRemoteMediaUrl(input);
  return {
    url: url.toString(),
    ...(mimeType ? { mimeType } : {}),
    fileName: safeMediaFileName(fileName, 120),
  };
}

export function buildMediaStoragePath(
  workspaceId: string,
  conversationId: string,
  media: ValidatedMedia,
): string {
  const segment = (value: string) => {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value))
      throw new Error("invalid_storage_path_segment");
    return value;
  };
  const digest = createHash("sha256")
    .update(media.data)
    .digest("hex")
    .slice(0, 16);
  return `${segment(workspaceId)}/${segment(conversationId)}/${digest}-${media.fileName}`;
}

export async function fetchRemoteMedia(
  reference: RemoteMediaReference,
  limits: MediaLimits = {},
  timeoutMs = 15_000,
): Promise<ValidatedMedia> {
  const url = validateRemoteMediaUrl(reference.url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`media_fetch_failed:${response.status}`);
    const responseMime = normalizeMediaMime(
      reference.mimeType ?? response.headers.get("content-type") ?? "",
    );
    const allowed = limits.allowedMimeTypes ?? allowedMediaMimeTypes;
    if (!allowed.has(responseMime))
      throw new Error(`unsupported_media_type:${responseMime}`);
    const maxBytes = mediaMaxBytesForMime(responseMime, limits.maxBytes);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes)
      throw new Error("media_size_limit_exceeded");
    if (!response.body) throw new Error("media_response_empty");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("media_size_limit_exceeded");
      }
      chunks.push(chunk.value);
    }
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return validateMedia(
      data,
      responseMime,
      reference.fileName ?? "file",
      limits,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export class SupabaseMediaStorage implements MediaStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly bucket = "private-media",
  ) {}

  async upload(path: string, media: ValidatedMedia) {
    assertStoragePath(path);
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, media.data, { contentType: media.mimeType, upsert: false });
    if (error) throw new Error(`media_upload_failed:${error.message}`);
  }

  async createSignedUrl(path: string, expiresInSeconds = 900) {
    assertStoragePath(path);
    const expires = Math.min(Math.max(60, expiresInSeconds), 86_400);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expires);
    if (error || !data?.signedUrl)
      throw new Error(
        `media_signed_url_failed:${error?.message ?? "missing_url"}`,
      );
    return data.signedUrl;
  }
}

export class InMemoryMediaStorage implements MediaStorage {
  private readonly files = new Map<string, ValidatedMedia>();

  async upload(path: string, media: ValidatedMedia) {
    assertStoragePath(path);
    this.files.set(path, media);
  }
  async createSignedUrl(path: string, expiresInSeconds = 900) {
    assertStoragePath(path);
    if (!this.files.has(path)) throw new Error("media_not_found");
    return `memory://signed/${encodeURIComponent(path)}?expires_in=${expiresInSeconds}`;
  }
}

function assertStoragePath(path: string): void {
  const segments = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error("invalid_storage_path");
}
