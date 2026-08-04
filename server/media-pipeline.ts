import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import type { EnqueueJobInput } from "./jobs.js";
import type { RequestContext } from "./contracts/api-ports.js";
import {
  allowedMediaMimeTypes,
  normalizeMediaMime,
  safeMediaFileName,
} from "./media-policy.js";

const execFileAsync = promisify(execFile);
const BUCKET = "private-media";
const megabyte = 1024 * 1024;

export const MEDIA_PROCESS_JOB_TYPE = "mend.process_media_asset";
export const MEDIA_BATCH_MAX_COUNT = 10;
export const MEDIA_BATCH_MAX_BYTES = 200 * megabyte;

export const mediaLimits = {
  image: 20 * megabyte,
  video: 100 * megabyte,
  audio: 25 * megabyte,
  document: 100 * megabyte,
  archive: 100 * megabyte,
} as const;

export type MediaKind = keyof typeof mediaLimits;
export type MediaAssetStatus =
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "unsupported";

export interface MediaProcessJobPayload {
  assetId: string;
  workspaceId: string;
}

export interface MediaAssetInput {
  conversationId: string;
  batchId?: string;
  fileName: string;
  declaredMimeType?: string;
  sizeBytes: number;
  checksum?: string;
}

export interface MediaAssetRecord {
  id: string;
  workspaceId: string;
  conversationId: string;
  batchId?: string;
  originalStoragePath: string;
  originalFileName: string;
  declaredMimeType?: string;
  detectedMimeType?: string;
  kind: MediaKind;
  status: MediaAssetStatus;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  errorCode?: string;
  variants: MediaVariantRecord[];
}

export interface MediaVariantRecord {
  id: string;
  assetId: string;
  channel: string;
  purpose: "original" | "browser" | "provider" | "preview";
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
}

import type { SupabaseClient } from "@supabase/supabase-js";

type UncheckedClient = SupabaseClient;

export interface MediaJobEnqueuer {
  enqueue(input: EnqueueJobInput<MediaProcessJobPayload>): Promise<unknown>;
}

export function mediaKindForMime(value?: string): MediaKind {
  const mime = normalizeMediaMime(value);
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/zip" || mime === "application/x-7z-compressed")
    return "archive";
  return "document";
}

export function mediaLimitForMime(value?: string): number {
  return mediaLimits[mediaKindForMime(value)];
}

export function validateMediaAssetInput(input: MediaAssetInput): void {
  if (!/^[0-9a-f-]{36}$/i.test(input.conversationId))
    throw new Error("conversation_id_invalid");
  if (!input.fileName.trim()) throw new Error("media_file_name_required");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0)
    throw new Error("media_size_invalid");
  if (input.sizeBytes > mediaLimitForMime(input.declaredMimeType))
    throw new Error("media_size_limit_exceeded");
  const declared = normalizeMediaMime(input.declaredMimeType);
  if (declared && !allowedMediaMimeTypes.has(declared))
    throw new Error(`unsupported_media_type:${declared}`);
  if (input.checksum && !/^[a-f0-9]{64}$/i.test(input.checksum))
    throw new Error("media_checksum_invalid");
}

function assetPath(
  workspaceId: string,
  conversationId: string,
  assetId: string,
  fileName: string,
) {
  return `${workspaceId}/${conversationId}/${assetId}/original/${safeMediaFileName(fileName)}`;
}

function variantPath(
  workspaceId: string,
  conversationId: string,
  assetId: string,
  channel: string,
  purpose: string,
  extension: string,
) {
  return `${workspaceId}/${conversationId}/${assetId}/variants/${safeMediaFileName(channel)}/${safeMediaFileName(purpose)}.${extension}`;
}

function normalizeStatus(value: unknown): MediaAssetStatus {
  return ["uploaded", "processing", "ready", "failed", "unsupported"].includes(
    String(value),
  )
    ? (String(value) as MediaAssetStatus)
    : "failed";
}

function rowToAsset(
  row: Record<string, unknown>,
  variants: MediaVariantRecord[] = [],
): MediaAssetRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    conversationId: String(row.conversation_id),
    ...(row.batch_id ? { batchId: String(row.batch_id) } : {}),
    originalStoragePath: String(row.original_storage_path),
    originalFileName: String(row.original_file_name),
    ...(row.declared_mime_type
      ? { declaredMimeType: String(row.declared_mime_type) }
      : {}),
    ...(row.detected_mime_type
      ? { detectedMimeType: String(row.detected_mime_type) }
      : {}),
    kind: mediaKindForMime(
      String(
        row.detected_mime_type ??
          row.declared_mime_type ??
          "application/octet-stream",
      ),
    ),
    status: normalizeStatus(row.status),
    sizeBytes: Number(row.size_bytes ?? 0),
    ...(row.width !== null && row.width !== undefined
      ? { width: Number(row.width) }
      : {}),
    ...(row.height !== null && row.height !== undefined
      ? { height: Number(row.height) }
      : {}),
    ...(row.duration_seconds !== null && row.duration_seconds !== undefined
      ? { durationSeconds: Number(row.duration_seconds) }
      : {}),
    ...(row.error_code ? { errorCode: String(row.error_code) } : {}),
    variants,
  };
}

function rowToVariant(row: Record<string, unknown>): MediaVariantRecord {
  return {
    id: String(row.id),
    assetId: String(row.asset_id),
    channel: String(row.channel),
    purpose: String(row.purpose) as MediaVariantRecord["purpose"],
    storagePath: String(row.storage_path),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes ?? 0),
  };
}

async function tool(command: string, args: string[], cwd: string) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      timeout: Number(process.env.MEDIA_PROCESS_TIMEOUT_MS ?? 120_000),
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`media_${command}_failed:${reason.slice(0, 400)}`);
  }
}

function isSafeSvg(value: Buffer): boolean {
  const text = value.toString("utf8");
  return !/<script\b|on[a-z]+\s*=|javascript:/i.test(text);
}

function sanitizeSvg(value: Buffer): Buffer {
  const sanitized = value
    .toString("utf8")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
  return Buffer.from(sanitized);
}

export class SupabaseMediaPipeline {
  constructor(
    private readonly client: UncheckedClient,
    private readonly jobStore?: MediaJobEnqueuer,
  ) {}

  async createUpload(context: RequestContext, input: MediaAssetInput) {
    if (process.env.MEND_MEDIA_PIPELINE_V2 === "0")
      throw new Error("media_pipeline_disabled");
    validateMediaAssetInput(input);
    const batchId = input.batchId ?? randomUUID();
    const batch = this.client.from("media_batches");
    const existingBatch = await batch
      .select("id, conversation_id, total_count, total_bytes, status")
      .eq("id", batchId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (existingBatch.error)
      throw new Error(`media_batch:${existingBatch.error.message}`);
    if (
      existingBatch.data &&
      existingBatch.data.conversation_id &&
      existingBatch.data.conversation_id !== input.conversationId
    )
      throw new Error("media_batch_conversation_mismatch");
    if (!existingBatch.data) {
      const created = await batch.insert({
        id: batchId,
        workspace_id: context.workspaceId,
        conversation_id: input.conversationId,
        created_by_user_id: context.userId,
        status: "uploading",
      });
      if (created.error)
        throw new Error(`media_batch:${created.error.message}`);
    }
    const count = Number(existingBatch.data?.total_count ?? 0);
    const bytes = Number(existingBatch.data?.total_bytes ?? 0);
    if (
      count >= MEDIA_BATCH_MAX_COUNT ||
      bytes + input.sizeBytes > MEDIA_BATCH_MAX_BYTES
    )
      throw new Error("media_batch_limit_exceeded");

    const assetId = randomUUID();
    const storagePath = assetPath(
      context.workspaceId,
      input.conversationId,
      assetId,
      input.fileName,
    );
    const inserted = await this.client.from("media_assets").insert({
      id: assetId,
      workspace_id: context.workspaceId,
      conversation_id: input.conversationId,
      batch_id: batchId,
      original_storage_path: storagePath,
      original_file_name: safeMediaFileName(input.fileName),
      declared_mime_type: normalizeMediaMime(input.declaredMimeType) || null,
      kind: mediaKindForMime(input.declaredMimeType),
      size_bytes: input.sizeBytes,
      metadata_json: input.checksum ? { checksum: input.checksum } : {},
    });
    if (inserted.error)
      throw new Error(`media_asset:${inserted.error.message}`);
    const upload = await this.client.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);
    if (upload.error || !upload.data?.token)
      throw new Error(
        `media_upload_url:${upload.error?.message ?? "missing_token"}`,
      );
    await this.client
      .from("media_batches")
      .update({
        total_count: count + 1,
        total_bytes: bytes + input.sizeBytes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId)
      .eq("workspace_id", context.workspaceId);
    return {
      assetId,
      batchId,
      path: storagePath,
      token: String(upload.data.token),
      bucket: BUCKET,
      uploadEndpoint: process.env.SUPABASE_URL
        ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/upload/resumable`
        : undefined,
    };
  }

  async complete(context: RequestContext, assetId: string) {
    const asset = await this.findAsset(context, assetId);
    if (!asset) throw new Error("media_asset_not_found");
    const updated = await this.client
      .from("media_assets")
      .update({
        status: "processing",
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId)
      .eq("workspace_id", context.workspaceId);
    if (updated.error) throw new Error(`media_asset:${updated.error.message}`);
    if (this.jobStore) {
      await this.jobStore.enqueue({
        workspaceId: context.workspaceId,
        type: MEDIA_PROCESS_JOB_TYPE,
        payload: {
          assetId,
          workspaceId: context.workspaceId,
        } satisfies MediaProcessJobPayload,
        dedupeKey: `media-process:${context.workspaceId}:${assetId}`,
        maxAttempts: 3,
      });
    } else {
      await this.processAsset({ assetId, workspaceId: context.workspaceId });
    }
    return this.findAsset(context, assetId);
  }

  async findAsset(
    context: RequestContext,
    assetId: string,
  ): Promise<MediaAssetRecord | null> {
    const result = await this.client
      .from("media_assets")
      .select("*")
      .eq("id", assetId)
      .eq("workspace_id", context.workspaceId)
      .maybeSingle();
    if (result.error) throw new Error(`media_asset:${result.error.message}`);
    if (!result.data) return null;
    const variants = await this.client
      .from("media_variants")
      .select("*")
      .eq("asset_id", assetId)
      .eq("workspace_id", context.workspaceId);
    if (variants.error)
      throw new Error(`media_variants:${variants.error.message}`);
    return rowToAsset(result.data, (variants.data ?? []).map(rowToVariant));
  }

  async listAssets(context: RequestContext, assetIds: string[]) {
    const ids = [...new Set(assetIds)]
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 100);
    if (!ids.length) return [];
    const result = await this.client
      .from("media_assets")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .in("id", ids);
    if (result.error) throw new Error(`media_assets:${result.error.message}`);
    const variants = await this.client
      .from("media_variants")
      .select("*")
      .eq("workspace_id", context.workspaceId)
      .in("asset_id", ids);
    if (variants.error)
      throw new Error(`media_variants:${variants.error.message}`);
    const byAsset = new Map<string, MediaVariantRecord[]>();
    for (const row of variants.data ?? []) {
      const item = rowToVariant(row);
      byAsset.set(item.assetId, [...(byAsset.get(item.assetId) ?? []), item]);
    }
    return (result.data ?? []).map((row: Record<string, unknown>) =>
      rowToAsset(row, byAsset.get(String(row.id)) ?? []),
    );
  }

  async signedUrl(
    context: RequestContext,
    assetId: string,
    purpose: "original" | "browser" | "provider" | "preview" = "browser",
  ) {
    const asset = await this.findAsset(context, assetId);
    if (!asset) throw new Error("media_asset_not_found");
    const variant =
      asset.variants.find((item) => item.purpose === purpose) ??
      asset.variants.find((item) => item.purpose === "browser") ??
      asset.variants.find((item) => item.purpose === "original");
    const storagePath = variant?.storagePath ?? asset.originalStoragePath;
    const result = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 900);
    if (result.error || !result.data?.signedUrl)
      throw new Error(
        `media_signed_url:${result.error?.message ?? "missing_url"}`,
      );
    return {
      url: result.data.signedUrl,
      mimeType:
        variant?.mimeType ?? asset.detectedMimeType ?? asset.declaredMimeType,
    };
  }

  async processAsset(input: MediaProcessJobPayload): Promise<void> {
    const assetResult = await this.client
      .from("media_assets")
      .select("*")
      .eq("id", input.assetId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (assetResult.error)
      throw new Error(`media_asset:${assetResult.error.message}`);
    if (!assetResult.data) throw new Error("media_asset_not_found");
    const asset = assetResult.data as Record<string, unknown>;
    const storagePath = String(asset.original_storage_path);
    const download = await this.client.storage
      .from(BUCKET)
      .download(storagePath);
    if (download.error || !download.data)
      throw new Error(`media_download:${download.error?.message ?? "empty"}`);
    const buffer = Buffer.from(await download.data.arrayBuffer());
    try {
      if (
        !buffer.length ||
        buffer.length >
          mediaLimitForMime(String(asset.declared_mime_type ?? ""))
      )
        throw new Error("media_size_limit_exceeded");
      const detected = await fileTypeFromBuffer(buffer.subarray(0, 4100));
      const declared = normalizeMediaMime(
        String(asset.declared_mime_type ?? ""),
      );
      const mimeType =
        detected?.mime ?? (declared === "image/svg+xml" ? declared : "");
      if (!mimeType) throw new Error("media_type_unknown");
      if (!allowedMediaMimeTypes.has(mimeType))
        throw new Error(`unsupported_media_type:${mimeType}`);
      if (buffer.length > mediaLimitForMime(mimeType))
        throw new Error("media_size_limit_exceeded");
      const kind = mediaKindForMime(mimeType);
      const variants: Array<{
        channel: string;
        purpose: MediaVariantRecord["purpose"];
        data: Buffer;
        mimeType: string;
        extension: string;
      }> = [];
      let width: number | undefined;
      let height: number | undefined;
      let durationSeconds: number | undefined;
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), "mend-media-"));
      try {
        if (kind === "image") {
          if (mimeType === "image/svg+xml") {
            if (!isSafeSvg(buffer)) throw new Error("unsafe_svg_blocked");
            const safe = sanitizeSvg(buffer);
            variants.push({
              channel: "browser",
              purpose: "browser",
              data: safe,
              mimeType,
              extension: "svg",
            });
          } else {
            const image = sharp(buffer, { animated: mimeType === "image/gif" });
            const metadata = await image.metadata();
            width = metadata.width;
            height = metadata.height;
            const preview = await image
              .clone()
              .resize({
                width: 1280,
                height: 1280,
                fit: "inside",
                withoutEnlargement: true,
              })
              .jpeg({ quality: 82 })
              .toBuffer();
            variants.push({
              channel: "browser",
              purpose: "browser",
              data: buffer,
              mimeType,
              extension:
                mimeType === "image/tiff"
                  ? "tiff"
                  : (mimeType.split("/")[1] ?? "bin"),
            });
            variants.push({
              channel: "browser",
              purpose: "preview",
              data: preview,
              mimeType: "image/jpeg",
              extension: "jpg",
            });
            if (
              !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
                mimeType,
              )
            )
              variants.push({
                channel: "whatsmiau",
                purpose: "provider",
                data: preview,
                mimeType: "image/jpeg",
                extension: "jpg",
              });
          }
        } else if (kind === "video" || kind === "audio") {
          const inputPath = path.join(temp, "input");
          const outputPath = path.join(
            temp,
            kind === "video" ? "output.mp4" : "output.ogg",
          );
          await fs.writeFile(inputPath, buffer);
          const probe = await tool(
            "ffprobe",
            [
              "-v",
              "error",
              "-show_entries",
              "format=duration:stream=width,height",
              "-of",
              "json",
              inputPath,
            ],
            temp,
          );
          const metadata = JSON.parse(probe.stdout) as {
            format?: { duration?: string };
            streams?: Array<{ width?: number; height?: number }>;
          };
          const duration = Number(metadata.format?.duration);
          if (Number.isFinite(duration))
            durationSeconds = Math.max(0, Math.round(duration));
          width = metadata.streams?.find((stream) => stream.width)?.width;
          height = metadata.streams?.find((stream) => stream.height)?.height;
          if (kind === "video") {
            await tool(
              "ffmpeg",
              [
                "-y",
                "-i",
                inputPath,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-c:a",
                "aac",
                "-movflags",
                "+faststart",
                outputPath,
              ],
              temp,
            );
            const normalized = await fs.readFile(outputPath);
            variants.push({
              channel: "browser",
              purpose: "browser",
              data: normalized,
              mimeType: "video/mp4",
              extension: "mp4",
            });
            variants.push({
              channel: "whatsmiau",
              purpose: "provider",
              data: normalized,
              mimeType: "video/mp4",
              extension: "mp4",
            });
          } else {
            await tool(
              "ffmpeg",
              [
                "-y",
                "-i",
                inputPath,
                "-c:a",
                "libopus",
                "-b:a",
                "48k",
                outputPath,
              ],
              temp,
            );
            const normalized = await fs.readFile(outputPath);
            variants.push({
              channel: "browser",
              purpose: "browser",
              data: normalized,
              mimeType: "audio/ogg",
              extension: "ogg",
            });
            variants.push({
              channel: "whatsmiau",
              purpose: "provider",
              data: normalized,
              mimeType: "audio/ogg",
              extension: "ogg",
            });
          }
        } else {
          variants.push({
            channel: "browser",
            purpose: "browser",
            data: buffer,
            mimeType,
            extension:
              path.extname(String(asset.original_file_name)).replace(".", "") ||
              "bin",
          });
        }
      } finally {
        await fs.rm(temp, { recursive: true, force: true });
      }

      for (const variant of variants) {
        const target = variantPath(
          input.workspaceId,
          String(asset.conversation_id),
          input.assetId,
          variant.channel,
          variant.purpose,
          variant.extension,
        );
        const uploaded = await this.client.storage
          .from(BUCKET)
          .upload(target, variant.data, {
            contentType: variant.mimeType,
            upsert: true,
          });
        if (uploaded.error)
          throw new Error(`media_variant_upload:${uploaded.error.message}`);
        const row = await this.client.from("media_variants").upsert(
          {
            workspace_id: input.workspaceId,
            asset_id: input.assetId,
            channel: variant.channel,
            purpose: variant.purpose,
            storage_path: target,
            mime_type: variant.mimeType,
            size_bytes: variant.data.byteLength,
          },
          { onConflict: "asset_id,channel,purpose" },
        );
        if (row.error) throw new Error(`media_variant:${row.error.message}`);
      }
      const originalRow = await this.client.from("media_variants").upsert(
        {
          workspace_id: input.workspaceId,
          asset_id: input.assetId,
          channel: "browser",
          purpose: "original",
          storage_path: storagePath,
          mime_type: mimeType,
          size_bytes: buffer.byteLength,
        },
        { onConflict: "asset_id,channel,purpose" },
      );
      if (originalRow.error)
        throw new Error(`media_variant:${originalRow.error.message}`);
      const updated = await this.client
        .from("media_assets")
        .update({
          detected_mime_type: mimeType,
          kind,
          status: "ready",
          error_code: null,
          width: width ?? null,
          height: height ?? null,
          duration_seconds: durationSeconds ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.assetId)
        .eq("workspace_id", input.workspaceId);
      if (updated.error)
        throw new Error(`media_asset:${updated.error.message}`);
    } catch (error) {
      const code =
        error instanceof Error
          ? error.message.split(":")[0].slice(0, 120)
          : "media_processing_failed";
      await this.client
        .from("media_assets")
        .update({
          status: code === "unsafe_svg_blocked" ? "unsupported" : "failed",
          error_code: code,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.assetId)
        .eq("workspace_id", input.workspaceId);
      throw error;
    }
  }
}
