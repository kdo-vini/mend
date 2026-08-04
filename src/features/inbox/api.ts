import {
  loadLiveConversationSnapshot as loadSnapshot,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMessage,
  snoozeLiveConversation,
  updateLiveConversation,
} from "../../api/live-actions";
import { supabase } from "../../lib/supabase";

export {
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMessage,
  snoozeLiveConversation,
  updateLiveConversation,
};

export function loadLiveConversationSnapshot(
  workspaceId: string,
  conversationId: string,
) {
  return loadSnapshot(supabase, workspaceId, conversationId);
}
