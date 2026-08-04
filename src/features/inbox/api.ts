import {
  loadLiveConversationSnapshot as loadSnapshot,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveMessage,
  snoozeLiveConversation,
  updateLiveConversation,
  uploadLiveMediaAsset,
} from "../../api/live-actions";
import { supabase } from "../../lib/supabase";

export {
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveMessage,
  snoozeLiveConversation,
  updateLiveConversation,
  uploadLiveMediaAsset,
};

export function loadLiveConversationSnapshot(
  workspaceId: string,
  conversationId: string,
) {
  return loadSnapshot(supabase, workspaceId, conversationId);
}
