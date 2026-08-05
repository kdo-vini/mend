import {
  deleteLiveConversation,
  deleteLiveMessage,
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
import { supabase } from "../../lib/supabase";

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
