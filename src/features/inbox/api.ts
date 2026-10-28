import {
  type OlderMessagesCursor,
  deleteLiveConversation,
  deleteLiveMessage,
  editLiveMessage,
  listLiveChannels,
  loadLiveZeloCustomer,
  loadLiveConversationSnapshot as loadSnapshot,
  loadOlderLiveConversationMessages as loadOlderMessages,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveContact,
  sendLiveMessage,
  sendLivePresence,
  reactToLiveMessage,
  snoozeLiveConversation,
  updateLiveContact,
  updateLiveConversation,
  uploadLiveMediaAsset,
} from "../../api/live-actions";
import { apiRequest, LiveActionError } from "../../api/transport";
import { supabase } from "../../lib/supabase";
import type { NewChatChannel } from "./components/NewChatDialog";
import type { Message } from "../../types";

export { LiveActionError };

export type MessageMediaPurpose = "preview" | "browser" | "original";

const mediaUrlCache = new Map<string, { url: string; expiresAt: number }>();
const mediaUrlInFlight = new Map<string, Promise<string>>();

const MEDIA_URL_BATCH_WINDOW_MS = 20;
const MEDIA_URL_BATCH_MAX = 50;

interface PendingMediaUrl {
  resolve: (url: string) => void;
  reject: (error: unknown) => void;
}
interface MediaUrlBatch {
  timer: ReturnType<typeof setTimeout>;
  waiters: Map<string, PendingMediaUrl[]>;
}
const mediaUrlBatches = new Map<string, MediaUrlBatch>();

async function flushMediaUrlBatch(
  batchKey: string,
  workspaceId: string,
  purpose: MessageMediaPurpose,
) {
  const batch = mediaUrlBatches.get(batchKey);
  if (!batch) return;
  mediaUrlBatches.delete(batchKey);
  clearTimeout(batch.timer);
  const ids = [...batch.waiters.keys()];
  try {
    const result = await apiRequest<{
      data: { id: string; url?: string; error?: string }[];
    }>(
      "/api/media/urls",
      { method: "POST", body: JSON.stringify({ ids, purpose }) },
      workspaceId,
    );
    const byId = new Map(result.data.map((item) => [item.id, item]));
    for (const [id, waiters] of batch.waiters) {
      const item = byId.get(id);
      for (const waiter of waiters)
        if (item?.url) waiter.resolve(item.url);
        else
          waiter.reject(
            new LiveActionError(item?.error ?? "media_signed_url_missing"),
          );
    }
  } catch (error) {
    for (const waiters of batch.waiters.values())
      for (const waiter of waiters) waiter.reject(error);
  }
}

/** Coalesces per-bubble requests made within a tick into one batch call. */
function requestMediaAssetUrl(
  workspaceId: string,
  assetId: string,
  purpose: MessageMediaPurpose,
): Promise<string> {
  const batchKey = `${workspaceId}:${purpose}`;
  return new Promise<string>((resolve, reject) => {
    let batch = mediaUrlBatches.get(batchKey);
    if (!batch) {
      batch = {
        waiters: new Map(),
        timer: setTimeout(
          () => void flushMediaUrlBatch(batchKey, workspaceId, purpose),
          MEDIA_URL_BATCH_WINDOW_MS,
        ),
      };
      mediaUrlBatches.set(batchKey, batch);
    }
    batch.waiters.set(assetId, [
      ...(batch.waiters.get(assetId) ?? []),
      { resolve, reject },
    ]);
    if (batch.waiters.size >= MEDIA_URL_BATCH_MAX)
      void flushMediaUrlBatch(batchKey, workspaceId, purpose);
  });
}

export async function getMessageMediaUrl(
  workspaceId: string,
  message: Message,
  purpose: MessageMediaPurpose,
): Promise<string> {
  if (message.attachment?.url) return message.attachment.url;
  const identity = message.mediaAssetId ?? message.mediaStoragePath;
  if (!identity) throw new LiveActionError("media_path_missing");
  const key = `${workspaceId}:${identity}:${purpose}`;
  const cached = mediaUrlCache.get(key);
  if (cached && cached.expiresAt - Date.now() > 60_000) return cached.url;
  const existing = mediaUrlInFlight.get(key);
  if (existing) return existing;

  const request = message.mediaAssetId
    ? requestMediaAssetUrl(workspaceId, message.mediaAssetId, purpose)
    : (() => {
        if (!supabase || !message.mediaStoragePath)
          throw new LiveActionError("media_storage_unavailable");
        return supabase.storage
          .from("private-media")
          .createSignedUrl(message.mediaStoragePath, 900)
          .then(({ data, error }) => {
            if (error || !data?.signedUrl)
              throw new LiveActionError(
                error?.message ?? "media_signed_url_missing",
              );
            return data.signedUrl;
          });
      })();
  mediaUrlInFlight.set(key, request);
  try {
    const url = await request;
    mediaUrlCache.set(key, { url, expiresAt: Date.now() + 15 * 60_000 });
    return url;
  } finally {
    mediaUrlInFlight.delete(key);
  }
}

export {
  deleteLiveConversation,
  deleteLiveMessage,
  editLiveMessage,
  loadLiveZeloCustomer,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveContact,
  sendLiveMessage,
  sendLivePresence,
  reactToLiveMessage,
  snoozeLiveConversation,
  updateLiveContact,
  updateLiveConversation,
  uploadLiveMediaAsset,
};

export function loadLiveConversationSnapshot(
  workspaceId: string,
  conversationId: string,
) {
  return loadSnapshot(supabase, workspaceId, conversationId);
}

export function loadOlderLiveConversationMessages(
  workspaceId: string,
  conversationId: string,
  before: OlderMessagesCursor,
) {
  return loadOlderMessages(supabase, workspaceId, conversationId, before);
}

/** Channels that can actually deliver a first message right now. */
export async function listConnectedChannels(
  workspaceId: string,
): Promise<NewChatChannel[]> {
  const channels = await listLiveChannels(workspaceId);
  return channels.flatMap((channel) =>
    channel.state === "open" && channel.channelId
      ? [{ id: channel.channelId, name: channel.name ?? channel.instanceName }]
      : [],
  );
}

export function startConversation(input: {
  workspaceId: string;
  channelId: string;
  phoneNumber: string;
  message: string;
}): Promise<{ conversationId: string; created: boolean }> {
  return apiRequest<{ conversationId: string; created: boolean }>(
    "/api/conversations",
    {
      method: "POST",
      body: JSON.stringify({
        channelId: input.channelId,
        phoneNumber: input.phoneNumber,
        message: input.message,
      }),
    },
    input.workspaceId,
  );
}
