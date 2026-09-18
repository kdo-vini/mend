import {
  deleteLiveConversation,
  deleteLiveMessage,
  listLiveChannels,
  loadLiveConversationSnapshot as loadSnapshot,
  loadOlderLiveConversationMessages as loadOlderMessages,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
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
    ? apiRequest<{ url: string }>(
        `/api/media/assets/${encodeURIComponent(message.mediaAssetId)}/url?purpose=${purpose}`,
        {},
        workspaceId,
      ).then((result) => result.url)
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
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
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
  before: string,
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
