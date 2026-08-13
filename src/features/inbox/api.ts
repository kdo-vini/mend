import {
  deleteLiveConversation,
  deleteLiveMessage,
  listLiveChannels,
  loadLiveConversationSnapshot as loadSnapshot,
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

export { LiveActionError };

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
