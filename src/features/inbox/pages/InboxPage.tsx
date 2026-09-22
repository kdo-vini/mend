import {
  Fragment,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  CircleDot,
  Copy,
  ChevronLeft,
  ChevronDown as ChevronDownIcon,
  Ellipsis,
  FileText,
  Filter,
  LoaderCircle,
  Mic,
  LockKeyhole,
  Paperclip,
  PanelRight,
  PenLine,
  Plus,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  UserRound,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type {
  AiMode,
  AiDraft,
  AutomationState,
  Conversation,
  Issue,
  KnowledgeArticle,
  Message,
} from "../../../types";
import {
  deleteLiveConversation,
  deleteLiveMessage,
  listConnectedChannels,
  LiveActionError,
  loadLiveConversationSnapshot,
  loadOlderLiveConversationMessages,
  markLiveConversationRead,
  reactToLiveMessage,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveMessage,
  sendLivePresence,
  snoozeLiveConversation,
  startConversation,
  updateLiveContact,
  updateLiveConversation,
  uploadLiveMediaAsset,
} from "../api";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { useConversationScroll } from "../hooks/useConversationScroll";
import { MessageMedia } from "../components/MessageMedia";
import {
  formatMessageTime,
  getMessageDayKey,
  getMessageDayLabel,
} from "../message-dates";
import { renderWhatsAppMarkup } from "../whatsapp-markup";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { PriorityDot, StatusPill } from "../../../shared/ui/DataDisplay";
import { Select } from "../../../shared/ui/Select";
import type { Confirm } from "../../../shared/ui/ConfirmDialog";
import { localizedError } from "../../../shared/ui/localizedError";
import type { ToastTone } from "../../../shared/ui/toast";
import {
  dismissAiCard,
  getAiCardDismissalStorage,
  isAiCardDismissed,
  readAiCardDismissals,
  writeAiCardDismissals,
  type AiCardDismissals,
  type AiCardKind,
} from "../ai-card-dismissals";
import {
  INBOX_CASE_CONTEXT_ID,
  InboxCaseContext,
} from "../components/InboxCaseContext";
import {
  NEW_CHAT_DIALOG_ID,
  NewChatDialog,
  type NewChatChannel,
  type NewChatInput,
} from "../components/NewChatDialog";
import {
  conversationMatchesInboxFilter,
  inboxFilterValues,
  type InboxFilter,
} from "../inbox-filters";
import {
  conversationPreviewText,
  mergeConversationSnapshot,
  sortConversations,
  stripHumanWhatsAppIntro,
} from "../conversation-snapshot";

/** Server delivery-failure codes, mapped to the inbox message for each. */
const sendErrorKeys: Record<string, string> = {
  channel_disconnected: "errors.sendChannelDisconnected",
  provider_rejected: "errors.sendRejected",
  provider_unavailable: "errors.sendUnavailable",
  provider_timeout: "errors.sendTimeout",
  conversation_not_found: "errors.sendConversationMissing",
  message_text_invalid: "errors.sendTextInvalid",
};

interface AssigneeOption {
  value: string;
  label: string;
}

interface ComposerMediaInput {
  mediaUrl?: string;
  file?: File;
  messageType: "image" | "video" | "audio" | "document";
  mimeType?: string;
  fileName?: string;
  caption?: string;
  onProgress?: (percent: number) => void;
}

interface LightboxMedia {
  id: string;
  type: "image" | "video";
  url: string;
  name: string;
  meta: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function shouldShowConversationAiDetails() {
  return (
    typeof window === "undefined" ||
    !window.matchMedia("(max-width: 650px)").matches
  );
}

function aiDecisionDismissalSignature(conversation: Conversation) {
  return JSON.stringify([
    conversation.automationState,
    conversation.aiDecision,
    conversation.aiIntent,
    conversation.aiDecisionReason,
    conversation.aiConfidence,
    conversation.aiSummary,
    conversation.humanTakeoverAt,
    conversation.humanTakeoverBy,
    conversation.humanTakeoverReason,
  ]);
}

function aiDraftDismissalSignature(draft: AiDraft) {
  return JSON.stringify([draft.id, draft.updatedAt, draft.status, draft.body]);
}

export function InboxPage({
  workspaceId,
  conversations,
  setConversations,
  selectedConversationId,
  setSelectedConversationId,
  issues,
  onOpenIssue,
  onToast,
  onConfirm,
  liveMode,
  senderNames,
  knowledgeArticles,
  assigneeOptions,
  assigneeLabel,
}: {
  workspaceId: string | null;
  conversations: Conversation[];
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  selectedConversationId: string;
  setSelectedConversationId: (id: string) => void;
  issues: Issue[];
  onOpenIssue: (id: string) => void;
  onToast: (message: string, tone?: ToastTone) => void;
  onConfirm: Confirm;
  liveMode: boolean;
  senderNames: Record<string, string>;
  knowledgeArticles: KnowledgeArticle[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
}) {
  const { t } = useTranslation("inbox");
  const messageDayNow = new Date();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    Set<string>
  >(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [draftInsertRequest, setDraftInsertRequest] = useState<{
    text: string;
    requestId: number;
    conversationId: string;
    mediaInput?: ComposerMediaInput;
  }>();
  const [aiDetailsOpen, setAiDetailsOpen] = useState(
    shouldShowConversationAiDetails,
  );
  const aiCardStorageKey = `mend.ai-card-dismissals:${workspaceId ?? "local"}`;
  const [dismissedAiCardsByScope, setDismissedAiCardsByScope] = useState<
    Record<string, AiCardDismissals>
  >(() => ({
    [aiCardStorageKey]: readAiCardDismissals(
      getAiCardDismissalStorage(),
      aiCardStorageKey,
    ),
  }));
  const dismissedAiCards = dismissedAiCardsByScope[aiCardStorageKey] ?? {};
  const [messageActionId, setMessageActionId] = useState<string>();
  const [reactionPendingId, setReactionPendingId] = useState<string>();
  const failedMediaRetryInputsRef = useRef(
    new Map<string, ComposerMediaInput>(),
  );
  const failedMediaRefreshIdsRef = useRef(new Set<string>());
  const [mediaViewerIndex, setMediaViewerIndex] = useState<number | null>(null);
  const [conversationDeleting, setConversationDeleting] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatChannels, setNewChatChannels] = useState<NewChatChannel[]>([]);
  const [newChatStarting, setNewChatStarting] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const lastSelectionIndexRef = useRef<number | null>(null);

  const openNewChat = () => {
    setNewChatOpen(true);
    if (!liveMode || !workspaceId) return;
    void listConnectedChannels(workspaceId)
      .then(setNewChatChannels)
      .catch((error) =>
        onToast(localizedError(error, t("errors.channelNotConnected"))),
      );
  };

  const startNewChat = async (input: NewChatInput) => {
    if (!liveMode || !workspaceId) {
      setNewChatOpen(false);
      onToast(t("toasts.chatLiveOnly"));
      return;
    }
    if (!input.channelId) {
      onToast(t("errors.channelNotConnected"));
      return;
    }
    setNewChatStarting(true);
    try {
      const result = await startConversation({ workspaceId, ...input });
      // Selecting an id that is not in `conversations` renders conversations[0]
      // instead, dropping the founder into an unrelated thread until realtime
      // catches up, so the conversation is loaded before it is selected. The
      // message is already sent by now: a snapshot failure must not be reported
      // as a failed start, and realtime still heals the list.
      const snapshot = await loadLiveConversationSnapshot(
        workspaceId,
        result.conversationId,
      ).catch(() => undefined);
      if (snapshot)
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
      setNewChatOpen(false);
      setSelectedConversationId(result.conversationId);
      setMobileConversationOpen(true);
      // Either branch navigates to a conversation the active rail filter or
      // search can exclude — a new one lands at attention_state 'none' — so the
      // rail is cleared before the thread is shown.
      setSearch("");
      setFilter("all");
      if (result.created) {
        onToast(t("toasts.chatStarted"));
        return;
      }
      // The number already has a thread. Hand the typed text to the composer so
      // the founder decides whether that thread should receive it.
      setDraftInsertRequest({
        text: input.message,
        requestId: Date.now(),
        conversationId: result.conversationId,
      });
      onToast(t("toasts.chatExists"));
    } catch (error) {
      onToast(
        localizedError(
          error,
          error instanceof LiveActionError &&
            error.code === "channel_not_connected"
            ? t("errors.channelNotConnected")
            : t("errors.startChat"),
        ),
      );
    } finally {
      setNewChatStarting(false);
    }
  };

  const newChatDialog = newChatOpen ? (
    <NewChatDialog
      channels={newChatChannels}
      submitting={newChatStarting}
      onClose={() => setNewChatOpen(false)}
      onStart={(input) => void startNewChat(input)}
    />
  ) : null;

  const selected =
    conversations.find((item) => item.id === selectedConversationId) ??
    conversations[0];
  const lightboxMedia = useMemo<LightboxMedia[]>(
    () =>
      selected?.messages.flatMap((message) => {
        if (
          (message.type !== "image" && message.type !== "video") ||
          !message.attachment?.url
        )
          return [];
        return [
          {
            id: message.id,
            type: message.type,
            url: message.attachment.url,
            name: message.attachment.name,
            meta: message.attachment.meta,
          },
        ];
      }) ?? [],
    [selected],
  );
  const messageSignature = selected?.messages
    .map((message) => message.id)
    .join("|");
  const { messageCanvasRef, showScrollDown, scrollMessagesToBottom } =
    useConversationScroll({
      conversationId: selected?.id,
      messageSignature,
      viewKey: mobileConversationOpen ? "open" : "closed",
    });
  const olderMessagesLoadingRef = useRef(false);
  const exhaustedConversationIdsRef = useRef(new Set<string>());

  // The inbox list only embeds the latest message per conversation. Opening a
  // thread must load the recent history or the canvas stays on a single bubble.
  useEffect(() => {
    if (!liveMode || !workspaceId || !selectedConversationId) return;
    let cancelled = false;
    exhaustedConversationIdsRef.current.delete(selectedConversationId);
    void loadLiveConversationSnapshot(workspaceId, selectedConversationId)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
      })
      .catch(() => {
        // Keep the list preview when the full thread cannot load.
      });
    return () => {
      cancelled = true;
    };
  }, [liveMode, selectedConversationId, setConversations, workspaceId]);

  useEffect(() => {
    const canvas = messageCanvasRef.current;
    const conversationId = selected?.id;
    const before = selected?.messages.find(
      (message) => message.createdAt,
    )?.createdAt;
    if (!canvas || !liveMode || !workspaceId || !conversationId || !before)
      return;

    const loadOlder = () => {
      if (
        canvas.scrollTop > 24 ||
        olderMessagesLoadingRef.current ||
        exhaustedConversationIdsRef.current.has(conversationId)
      )
        return;
      olderMessagesLoadingRef.current = true;
      const previousHeight = canvas.scrollHeight;
      const filledViewport = canvas.scrollHeight <= canvas.clientHeight + 24;
      void loadOlderLiveConversationMessages(
        workspaceId,
        conversationId,
        before,
      )
        .then((older) => {
          if (!older.length) {
            exhaustedConversationIdsRef.current.add(conversationId);
            return;
          }
          setConversations((current) =>
            current.map((conversation) => {
              if (conversation.id !== conversationId) return conversation;
              const known = new Set(
                conversation.messages.map((message) => message.id),
              );
              return {
                ...conversation,
                messages: [
                  ...older.filter((message) => !known.has(message.id)),
                  ...conversation.messages,
                ],
              };
            }),
          );
          window.requestAnimationFrame(() => {
            // Preserve anchor when the user scrolled; when we auto-filled an
            // undersized canvas, keep them at the bottom of the thread.
            if (filledViewport) scrollMessagesToBottom("auto");
            else canvas.scrollTop += canvas.scrollHeight - previousHeight;
          });
        })
        .catch((error) =>
          onToast(localizedError(error, t("errors.loadOlderMessages"))),
        )
        .finally(() => {
          olderMessagesLoadingRef.current = false;
        });
    };

    canvas.addEventListener("scroll", loadOlder, { passive: true });
    // When the preview (or a short page) does not overflow, scroll never
    // fires — pull older messages until the canvas fills or history ends.
    const fillTimer = window.setTimeout(loadOlder, 0);
    return () => {
      canvas.removeEventListener("scroll", loadOlder);
      window.clearTimeout(fillTimer);
    };
  }, [
    liveMode,
    messageCanvasRef,
    messageSignature,
    onToast,
    scrollMessagesToBottom,
    selected?.id,
    setConversations,
    t,
    workspaceId,
  ]);
  const filtered = useMemo(
    () =>
      conversations.filter((conversation) => {
        const queryMatch = normalizeSearch(
          `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
        ).includes(normalizeSearch(search));
        return (
          queryMatch && conversationMatchesInboxFilter(conversation, filter)
        );
      }),
    [conversations, filter, search],
  );

  useEffect(() => {
    const conversationId = new URLSearchParams(location.search).get(
      "conversation",
    );
    if (!conversationId) return;
    if (
      !conversations.some((conversation) => conversation.id === conversationId)
    )
      return;
    setSelectedConversationId(conversationId);
    setMobileConversationOpen(true);
  }, [conversations, location.search, setSelectedConversationId]);

  useEffect(() => {
    if (!filtered.length) {
      setMobileConversationOpen(false);
      return;
    }
    if (!filtered.some((conversation) => conversation.id === selected?.id))
      setSelectedConversationId(filtered[0].id);
  }, [filtered, selected?.id, setSelectedConversationId]);

  useEffect(() => {
    setAiDetailsOpen(shouldShowConversationAiDetails());
    setContextOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    setMediaViewerIndex(null);
  }, [selected?.id]);

  useEffect(() => {
    if (mediaViewerIndex === null || lightboxMedia.length < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMediaViewerIndex(null);
      if (event.key === "ArrowLeft")
        setMediaViewerIndex(
          (current) =>
            (current === null ? 0 : current - 1 + lightboxMedia.length) %
            lightboxMedia.length,
        );
      if (event.key === "ArrowRight")
        setMediaViewerIndex(
          (current) =>
            (current === null ? 0 : current + 1) % lightboxMedia.length,
        );
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lightboxMedia.length, mediaViewerIndex]);

  useEffect(() => {
    if (dismissedAiCardsByScope[aiCardStorageKey]) return;
    setDismissedAiCardsByScope((current) => ({
      ...current,
      [aiCardStorageKey]: readAiCardDismissals(
        getAiCardDismissalStorage(),
        aiCardStorageKey,
      ),
    }));
  }, [aiCardStorageKey, dismissedAiCardsByScope]);

  useEffect(() => {
    if (!dismissedAiCardsByScope[aiCardStorageKey]) return;
    writeAiCardDismissals(
      getAiCardDismissalStorage(),
      aiCardStorageKey,
      dismissedAiCardsByScope[aiCardStorageKey],
    );
  }, [aiCardStorageKey, dismissedAiCardsByScope]);

  const selectionVisibleIds = filtered.map((conversation) => conversation.id);
  const selectionVisibleCount = selectionVisibleIds.filter((id) =>
    selectedConversationIds.has(id),
  ).length;
  const selectionCoversAllVisible =
    selectionVisibleIds.length > 0 &&
    selectionVisibleCount === selectionVisibleIds.length;

  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        selectionVisibleCount > 0 && !selectionCoversAllVisible;
  }, [selectionCoversAllVisible, selectionVisibleCount]);

  useEffect(() => {
    setSelectedConversationIds(new Set());
    lastSelectionIndexRef.current = null;
  }, [filter, search]);

  useEffect(() => {
    if (!selectionMode) return;
    const handleSelectionShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.matches("input, textarea, select, [contenteditable='true']")
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedConversationIds(
          new Set(filtered.map((conversation) => conversation.id)),
        );
        lastSelectionIndexRef.current = null;
      }
      if (event.key === "Escape") {
        setSelectionMode(false);
        setSelectedConversationIds(new Set());
        lastSelectionIndexRef.current = null;
      }
    };
    document.addEventListener("keydown", handleSelectionShortcut);
    return () =>
      document.removeEventListener("keydown", handleSelectionShortcut);
  }, [filtered, selectionMode]);

  if (!selected) {
    return (
      <div className="inbox-page">
        <EmptyState
          title={t("empty")}
          description={t("ui.newWillAppear")}
          action={
            <button
              className="button button-ghost inbox-new-chat"
              type="button"
              aria-expanded={newChatOpen}
              aria-controls={NEW_CHAT_DIALOG_ID}
              onClick={openNewChat}
            >
              <Plus size={14} /> {t("newChat.trigger")}
            </button>
          }
        />
        {newChatDialog}
      </div>
    );
  }

  const activeIssue = selected.issueId
    ? issues.find((issue) => issue.id === selected.issueId)
    : undefined;
  const decisionSignature = aiDecisionDismissalSignature(selected);
  const draftSignature = selected.aiDraft
    ? aiDraftDismissalSignature(selected.aiDraft)
    : "";
  const showAiDecision = !isAiCardDismissed(
    dismissedAiCards,
    selected.id,
    "decision",
    decisionSignature,
  );
  const showAiDraft =
    Boolean(selected.aiDraft) &&
    !isAiCardDismissed(dismissedAiCards, selected.id, "draft", draftSignature);
  const dismissSelectedAiCard = (kind: AiCardKind, signature: string) => {
    setDismissedAiCardsByScope((current) => ({
      ...current,
      [aiCardStorageKey]: dismissAiCard(
        current[aiCardStorageKey] ?? {},
        selected.id,
        kind,
        signature,
      ),
    }));
  };
  const refreshFailedMedia = (messageId: string) => {
    if (
      !workspaceId ||
      failedMediaRefreshIdsRef.current.has(messageId) ||
      !selected
    )
      return;
    failedMediaRefreshIdsRef.current.add(messageId);
    void loadLiveConversationSnapshot(workspaceId, selected.id)
      .then((snapshot) => {
        if (snapshot)
          setConversations((current) =>
            mergeConversationSnapshot(current, snapshot),
          );
      })
      .catch(() => {
        // Keep the existing attachment fallback when a refresh is unavailable.
      });
  };
  const openMediaViewer = (messageId: string) => {
    const index = lightboxMedia.findIndex((media) => media.id === messageId);
    if (index >= 0) setMediaViewerIndex(index);
  };
  const filterLabel = (item: InboxFilter) => {
    switch (item) {
      case "all":
        return t("filters.all");
      case "unread":
        return t("filters.unread");
      case "needs_attention":
        return t("filters.needsAttention");
      case "waiting_customer":
        return t("filters.waitingCustomer");
      case "unassigned":
        return t("filters.unassigned");
      default:
        return t("filters.resolved");
    }
  };
  const countForFilter = (item: InboxFilter) =>
    item === "all"
      ? conversations.length
      : conversations.filter((conversation) =>
          conversationMatchesInboxFilter(conversation, item),
        ).length;

  const visibleConversationIds = selectionVisibleIds;
  const visibleSelectedCount = selectionVisibleCount;
  const allVisibleSelected = selectionCoversAllVisible;

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedConversationIds(new Set());
    lastSelectionIndexRef.current = null;
  };

  const toggleAllVisible = () => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleConversationIds.forEach((id) => next.delete(id));
      } else {
        visibleConversationIds.forEach((id) => next.add(id));
      }
      return next;
    });
    lastSelectionIndexRef.current = null;
  };

  const toggleConversationSelection = (
    conversationId: string,
    shiftKey: boolean,
  ) => {
    const index = visibleConversationIds.indexOf(conversationId);
    if (index < 0) return;
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      const shouldSelect = !next.has(conversationId);
      if (shiftKey && lastSelectionIndexRef.current !== null) {
        const start = Math.min(lastSelectionIndexRef.current, index);
        const end = Math.max(lastSelectionIndexRef.current, index);
        visibleConversationIds.slice(start, end + 1).forEach((id) => {
          if (shouldSelect) next.add(id);
          else next.delete(id);
        });
      } else if (shouldSelect) {
        next.add(conversationId);
      } else {
        next.delete(conversationId);
      }
      return next;
    });
    lastSelectionIndexRef.current = index;
  };

  const selectConversation = (conversation: Conversation) => {
    setSelectedConversationId(conversation.id);
    setMobileConversationOpen(true);
    setContextOpen(false);
    if (conversation.unread)
      setConversations((current) =>
        current.map((item) =>
          item.id === conversation.id ? { ...item, unread: 0 } : item,
        ),
      );
    if (liveMode && workspaceId && conversation.unread)
      void markLiveConversationRead({
        workspaceId,
        conversationId: conversation.id,
      }).catch((error) => onToast(localizedError(error, t("errors.markRead"))));
  };

  /**
   * Delivery failures the server can name. Each maps to the one thing the
   * operator can do about it, instead of the same "could not send" for a
   * dropped WhatsApp session, a refused message and a provider outage.
   */
  const sendFailureMessage = (error: unknown): string => {
    const code = error instanceof LiveActionError ? error.code : undefined;
    const key = code ? sendErrorKeys[code] : undefined;
    return localizedError(error, t(key ?? "errors.sendMessage"));
  };

  /**
   * Queues one outbound message and reports whether the thread took ownership
   * of it. Delivery is reported on the message itself: a failed send stays in
   * the thread as a failed bubble with retry, edit and cancel, so the composer
   * must let go of the text as soon as this resolves true. Returning delivery
   * success instead would leave the same message in two places at once.
   */
  const sendMessage = async (
    text: string,
    idempotencyKey?: string,
  ): Promise<boolean> => {
    if (!text.trim()) return false;
    const conversationId = selected.id;
    const clientId =
      idempotencyKey ??
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: Message = {
      id: `temp:${clientId}`,
      clientId,
      conversationId,
      direction: "outbound",
      sender: t("ui.you"),
      text: text.trim(),
      time: t("ui.now"),
      createdAt: new Date().toISOString(),
      type: "text",
      status: "sending",
    };
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [...item.messages, optimistic],
                lastMessage: optimistic.text,
                lastTime: "now",
                lastMessageAt: new Date().toISOString(),
                attention: "waiting_customer",
                unread: 0,
              }
            : item,
        ),
      ),
    );
    if (liveMode && workspaceId) {
      try {
        await sendLiveMessage({
          workspaceId,
          conversationId,
          text: text.trim(),
          idempotencyKey: clientId,
        });
        // Promote the optimistic bubble immediately so a slow/partial refresh
        // cannot leave the thread stuck on "Sending…" or a single bubble.
        setConversations((current) =>
          current.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === optimistic.id
                      ? { ...message, status: "sent" as const }
                      : message,
                  ),
                }
              : item,
          ),
        );
        const snapshot = await loadLiveConversationSnapshot(
          workspaceId,
          conversationId,
        );
        if (snapshot)
          setConversations((current) =>
            mergeConversationSnapshot(current, snapshot),
          );
        onToast(
          selected.aiMode === "safe_auto" &&
            selected.automationState === "ai_active"
            ? t("toasts.messageSentAiPaused")
            : t("toasts.messageAccepted"),
        );
        return true;
      } catch (error) {
        setConversations((current) =>
          current.map((item) =>
            item.id === conversationId
              ? {
                  ...item,
                  messages: item.messages.map((message) =>
                    message.id === optimistic.id
                      ? { ...message, status: "failed" }
                      : message,
                  ),
                }
              : item,
          ),
        );
        onToast(sendFailureMessage(error), "error");
        return true;
      }
    }
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              messages: item.messages.map((message) =>
                message.id === optimistic.id
                  ? { ...message, id: `m-${Date.now()}`, status: "sent" }
                  : message,
              ),
            }
          : item,
      ),
    );
    onToast(t("toasts.messageSent"));
    return true;
  };

  /**
   * Queues one attachment batch. Same ownership contract as `sendMessage`: true
   * means the thread now holds these attachments, whether or not the provider
   * accepted them, so the composer tray clears instead of duplicating them.
   */
  const sendMediaBatch = async (
    inputs: ComposerMediaInput[],
  ): Promise<boolean> => {
    if (!liveMode || !workspaceId) {
      onToast(t("toasts.attachmentsUnavailable"), "error");
      return false;
    }
    const conversationId = selected.id;
    const batchId = globalThis.crypto?.randomUUID?.() ?? `batch-${Date.now()}`;
    const pending = inputs.map((input) => {
      const clientId =
        globalThis.crypto?.randomUUID?.() ??
        `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return {
        input,
        clientId,
        optimistic: {
          id: `temp:${clientId}`,
          clientId,
          conversationId,
          direction: "outbound" as const,
          sender: "You",
          text: input.caption ?? "",
          time: "now",
          createdAt: new Date().toISOString(),
          type: input.messageType,
          status: "sending" as const,
          mediaBatchId: batchId,
          attachment: {
            name: input.fileName ?? input.file?.name ?? input.messageType,
            meta: input.mimeType ?? input.file?.type ?? "Attachment",
          },
        } satisfies Message,
      };
    });
    pending.forEach((item) =>
      failedMediaRetryInputsRef.current.set(item.optimistic.id, item.input),
    );
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [
                  ...item.messages,
                  ...pending.map((item) => item.optimistic),
                ],
                lastMessage:
                  conversationPreviewText(pending.at(-1)?.optimistic) ||
                  t("ui.attachment"),
                lastTime: t("ui.now"),
                lastMessageAt: new Date().toISOString(),
                attention: "waiting_customer",
                unread: 0,
              }
            : item,
        ),
      ),
    );
    try {
      const uploaded: Array<{
        assetId: string;
        messageType: ComposerMediaInput["messageType"];
        caption?: string;
        idempotencyKey: string;
      }> = [];
      for (const item of pending) {
        if (item.input.file) {
          const asset = await uploadLiveMediaAsset({
            workspaceId,
            conversationId,
            file: item.input.file,
            batchId,
            onProgress: (progress) => item.input.onProgress?.(progress.percent),
          });
          uploaded.push({
            assetId: asset.assetId,
            messageType: item.input.messageType,
            caption: item.input.caption,
            idempotencyKey: item.clientId,
          });
        } else if (item.input.mediaUrl) {
          await sendLiveMedia({
            workspaceId,
            conversationId,
            ...item.input,
            idempotencyKey: item.clientId,
          });
        }
      }
      if (uploaded.length)
        await sendLiveMediaBatch({
          workspaceId,
          conversationId,
          batchId,
          attachments: uploaded,
        });
      const snapshot = await loadLiveConversationSnapshot(
        workspaceId,
        conversationId,
      );
      pending.forEach((item) =>
        failedMediaRetryInputsRef.current.delete(item.optimistic.id),
      );
      if (snapshot)
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
      onToast(t("toasts.attachmentAccepted"));
      return true;
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: item.messages.map((message) =>
                  pending.some((entry) => entry.optimistic.id === message.id)
                    ? { ...message, status: "failed" }
                    : message,
                ),
              }
            : item,
        ),
      );
      onToast(localizedError(error, t("errors.sendAttachment")), "error");
      return true;
    }
  };

  const setAiMode = async (mode: AiMode) => {
    if (
      mode === "safe_auto" &&
      !(await onConfirm({
        title: t("confirmations.enableAutoReplyTitle"),
        description: t("confirmations.enableAutoReplyDescription"),
        confirmLabel: t("confirmations.enableAutoReplyConfirm"),
      }))
    )
      return;
    if (liveMode && workspaceId)
      void updateLiveConversation({
        workspaceId,
        conversationId: selected.id,
        updates: { ai_mode: mode },
      }).catch((error) =>
        onToast(localizedError(error, t("errors.saveAiMode"))),
      );
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              aiMode: mode,
              attention: mode === "safe_auto" ? "ai_handling" : item.attention,
            }
          : item,
      ),
    );
    onToast(`AI mode: ${mode === "safe_auto" ? "safe auto" : mode}`);
  };

  const setAiPause = async (paused: boolean) => {
    const previous = selected.automationState;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              automationState: paused ? "human_paused" : "ai_active",
              attention: paused ? "needs_attention" : item.attention,
              ...(paused
                ? { humanTakeoverReason: "manual_pause" as const }
                : {}),
            }
          : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (paused)
          await pauseLiveConversationAi({
            workspaceId,
            conversationId: selected.id,
          });
        else
          await resumeLiveConversationAi({
            workspaceId,
            conversationId: selected.id,
          });
      }
      onToast(paused ? t("toasts.aiPaused") : t("toasts.aiResumed"));
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id
            ? { ...item, automationState: previous }
            : item,
        ),
      );
      onToast(localizedError(error, t("errors.saveAiState")));
    }
  };

  const setConversationState = async (status: "snoozed" | "resolved") => {
    const previous = selected;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, status, attention: "none" } : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (status === "snoozed")
          await snoozeLiveConversation({
            workspaceId,
            conversationId: selected.id,
            until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          });
        else
          await resolveLiveConversation({
            workspaceId,
            conversationId: selected.id,
          });
      }
      onToast(
        status === "snoozed"
          ? t("toasts.conversationSnoozed")
          : t("toasts.conversationResolved"),
      );
    } catch (error) {
      setConversations((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );
      onToast(localizedError(error, t("errors.conversationState")));
    }
  };

  const deleteConversation = async (conversationId = selected.id) => {
    if (
      !(await onConfirm({
        title: t("confirmations.deleteConversationTitle"),
        description: t("confirmations.deleteConversationDescription"),
        confirmLabel: t("confirmations.deleteConversationConfirm"),
        destructive: true,
      }))
    )
      return;
    const nextConversation = conversations.find(
      (conversation) => conversation.id !== conversationId,
    );
    setConversationDeleting(true);
    try {
      if (liveMode && workspaceId)
        await deleteLiveConversation({ workspaceId, conversationId });
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      if (selected.id === conversationId) {
        setSelectedConversationId(nextConversation?.id ?? "");
        setMobileConversationOpen(false);
      }
      onToast(t("toasts.conversationDeleted"));
    } catch (error) {
      onToast(localizedError(error, t("errors.deleteConversation")));
    } finally {
      setConversationDeleting(false);
    }
  };

  const applyBulkAiMode = async (mode: AiMode) => {
    const ids = selectionVisibleIds.filter((id) =>
      selectedConversationIds.has(id),
    );
    if (!ids.length || bulkPending) return;
    if (
      mode === "safe_auto" &&
      !(await onConfirm({
        title: t("bulk.confirmAutoTitle", { count: ids.length }),
        description: t("bulk.confirmAutoDescription"),
        confirmLabel: t("bulk.confirmAutoAction"),
      }))
    )
      return;
    setBulkPending(true);
    const results = liveMode
      ? await Promise.allSettled(
          ids.map((conversationId) => {
            if (!workspaceId)
              return Promise.reject(new Error("workspace_missing"));
            return updateLiveConversation({
              workspaceId,
              conversationId,
              updates: { ai_mode: mode },
            });
          }),
        )
      : ids.map(() => ({ status: "fulfilled" as const, value: undefined }));
    const succeeded = new Set(
      ids.filter((_, index) => results[index]?.status === "fulfilled"),
    );
    setConversations((current) =>
      current.map((conversation) =>
        succeeded.has(conversation.id)
          ? {
              ...conversation,
              aiMode: mode,
              attention:
                mode === "safe_auto"
                  ? "ai_handling"
                  : conversation.attention === "ai_handling"
                    ? "none"
                    : conversation.attention,
            }
          : conversation,
      ),
    );
    setBulkPending(false);
    if (succeeded.size === ids.length) {
      onToast(t("bulk.aiModeUpdated", { count: succeeded.size }));
      exitSelectionMode();
      return;
    }
    setSelectedConversationIds(new Set(ids.filter((id) => !succeeded.has(id))));
    onToast(
      t("bulk.partialFailure", {
        success: succeeded.size,
        failed: ids.length - succeeded.size,
      }),
    );
  };

  const deleteSelectedConversations = async () => {
    const ids = selectionVisibleIds.filter((id) =>
      selectedConversationIds.has(id),
    );
    if (!ids.length || bulkPending) return;
    if (
      !(await onConfirm({
        title: t("bulk.deleteTitle", { count: ids.length }),
        description: t("bulk.deleteDescription"),
        confirmLabel: t("bulk.deleteAction", { count: ids.length }),
        destructive: true,
      }))
    )
      return;
    setBulkPending(true);
    const results = liveMode
      ? await Promise.allSettled(
          ids.map((conversationId) => {
            if (!workspaceId)
              return Promise.reject(new Error("workspace_missing"));
            return deleteLiveConversation({ workspaceId, conversationId });
          }),
        )
      : ids.map(() => ({ status: "fulfilled" as const, value: undefined }));
    const deleted = new Set(
      ids.filter((_, index) => results[index]?.status === "fulfilled"),
    );
    const remaining = conversations.filter(
      (conversation) => !deleted.has(conversation.id),
    );
    setConversations(remaining);
    if (deleted.has(selected.id)) {
      setSelectedConversationId(remaining[0]?.id ?? "");
      setMobileConversationOpen(false);
    }
    setBulkPending(false);
    if (deleted.size === ids.length) {
      onToast(t("bulk.deleted", { count: deleted.size }));
      exitSelectionMode();
      return;
    }
    setSelectedConversationIds(new Set(ids.filter((id) => !deleted.has(id))));
    onToast(
      t("bulk.partialFailure", {
        success: deleted.size,
        failed: ids.length - deleted.size,
      }),
    );
  };

  const deleteMessage = async (message: Message) => {
    if (
      !(await onConfirm({
        title: t("confirmations.deleteMessageTitle"),
        description: t("confirmations.deleteMessageDescription"),
        confirmLabel: t("confirmations.deleteMessageConfirm"),
        destructive: true,
      }))
    )
      return;
    if (liveMode && workspaceId && !message.providerMessageId) {
      onToast(t("errors.missingMessageId"));
      return;
    }
    setMessageActionId(message.id);
    try {
      if (liveMode && workspaceId)
        await deleteLiveMessage({
          workspaceId,
          conversationId: selected.id,
          messageId: message.id,
        });
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selected.id
            ? {
                ...conversation,
                messages: conversation.messages.map((item) =>
                  item.id === message.id
                    ? { ...item, deleted: true, text: "" }
                    : item,
                ),
              }
            : conversation,
        ),
      );
      onToast(t("toasts.messageDeleted"));
    } catch (error) {
      onToast(localizedError(error, t("errors.deleteMessage")));
    } finally {
      setMessageActionId(undefined);
    }
  };

  const removeFailedMessage = (messageId: string) => {
    failedMediaRetryInputsRef.current.delete(messageId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selected.id
          ? {
              ...conversation,
              messages: conversation.messages.filter(
                (message) => message.id !== messageId,
              ),
            }
          : conversation,
      ),
    );
  };

  const editFailedMessage = (message: Message) => {
    const mediaInput =
      message.type === "text"
        ? undefined
        : failedMediaRetryInputsRef.current.get(message.id);
    if (message.type !== "text" && !mediaInput) {
      onToast(t("errors.editMessage"));
      return;
    }
    removeFailedMessage(message.id);
    setDraftInsertRequest({
      text: message.text,
      requestId: Date.now(),
      conversationId: selected.id,
      mediaInput,
    });
  };

  const retryFailedMessage = async (message: Message) => {
    if (messageActionId) return;
    const mediaInput =
      message.type === "text"
        ? undefined
        : failedMediaRetryInputsRef.current.get(message.id);
    if (message.type !== "text" && !mediaInput) {
      onToast(t("errors.retryMessage"));
      return;
    }
    setMessageActionId(message.id);
    removeFailedMessage(message.id);
    try {
      if (message.type === "text")
        await sendMessage(message.text, message.clientId);
      else if (mediaInput)
        await sendMediaBatch([
          { ...mediaInput, caption: message.text || mediaInput.caption },
        ]);
    } finally {
      setMessageActionId(undefined);
    }
  };

  const cancelFailedMessage = (message: Message) => {
    removeFailedMessage(message.id);
    onToast(t("toasts.messageCanceled"));
  };

  const reactToMessage = async (message: Message, reaction: string) => {
    if (reactionPendingId) return;
    if (liveMode && workspaceId && !uuidPattern.test(message.id)) {
      onToast(t("errors.syncingMessage"));
      return;
    }
    if (liveMode && workspaceId && !message.providerMessageId) {
      onToast(t("errors.syncingMessage"));
      return;
    }
    const currentReaction = message.reactions?.find((item) => item.mine)?.emoji;
    const nextReaction = currentReaction === reaction ? "" : reaction;
    const currentReactions = message.reactions ?? [];
    const optimisticReactions = [
      ...currentReactions.filter((item) => !item.mine),
      ...(nextReaction
        ? [{ emoji: nextReaction, mine: true, pending: true }]
        : currentReaction
          ? [{ emoji: currentReaction, mine: true, pending: true }]
          : []),
    ];
    setReactionPendingId(message.id);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === selected.id
          ? {
              ...conversation,
              messages: conversation.messages.map((item) =>
                item.id === message.id
                  ? {
                      ...item,
                      reactions: optimisticReactions,
                      pendingReaction: nextReaction,
                    }
                  : item,
              ),
            }
          : conversation,
      ),
    );
    try {
      if (liveMode && workspaceId)
        await reactToLiveMessage({
          workspaceId,
          conversationId: selected.id,
          messageId: message.id,
          reaction: nextReaction,
        });
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selected.id
            ? {
                ...conversation,
                messages: conversation.messages.map((item) =>
                  item.id === message.id
                    ? {
                        ...item,
                        reactions: optimisticReactions.map(
                          ({ pending: _pending, ...itemReaction }) =>
                            itemReaction,
                        ),
                        pendingReaction: undefined,
                      }
                    : item,
                ),
              }
            : conversation,
        ),
      );
      onToast(
        nextReaction
          ? t("toasts.reactionSent", { emoji: nextReaction })
          : t("toasts.reactionRemoved"),
      );
    } catch (error) {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selected.id
            ? {
                ...conversation,
                messages: conversation.messages.map((item) =>
                  item.id === message.id
                    ? {
                        ...item,
                        reactions: currentReactions,
                        pendingReaction: undefined,
                      }
                    : item,
                ),
              }
            : conversation,
        ),
      );
      onToast(localizedError(error, t("errors.reaction")));
    } finally {
      setReactionPendingId(undefined);
    }
  };

  const notifyTyping = () => {
    if (!liveMode || !workspaceId) return;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      void sendLivePresence({
        workspaceId,
        conversationId: selected.id,
        presence: "composing",
      }).catch(() => undefined);
    }, 700);
  };

  const assignConversation = async (assignee: string) => {
    const previous = selected.assignee;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id ? { ...item, assignee } : item,
      ),
    );
    try {
      if (liveMode && workspaceId)
        await updateLiveConversation({
          workspaceId,
          conversationId: selected.id,
          updates: {
            assigned_user_id: assignee === "Unassigned" ? null : assignee,
          },
        });
      onToast(t("toasts.assigned", { assignee: assigneeLabel(assignee) }));
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, assignee: previous } : item,
        ),
      );
      onToast(localizedError(error, t("errors.assignment")));
    }
  };

  const saveContactName = async (displayName: string) => {
    const nextName = displayName.trim();
    if (!nextName || !selected.contactId || !workspaceId) return;
    const previous = {
      name: selected.name,
      initials: selected.initials,
    };
    const nextInitials =
      nextName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "?";
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? { ...item, name: nextName, initials: nextInitials }
          : item,
      ),
    );
    try {
      await updateLiveContact({
        workspaceId,
        contactId: selected.contactId,
        displayName: nextName,
      });
      onToast(t("toasts.contactSaved"));
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, ...previous } : item,
        ),
      );
      onToast(localizedError(error, t("errors.contactName")));
    }
  };

  return (
    <div
      className={`inbox-page ${mobileConversationOpen ? "mobile-detail-open" : ""}`}
    >
      <div className="inbox-toolbar">
        <div>
          <h1>
            {t("title")}{" "}
            <span className="title-count">
              {conversations.filter((item) => item.unread > 0).length}
            </span>
          </h1>
        </div>
        <div className="toolbar-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`button button-ghost inbox-filter-trigger ${filter !== "all" ? "is-active" : ""}`}
                type="button"
                aria-label={t("filters.triggerLabel", {
                  filter: filterLabel(filter),
                })}
              >
                <Filter size={15} />
                <span>{filterLabel(filter)}</span>
                {filter !== "all" && <b>{countForFilter(filter)}</b>}
                <ChevronDownIcon size={13} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="inbox-filter-menu">
              <DropdownMenuLabel>{t("filters.menuLabel")}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={filter}
                onValueChange={(value) => setFilter(value as InboxFilter)}
              >
                {inboxFilterValues.map((item) => (
                  <DropdownMenuRadioItem
                    key={item}
                    value={item}
                    onSelect={() => setFilter(item)}
                  >
                    <span>{filterLabel(item)}</span>
                    <b>{countForFilter(item)}</b>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            className="button button-primary inbox-new-chat"
            type="button"
            aria-expanded={newChatOpen}
            aria-controls={NEW_CHAT_DIALOG_ID}
            onClick={openNewChat}
          >
            <Plus size={15} /> {t("newChat.trigger")}
          </button>
        </div>
      </div>
      <div
        className={`inbox-layout ${mobileConversationOpen ? "mobile-conversation-open" : ""} ${filtered.length === 0 ? "no-visible-conversation" : ""}`}
      >
        <section className="conversation-rail">
          <div className="rail-heading">
            <span>
              {t("ui.conversations")}{" "}
              <span className="count-muted">{filtered.length}</span>
            </span>
            <button
              className="text-button inbox-select-trigger"
              type="button"
              aria-pressed={selectionMode}
              onClick={() =>
                selectionMode ? exitSelectionMode() : setSelectionMode(true)
              }
            >
              {selectionMode ? t("bulk.cancel") : t("bulk.select")}
            </button>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              ref={searchRef}
              data-global-search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("ui.search")}
              aria-label={t("ui.search")}
            />
            <kbd>/</kbd>
          </label>
          {selectionMode && (
            <div className="inbox-bulk-bar" aria-label={t("bulk.actions")}>
              <label className="inbox-select-all">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!filtered.length || bulkPending}
                />
                <span aria-live="polite">
                  {t("bulk.selected", { count: visibleSelectedCount })}
                </span>
              </label>
              <div className="inbox-bulk-actions">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="button button-ghost inbox-bulk-mode"
                      type="button"
                      disabled={!visibleSelectedCount || bulkPending}
                    >
                      <Sparkles size={14} />
                      <span>{t("bulk.aiMode")}</span>
                      <ChevronDownIcon size={12} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      {t("bulk.aiModeLabel")}
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={() => void applyBulkAiMode("safe_auto")}
                    >
                      <Zap size={14} /> {t("ui.autoReply")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void applyBulkAiMode("draft")}
                    >
                      <Sparkles size={14} /> {t("ui.copilot")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void applyBulkAiMode("off")}
                    >
                      <UserRound size={14} /> {t("ui.manual")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button
                  className="icon-button subtle inbox-bulk-delete"
                  type="button"
                  aria-label={t("bulk.deleteSelected")}
                  disabled={!visibleSelectedCount || bulkPending}
                  onClick={() => void deleteSelectedConversations()}
                >
                  {bulkPending ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Trash2 size={15} />
                  )}
                </button>
              </div>
            </div>
          )}
          <ScrollArea
            className="conversation-list"
            viewportClassName="conversation-list-viewport"
            type="always"
          >
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selected.id}
                selectionMode={selectionMode}
                checked={selectedConversationIds.has(conversation.id)}
                selectionDisabled={bulkPending}
                onSelectionChange={(event) =>
                  toggleConversationSelection(
                    conversation.id,
                    (event.nativeEvent as MouseEvent).shiftKey,
                  )
                }
                onClick={(event) =>
                  selectionMode
                    ? toggleConversationSelection(
                        conversation.id,
                        event.shiftKey,
                      )
                    : selectConversation(conversation)
                }
                onDelete={() => void deleteConversation(conversation.id)}
              />
            ))}
            {filtered.length === 0 && (
              <EmptyState
                title={t("ui.noResults")}
                description={t("ui.tryDifferent")}
                search={Boolean(search)}
                action={
                  search || filter !== "all" ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      {t("ui.clearFilters")}
                    </button>
                  ) : undefined
                }
              />
            )}
          </ScrollArea>
        </section>
        <section className="conversation-panel">
          <ConversationHeader
            conversation={selected}
            onMobileBack={() => {
              setContextOpen(false);
              setMobileConversationOpen(false);
            }}
            onOpenLinkedIssue={
              activeIssue ? () => onOpenIssue(activeIssue.id) : undefined
            }
            onSetAiMode={setAiMode}
            onSetAiPause={(paused) => void setAiPause(paused)}
            onSnooze={() => void setConversationState("snoozed")}
            onResolve={() => void setConversationState("resolved")}
            onDelete={() => void deleteConversation()}
            deleting={conversationDeleting}
            onAssign={assignConversation}
            onRename={saveContactName}
            assigneeOptions={assigneeOptions}
            aiDetailsOpen={aiDetailsOpen}
            onToggleAiDetails={() => setAiDetailsOpen((current) => !current)}
            contextOpen={contextOpen}
            onOpenContext={() => setContextOpen(true)}
          />
          <div className="message-canvas-shell">
            <ScrollArea
              className="message-canvas-scroll-area"
              viewportClassName="message-canvas"
              viewportRef={messageCanvasRef}
              type="always"
            >
              {selected.messages.length ? (
                selected.messages.map((message, index) => {
                  const dayKey = getMessageDayKey(message.createdAt);
                  const previousDayKey = getMessageDayKey(
                    selected.messages[index - 1]?.createdAt,
                  );
                  const dayLabel = getMessageDayLabel(
                    message.createdAt,
                    messageDayNow,
                  );
                  const showDayDivider = dayKey
                    ? dayKey !== previousDayKey
                    : index === 0;
                  const dayText =
                    dayLabel?.kind === "today"
                      ? t("ui.today")
                      : dayLabel?.kind === "yesterday"
                        ? t("ui.yesterday")
                        : (dayLabel?.value ?? t("ui.today"));

                  return (
                    <Fragment key={message.id}>
                      {showDayDivider && (
                        <div className="day-divider">
                          <span>{dayText}</span>
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        messageWorkspaceId={workspaceId ?? ""}
                        senderName={
                          message.senderUserId
                            ? senderNames[message.senderUserId]
                            : undefined
                        }
                        actionPending={messageActionId === message.id}
                        reactionPending={reactionPendingId === message.id}
                        onDelete={() => void deleteMessage(message)}
                        onEditFailed={() => editFailedMessage(message)}
                        onCancelFailed={() => cancelFailedMessage(message)}
                        onRetryFailed={() => void retryFailedMessage(message)}
                        onMediaError={() => refreshFailedMedia(message.id)}
                        onMediaResolved={(url) =>
                          setConversations((current) =>
                            current.map((conversation) =>
                              conversation.id !== selected.id
                                ? conversation
                                : {
                                    ...conversation,
                                    messages: conversation.messages.map(
                                      (candidate) =>
                                        candidate.id !== message.id
                                          ? candidate
                                          : {
                                              ...candidate,
                                              attachment: candidate.attachment
                                                ? {
                                                    ...candidate.attachment,
                                                    url,
                                                  }
                                                : candidate.attachment,
                                            },
                                    ),
                                  },
                            ),
                          )
                        }
                        onOpenMedia={() => openMediaViewer(message.id)}
                        onCopy={async () => {
                          if (!message.text) return;
                          try {
                            await navigator.clipboard.writeText(message.text);
                            onToast(t("toasts.messageCopied"));
                          } catch {
                            onToast(t("errors.copyMessage"));
                          }
                        }}
                        onReact={(reaction) =>
                          void reactToMessage(message, reaction)
                        }
                      />
                    </Fragment>
                  );
                })
              ) : (
                <EmptyState
                  title={t("ui.noMessages")}
                  description={t("ui.firstMessage")}
                />
              )}
              {activeIssue && (
                <button
                  className="issue-event"
                  type="button"
                  onClick={() => onOpenIssue(activeIssue.id)}
                >
                  <span className="issue-event-icon">
                    <CircleDot size={14} />
                  </span>
                  <span>
                    <strong>
                      {activeIssue.identifier} · {activeIssue.title}
                    </strong>
                    <small>
                      {t("ui.issueLinked")} ·{" "}
                      <StatusPill status={activeIssue.status} /> ·{" "}
                      <PriorityDot priority={activeIssue.priority} showLabel />
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              )}
            </ScrollArea>
            {showScrollDown && (
              <button
                className="scroll-down-cta"
                type="button"
                aria-label={t("ui.scrollLatest")}
                onClick={() => scrollMessagesToBottom("smooth")}
              >
                <ChevronDown size={14} /> {t("ui.newMessages")}
              </button>
            )}
          </div>
          <MediaComposer
            onSend={sendMessage}
            onTyping={notifyTyping}
            onSendMediaBatch={sendMediaBatch}
            aiMode={selected.aiMode}
            automationState={selected.automationState}
            liveMode={liveMode}
            prefillDraft={
              draftInsertRequest?.conversationId === selected.id
                ? draftInsertRequest
                : undefined
            }
            onUseDraft={async () => {
              if (!liveMode) return t("toasts.draftFallback");
              try {
                const result = await requestAiDraft(
                  selected.messages
                    .map((message) => `${message.sender}: ${message.text}`)
                    .join("\n"),
                  knowledgeArticles
                    .filter((article) => article.status === "Published")
                    .map((article) => `${article.title}\n${article.excerpt}`),
                  workspaceId
                    ? { workspaceId, conversationId: selected.id }
                    : undefined,
                );
                return result.draft;
              } catch (error) {
                onToast(localizedError(error, t("errors.draftUnavailable")));
                return "";
              }
            }}
          />
        </section>
        <InboxCaseContext
          conversation={selected}
          issue={activeIssue}
          open={contextOpen}
          onClose={() => setContextOpen(false)}
          onOpenIssue={(issueId) => {
            setContextOpen(false);
            onOpenIssue(issueId);
          }}
        >
          <div
            className={
              "conversation-insights " +
              (aiDetailsOpen ? "ai-details-open" : "")
            }
          >
            {showAiDecision && (
              <AiDecisionSummary
                conversation={selected}
                onDismiss={() =>
                  dismissSelectedAiCard("decision", decisionSignature)
                }
              />
            )}
            {showAiDraft && selected.aiDraft && (
              <AiDraftCard
                draft={selected.aiDraft}
                onInsert={(text) =>
                  setDraftInsertRequest({
                    text,
                    requestId: Date.now(),
                    conversationId: selected.id,
                  })
                }
                onDismiss={() => dismissSelectedAiCard("draft", draftSignature)}
              />
            )}
          </div>
        </InboxCaseContext>
      </div>
      <MediaLightbox
        items={lightboxMedia}
        index={mediaViewerIndex}
        onIndexChange={setMediaViewerIndex}
        onClose={() => setMediaViewerIndex(null)}
      />
      {newChatDialog}
    </div>
  );
}

function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxMedia[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("inbox");
  const current = index === null ? undefined : items[index];
  const [zoom, setZoom] = useState(1);
  const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setZoom(1);
    setZoomOffset({ x: 0, y: 0 });
  }, [current?.id]);

  const handleStageWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY === 0) return;
    event.preventDefault();

    const media = event.currentTarget.querySelector<HTMLElement>("img, video");
    if (!media || media.offsetWidth === 0 || media.offsetHeight === 0) return;

    const nextZoom = Math.min(
      3,
      Math.max(1, zoom * (event.deltaY < 0 ? 1.15 : 0.87)),
    );
    if (nextZoom === zoom) return;

    const rect = media.getBoundingClientRect();
    const pointerX = Math.min(Math.max(event.clientX, rect.left), rect.right);
    const pointerY = Math.min(Math.max(event.clientY, rect.top), rect.bottom);
    const layoutLeft =
      rect.left - zoomOffset.x + ((zoom - 1) * media.offsetWidth) / 2;
    const layoutTop =
      rect.top - zoomOffset.y + ((zoom - 1) * media.offsetHeight) / 2;
    const localX = (pointerX - rect.left) / zoom;
    const localY = (pointerY - rect.top) / zoom;
    const nextOffset =
      nextZoom === 1
        ? { x: 0, y: 0 }
        : {
            x:
              pointerX -
              nextZoom * localX -
              layoutLeft +
              ((nextZoom - 1) * media.offsetWidth) / 2,
            y:
              pointerY -
              nextZoom * localY -
              layoutTop +
              ((nextZoom - 1) * media.offsetHeight) / 2,
          };

    setZoomOffset(nextOffset);
    setZoom(nextZoom);
  };

  if (!current || index === null) return null;
  const hasPrevious = items.length > 1;
  const previousIndex = (index - 1 + items.length) % items.length;
  const nextIndex = (index + 1) % items.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="media-lightbox-dialog" showCloseButton={false}>
        <DialogTitle className="sr-only">{t("ui.mediaViewer")}</DialogTitle>
        <div className="media-lightbox-header">
          <div className="media-lightbox-heading">
            <span className="media-lightbox-kicker">
              {current.type === "image"
                ? t("ui.image").toUpperCase()
                : t("ui.video").toUpperCase()}
            </span>
            <span className="media-lightbox-counter" aria-live="polite">
              {index + 1} / {items.length}
            </span>
          </div>
          <div
            className="media-lightbox-tools"
            aria-label={t("ui.zoomControls")}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="media-lightbox-control"
              aria-label={t("ui.zoomOut")}
              disabled={zoom <= 1}
              onClick={() => {
                setZoom((value) => Math.max(1, value - 0.25));
              }}
            >
              <ZoomOut />
            </Button>
            <button
              type="button"
              className="media-lightbox-zoom-reset"
              aria-label={t("ui.resetZoom")}
              onClick={() => {
                setZoom(1);
                setZoomOffset({ x: 0, y: 0 });
              }}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="media-lightbox-control"
              aria-label={t("ui.zoomIn")}
              disabled={zoom >= 3}
              onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
            >
              <ZoomIn />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="media-lightbox-close"
            aria-label={t("ui.closeMediaViewer")}
            onClick={onClose}
          >
            <X />
          </Button>
        </div>
        <div
          className="media-lightbox-stage"
          data-zoom={zoom}
          onWheel={handleStageWheel}
          aria-label={t("ui.zoomControls")}
        >
          <div className="media-lightbox-media-frame">
            {current.type === "image" ? (
              <img
                src={current.url}
                alt={current.name}
                style={{
                  transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                }}
              />
            ) : (
              <video
                controls
                autoPlay
                playsInline
                preload="metadata"
                src={current.url}
                style={{
                  transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                }}
              />
            )}
          </div>
        </div>
        <div className="media-lightbox-footer">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="media-lightbox-nav"
            aria-label={t("ui.previousMedia")}
            disabled={!hasPrevious}
            onClick={() => onIndexChange(previousIndex)}
          >
            <ChevronLeft />
          </Button>
          <div className="media-lightbox-caption">
            <strong>{current.name}</strong>
            <span>{current.meta}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="media-lightbox-nav"
            aria-label={t("ui.nextMedia")}
            disabled={!hasPrevious}
            onClick={() => onIndexChange(nextIndex)}
          >
            <ChevronRight />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversationRow({
  conversation,
  selected,
  selectionMode,
  checked,
  selectionDisabled,
  onSelectionChange,
  onClick,
  onDelete,
}: {
  conversation: Conversation;
  selected: boolean;
  selectionMode: boolean;
  checked: boolean;
  selectionDisabled: boolean;
  onSelectionChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("inbox");
  return (
    <div
      className={`conversation-row ${selected ? "selected" : ""} ${checked ? "bulk-selected" : ""}`}
    >
      {selectionMode && (
        <label
          className="conversation-select"
          aria-label={t("bulk.selectConversation", {
            name: conversation.name,
          })}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={selectionDisabled}
            onChange={onSelectionChange}
          />
        </label>
      )}
      <button
        className="conversation-row-hit"
        type="button"
        aria-current={!selectionMode && selected ? "true" : undefined}
        aria-label={
          selectionMode
            ? t("bulk.toggleConversation", { name: conversation.name })
            : t("ui.openConversation", { name: conversation.name })
        }
        onClick={onClick}
      >
        <div
          className="conversation-avatar"
          style={{
            background: `${conversation.accent}18`,
            color: conversation.accent,
          }}
        >
          {conversation.initials}
        </div>
        <div className="conversation-row-main">
          <div className="conversation-row-top">
            <strong>
              {conversation.name}
              {conversation.chatType === "group" && (
                <span className="group-badge">{t("ui.group")}</span>
              )}
            </strong>
            <span>{conversation.lastTime}</span>
          </div>
          <div className="conversation-preview">{conversation.lastMessage}</div>
          <div className="conversation-row-meta">
            <span>
              {conversation.issueLabel ? (
                <>
                  <CircleDot size={11} /> {conversation.issueLabel}
                </>
              ) : (
                conversation.company
              )}
            </span>
            {conversation.priority && (
              <PriorityDot priority={conversation.priority} />
            )}
            {conversation.unread > 0 && (
              <b className="unread-count">{conversation.unread}</b>
            )}
          </div>
        </div>
      </button>
      {!selectionMode && (
        <div className="conversation-row-actions">
          <ActionMenu label={conversation.name}>
            <button
              className="danger"
              type="button"
              role="menuitem"
              onClick={onDelete}
            >
              <Trash2 size={14} /> {t("ui.deleteConversation")}
            </button>
          </ActionMenu>
        </div>
      )}
      <div className={`attention-marker ${conversation.attention}`} />
    </div>
  );
}

function AiDecisionSummary({
  conversation,
  onDismiss,
}: {
  conversation: Conversation;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("inbox");
  if (
    !conversation.aiDecision &&
    !conversation.aiIntent &&
    !conversation.aiSummary &&
    conversation.automationState !== "human_paused"
  )
    return null;

  const blocked =
    conversation.automationState !== "human_paused" &&
    conversation.aiDecision === "blocked";
  const title =
    conversation.automationState === "human_paused"
      ? t("ui.humanTakeover")
      : blocked
        ? t("ui.aiBlocked")
        : conversation.aiDecision === "auto_reply"
          ? t("ui.autoReplyEligible")
          : t("ui.copilotDrafts");
  return (
    <aside
      className={`ai-decision-card ${blocked ? "blocked" : ""} ${conversation.automationState === "human_paused" ? "paused" : ""}`}
      aria-label={t("ui.aiDecisionSummary")}
    >
      <div className="ai-decision-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> {title}
        </span>
        <span className="ai-decision-heading-actions">
          {conversation.aiConfidence !== undefined && (
            <span className="ai-confidence">
              {Math.round(conversation.aiConfidence * 100)}%{" "}
              {t("ui.confidence")}
            </span>
          )}
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label={t("ui.hideAiDetails")}
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="ai-decision-meta">
        {conversation.aiIntent && (
          <span>
            {t("ui.intent", {
              intent: conversation.aiIntent.replaceAll("_", " "),
            })}
          </span>
        )}
        {conversation.aiDecisionReason && (
          <span>{conversation.aiDecisionReason}</span>
        )}
      </div>
      {conversation.aiSummary && (
        <p className="ai-decision-summary">{conversation.aiSummary}</p>
      )}
    </aside>
  );
}

function AiDraftCard({
  draft,
  onInsert,
  onDismiss,
}: {
  draft: AiDraft;
  onInsert: (text: string) => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation("inbox");
  return (
    <aside className="ai-draft-card" aria-label={t("ui.persistedDraft")}>
      <div className="ai-draft-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> {t("ui.draftReady")}
        </span>
        <span className="ai-draft-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => onInsert(draft.body)}
          >
            {t("ui.insertDraft")}
          </button>
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label={t("ui.hideAiDraft")}
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      <p className="ai-draft-body">{draft.body}</p>
      {(draft.safetyReason || draft.sources.length > 0) && (
        <div className="ai-draft-meta">
          {draft.safetyReason && <span>{draft.safetyReason}</span>}
          {draft.sources.length > 0 && (
            <span>
              {t("ui.sources", {
                sources: draft.sources.map((source) => source.title).join(", "),
              })}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

function ConversationHeader({
  conversation,
  onMobileBack,
  onOpenLinkedIssue,
  onSetAiMode,
  onSetAiPause,
  onSnooze,
  onResolve,
  onDelete,
  deleting,
  onAssign,
  onRename,
  assigneeOptions,
  aiDetailsOpen,
  onToggleAiDetails,
  contextOpen,
  onOpenContext,
}: {
  conversation: Conversation;
  onMobileBack: () => void;
  onOpenLinkedIssue?: () => void;
  onSetAiMode: (mode: AiMode) => void;
  onSetAiPause: (paused: boolean) => void;
  onSnooze: () => void;
  onResolve: () => void;
  onDelete: () => void;
  deleting: boolean;
  onAssign: (assignee: string) => void;
  onRename: (displayName: string) => void | Promise<void>;
  assigneeOptions: AssigneeOption[];
  aiDetailsOpen: boolean;
  onToggleAiDetails: () => void;
  contextOpen: boolean;
  onOpenContext: () => void;
}) {
  const { t } = useTranslation("inbox");
  const conversationAssigneeOptions = assigneeOptions.map((option) =>
    option.value === conversation.assignee
      ? { ...option, disabled: false }
      : option,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(conversation.name);
  useEffect(() => {
    setDraftName(conversation.name);
    setEditingName(false);
  }, [conversation.id, conversation.name]);
  return (
    <header className="conversation-header">
      <button
        className="mobile-conversation-back"
        type="button"
        onClick={onMobileBack}
        aria-label={t("ui.conversations")}
      >
        <ArrowLeft size={20} />
      </button>
      <div className="conversation-identity">
        <div
          className="conversation-avatar large"
          style={{
            background: `${conversation.accent}18`,
            color: conversation.accent,
          }}
        >
          {conversation.initials}
        </div>
        <div>
          <div className="identity-name">
            {editingName ? (
              <form
                className="identity-name-editor"
                onSubmit={(event) => {
                  event.preventDefault();
                  void Promise.resolve(onRename(draftName)).then(() =>
                    setEditingName(false),
                  );
                }}
              >
                <input
                  autoFocus
                  aria-label={t("ui.contactName")}
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
                <button
                  className="icon-button subtle"
                  type="submit"
                  aria-label={t("ui.saveContactName")}
                >
                  <Check size={14} />
                </button>
                <button
                  className="icon-button subtle"
                  type="button"
                  aria-label={t("ui.cancelContactEdit")}
                  onClick={() => {
                    setDraftName(conversation.name);
                    setEditingName(false);
                  }}
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <>
                <h2>{conversation.name}</h2>
                {conversation.chatType === "group" && (
                  <span className="group-badge">{t("ui.group")}</span>
                )}
              </>
            )}
          </div>
          <p>
            {conversation.chatType === "group"
              ? t("ui.groupChat")
              : conversation.phone}
            {conversation.company ? ` · ${conversation.company}` : ""}
          </p>
        </div>
      </div>
      <div className="conversation-controls">
        <label className="conversation-assignee conversation-desktop-control">
          <UserRound size={13} aria-hidden="true" />
          <span className="sr-only">{t("ui.conversationAssignee")}</span>
          <Select
            ariaLabel={t("ui.conversationAssignee")}
            value={conversation.assignee}
            options={conversationAssigneeOptions}
            onChange={onAssign}
          />
        </label>
        <span
          className={`mode-label ${conversation.aiMode} ${conversation.automationState}`}
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>
            {conversation.automationState === "human_paused"
              ? t("ui.humanTakeover")
              : conversation.aiMode === "safe_auto"
                ? t("ui.autoReply")
                : conversation.aiMode === "draft"
                  ? t("ui.copilot")
                  : t("ui.manual")}
          </span>
        </span>
        {conversation.humanTakeoverReason && (
          <span className="ai-reason" title={t("ui.humanTakeoverReason")}>
            {conversation.humanTakeoverReason.replaceAll("_", " ")}
          </span>
        )}
        {conversation.humanTakeoverReason?.startsWith("support_ai_") && (
          <Link
            className="text-button conversation-desktop-control"
            to="/settings/engineering/agents/support"
          >
            {t("ui.configureSupportAi")}
          </Link>
        )}
        <button
          className="icon-button inbox-context-trigger"
          type="button"
          aria-label={t("context.open")}
          aria-expanded={contextOpen}
          aria-controls={INBOX_CASE_CONTEXT_ID}
          onClick={onOpenContext}
        >
          <PanelRight size={16} />
        </button>
        {onOpenLinkedIssue && (
          <button
            className="icon-button conversation-desktop-control"
            type="button"
            onClick={onOpenLinkedIssue}
            aria-label={t("ui.openLinkedIssue")}
          >
            <CircleDot size={16} />
          </button>
        )}
        <div className="menu-wrap">
          <button
            className="icon-button"
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t("ui.conversationActions")}
          >
            <Ellipsis size={17} />
          </button>
          {menuOpen && (
            <div className="context-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                disabled={!conversation.contactId}
                onClick={() => {
                  setEditingName(true);
                  setMenuOpen(false);
                }}
              >
                <PenLine size={14} /> {t("ui.editContactName")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleAiDetails();
                  setMenuOpen(false);
                }}
              >
                <Sparkles size={14} />
                {aiDetailsOpen ? t("ui.hideAiDetails") : t("ui.showAiDetails")}
              </button>
              <label className="context-menu-select mobile-menu-control">
                <UserRound size={14} />
                <span>{t("ui.assignee")}</span>
                <Select
                  ariaLabel={t("ui.conversationAssignee")}
                  value={conversation.assignee}
                  options={conversationAssigneeOptions}
                  onChange={(value) => {
                    onAssign(value);
                    setMenuOpen(false);
                  }}
                />
              </label>
              {onOpenLinkedIssue && (
                <button
                  className="mobile-menu-control"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onOpenLinkedIssue();
                    setMenuOpen(false);
                  }}
                >
                  <CircleDot size={14} /> {t("ui.openLinkedIssue")}
                </button>
              )}
              <hr className="mobile-menu-control" />
              {conversation.humanTakeoverReason?.startsWith("support_ai_") && (
                <Link
                  className="mobile-menu-control"
                  role="menuitem"
                  to="/settings/engineering/agents/support"
                  onClick={() => setMenuOpen(false)}
                >
                  <LockKeyhole size={14} /> {t("ui.configureSupportAi")}
                </Link>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("draft");
                  setMenuOpen(false);
                }}
              >
                <PenLine size={14} /> {t("ui.copilot")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("safe_auto");
                  setMenuOpen(false);
                }}
              >
                <Zap size={14} /> {t("ui.autoReply")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("off");
                  setMenuOpen(false);
                }}
              >
                <LockKeyhole size={14} /> {t("ui.manual")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiPause(conversation.automationState !== "human_paused");
                  setMenuOpen(false);
                }}
              >
                {conversation.automationState === "human_paused" ? (
                  <>
                    <Zap size={14} /> {t("ui.resumeAi")}
                  </>
                ) : (
                  <>
                    <LockKeyhole size={14} /> {t("ui.pauseAi")}
                  </>
                )}
              </button>
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSnooze();
                  setMenuOpen(false);
                }}
              >
                <Archive size={14} /> {t("ui.snoozeConversation")}
              </button>
              {conversation.status !== "resolved" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onResolve();
                    setMenuOpen(false);
                  }}
                >
                  <Check size={14} /> {t("ui.resolveConversation")}
                </button>
              )}
              <hr />
              <button
                className="danger"
                type="button"
                role="menuitem"
                disabled={deleting}
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
              >
                <Trash2 size={14} /> {t("ui.deleteConversation")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MessageBubble({
  message,
  messageWorkspaceId,
  senderName,
  actionPending,
  reactionPending,
  onDelete,
  onEditFailed,
  onCancelFailed,
  onRetryFailed,
  onMediaError,
  onMediaResolved,
  onOpenMedia,
  onCopy,
  onReact,
}: {
  message: Message;
  messageWorkspaceId: string;
  senderName?: string;
  actionPending: boolean;
  reactionPending: boolean;
  onDelete: () => void;
  onEditFailed: () => void;
  onCancelFailed: () => void;
  onRetryFailed: () => void;
  onMediaError: () => void;
  onMediaResolved: (url: string) => void;
  onOpenMedia: () => void;
  onCopy: () => void;
  onReact: (reaction: string) => void;
}) {
  const { t } = useTranslation("inbox");
  const visibleText = stripHumanWhatsAppIntro(message.text);
  const failedOutbound =
    message.direction === "outbound" && message.status === "failed";
  const pendingOutbound =
    message.direction === "outbound" && message.status === "sending";
  const persistedMine = message.reactions?.find((item) => item.mine);
  const visibleReactions =
    message.pendingReaction !== undefined
      ? [
          ...(message.reactions ?? []).filter((item) => !item.mine),
          ...(message.pendingReaction
            ? [
                {
                  emoji: message.pendingReaction,
                  mine: true,
                  pending: true,
                },
              ]
            : persistedMine
              ? [{ ...persistedMine, pending: true }]
              : []),
        ]
      : (message.reactions ?? []);
  return (
    <div
      className={`message-row ${message.direction}${pendingOutbound ? " optimistic-pending" : ""}`}
    >
      <div className="message-meta">
        {message.direction === "outbound" && message.aiGenerated && (
          <span className="ai-tag">
            <Sparkles size={11} /> {t("ui.aiGenerated")}
          </span>
        )}
        {senderName || message.sender} ·{" "}
        {formatMessageTime(message.createdAt, message.time)}
      </div>
      <div className="message-content-row">
        <div className="message-bubble-wrap">
          {message.deleted ? (
            <div className="message-bubble deleted-message">
              {t("ui.messageDeleted")}
            </div>
          ) : message.type !== "text" &&
            message.mediaStatus &&
            message.mediaStatus !== "ready" ? (
            <div className="message-bubble attachment-bubble media-unavailable">
              <div className="media-static-preview" aria-hidden="true">
                {(message.attachment?.meta ?? "media")
                  .split("/")
                  .at(-1)
                  ?.toUpperCase()}
              </div>
              <span>
                <strong>{message.attachment?.name ?? "Media"}</strong>
                <small>
                  {message.mediaStatus === "processing"
                    ? "Processing media…"
                    : message.mediaStatus === "unsupported"
                      ? `Format ${message.attachment?.meta ?? "unknown"} is not supported`
                      : "Media unavailable"}
                </small>
              </span>
            </div>
          ) : message.type === "text" ? (
            <div
              className={`message-bubble${visibleText ? "" : " unavailable-message"}`}
            >
              {visibleText ? (
                <div
                  className="message-wa-markup"
                  dangerouslySetInnerHTML={{
                    __html: renderWhatsAppMarkup(visibleText),
                  }}
                />
              ) : (
                t("ui.messageUnavailable")
              )}
            </div>
          ) : (
            <MessageMedia
              workspaceId={messageWorkspaceId}
              message={message}
              onError={onMediaError}
              onOpen={onOpenMedia}
              onResolved={onMediaResolved}
            />
          )}
        </div>
        {visibleReactions.length > 0 && (
          <div
            className="message-reactions"
            aria-label={t("ui.messageReactions")}
          >
            {visibleReactions.map((reaction, index) =>
              reaction.mine ? (
                <button
                  key={`${reaction.emoji}-${index}`}
                  className={`message-reaction-button${reaction.pending ? " optimistic-pending" : ""}`}
                  type="button"
                  disabled={reactionPending}
                  title={t("ui.removeReaction")}
                  aria-label={t("ui.removeReactionWithEmoji", {
                    emoji: reaction.emoji,
                  })}
                  onClick={() => onReact("")}
                >
                  {reaction.emoji}
                </button>
              ) : (
                <span key={`${reaction.emoji}-${index}`}>{reaction.emoji}</span>
              ),
            )}
          </div>
        )}
        <ActionMenu label={`${senderName || message.sender} message`}>
          {failedOutbound && (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={actionPending}
                onClick={onEditFailed}
              >
                <PenLine size={14} /> {t("ui.editMessage")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={actionPending}
                onClick={onCancelFailed}
              >
                <X size={14} /> {t("ui.cancelMessage")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={actionPending}
                onClick={onRetryFailed}
              >
                <Send size={14} />
                {actionPending ? t("ui.retrying") : t("ui.retryMessage")}
              </button>
            </>
          )}
          {!failedOutbound && (
            <>
              {!message.deleted && message.text && (
                <button type="button" role="menuitem" onClick={onCopy}>
                  <Copy size={14} /> {t("ui.copyMessage")}
                </button>
              )}
              {!message.deleted && message.direction === "outbound" && (
                <button
                  className="danger"
                  type="button"
                  role="menuitem"
                  disabled={actionPending}
                  onClick={onDelete}
                >
                  <Trash2 size={14} />
                  {actionPending ? t("ui.deleting") : t("ui.deleteForEveryone")}
                </button>
              )}
              {!message.deleted && (
                <>
                  <hr />
                  {(["👍", "✅", "👀", "❤️", "❗"] as const).map((reaction) => (
                    <button
                      key={reaction}
                      type="button"
                      role="menuitem"
                      disabled={reactionPending}
                      onClick={() => onReact(reaction)}
                    >
                      {reaction}{" "}
                      {reactionPending ? t("ui.sending") : t("ui.react")}
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </ActionMenu>
      </div>
      {message.direction === "outbound" && (
        <span
          className={`delivery-status ${message.status === "failed" ? "failed" : ""}`}
          aria-label={message.status ?? t("ui.sent")}
        >
          {message.status === "sending" ? (
            t("ui.sending")
          ) : message.status === "failed" ? (
            "Failed"
          ) : message.status === "read" || message.status === "delivered" ? (
            <CheckCheck size={13} />
          ) : (
            <Check size={13} />
          )}
        </span>
      )}
    </div>
  );
}

function MediaComposer({
  onSend,
  onTyping,
  onSendMediaBatch,
  onUseDraft,
  prefillDraft,
  aiMode,
  liveMode,
  automationState,
}: {
  onSend: (message: string) => boolean | Promise<boolean>;
  onTyping?: () => void;
  onSendMediaBatch?: (
    input: ComposerMediaInput[],
  ) => boolean | Promise<boolean>;
  onUseDraft: () => string | Promise<string>;
  prefillDraft?: {
    text: string;
    requestId: number;
    mediaInput?: ComposerMediaInput;
  };
  aiMode: AiMode;
  liveMode: boolean;
  automationState: AutomationState;
}) {
  const { t } = useTranslation("inbox");
  type PendingFile = {
    id: string;
    file?: File;
    mediaUrl?: string;
    fileName: string;
    mimeType?: string;
    type: ComposerMediaInput["messageType"];
    previewUrl: string;
    progress: number;
  };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [recording, setRecording] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const accepted =
    "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.heic,.heif,.tiff,.mov,.avi,.mkv";

  useEffect(() => {
    if (!prefillDraft) return;
    setText(prefillDraft.text);
    if (prefillDraft.mediaInput) {
      const input = prefillDraft.mediaInput;
      setPendingFiles((current) => [
        ...current,
        {
          id:
            globalThis.crypto?.randomUUID?.() ??
            `${Date.now()}-${Math.random()}`,
          file: input.file,
          mediaUrl: input.mediaUrl,
          fileName: input.fileName ?? input.file?.name ?? input.messageType,
          mimeType: input.mimeType ?? input.file?.type,
          type: input.messageType,
          previewUrl: input.file ? URL.createObjectURL(input.file) : "",
          progress: 0,
        },
      ]);
    }
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefillDraft]);

  useEffect(
    () => () =>
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop()),
    [],
  );

  const typeForFile = (file: File): ComposerMediaInput["messageType"] => {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (
      [
        "jpg",
        "jpeg",
        "png",
        "webp",
        "gif",
        "heic",
        "heif",
        "tiff",
        "svg",
      ].includes(extension)
    )
      return "image";
    if (["mp4", "webm", "mov", "avi", "mkv"].includes(extension))
      return "video";
    if (["mp3", "wav", "aac", "m4a", "ogg", "opus", "flac"].includes(extension))
      return "audio";
    return "document";
  };

  const addFiles = (files: File[]) => {
    const room = Math.max(0, 10 - pendingFiles.length);
    const additions = files.slice(0, room).map((file) => ({
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      file,
      fileName: file.name,
      mimeType: file.type,
      type: typeForFile(file),
      previewUrl: URL.createObjectURL(file),
      progress: 0,
    }));
    if (!additions.length) return;
    setPendingFiles((current) => [...current, ...additions]);
  };

  const removeFile = (id: string) => {
    setPendingFiles((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const startRecording = async () => {
    if (recording || sending || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audio = new File(
          recordingChunksRef.current,
          `voice-${Date.now()}.webm`,
          { type: mimeType },
        );
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        recordingStreamRef.current = null;
        setRecording(false);
        if (onSendMediaBatch) {
          setSending(true);
          void Promise.resolve()
            .then(() =>
              onSendMediaBatch([
                {
                  file: audio,
                  messageType: "audio",
                  fileName: audio.name,
                  mimeType: audio.type,
                },
              ]),
            )
            .finally(() => setSending(false));
        }
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const submitText = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      // The thread owns the message the moment it is accepted, including when
      // delivery fails: it renders there as a failed bubble with retry, edit
      // and cancel. Keeping the text here too would show it twice and let a
      // second press send a duplicate.
      if (await onSend(value)) {
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  };

  const submitAttachments = async () => {
    if (!onSendMediaBatch || sending || !pendingFiles.length) return;
    const inputs: ComposerMediaInput[] = pendingFiles.map((item) => ({
      file: item.file,
      mediaUrl: item.mediaUrl,
      messageType: item.type,
      fileName: item.fileName,
      mimeType: item.mimeType,
      caption: text.trim() || undefined,
      onProgress: (percent) =>
        setPendingFiles((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, progress: percent } : entry,
          ),
        ),
    }));
    setSending(true);
    try {
      if (await onSendMediaBatch(inputs)) {
        pendingFiles.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        setPendingFiles([]);
      }
    } finally {
      setSending(false);
    }
  };

  const insertAiDraft = async () => {
    if (sending || draftLoading) return;
    setDraftLoading(true);
    try {
      setText(await onUseDraft());
    } finally {
      setDraftLoading(false);
    }
  };

  return (
    <div
      className={`composer ${dragActive ? "drag-active" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        addFiles(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          addFiles(files);
        }
      }}
    >
      <div className="composer-toolbar">
        <input
          ref={fileInputRef}
          hidden
          type="file"
          multiple
          accept={accepted}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMediaBatch || sending || recording}
          aria-label={t("ui.attachFiles")}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={15} /> {t("ui.files")}
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMediaBatch || sending}
          aria-label={recording ? t("ui.stopRecording") : t("ui.recordAudio")}
          aria-pressed={recording}
          onClick={() => {
            if (recording) {
              const recorder = recorderRef.current;
              if (recorder?.state === "recording") {
                recorder.requestData();
                recorder.stop();
              }
            } else void startRecording();
          }}
        >
          {recording ? <Square size={14} /> : <Mic size={15} />}{" "}
          {recording ? t("ui.stop") : t("ui.voice")}
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={sending || draftLoading}
          aria-label={t("ui.insertDraft")}
          aria-busy={draftLoading}
          onClick={() => void insertAiDraft()}
        >
          {draftLoading ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}{" "}
          {draftLoading ? t("ui.generating") : t("ui.insertAiDraft")}
        </button>
        <span className="composer-hint">{t("ui.composerHint")}</span>
      </div>
      {pendingFiles.length > 0 && (
        <div
          className="attachment-preview-bar"
          aria-label={t("ui.selectedFiles")}
        >
          <div className="attachment-preview-grid">
            {pendingFiles.map((item) => (
              <div className="attachment-preview-card" key={item.id}>
                {item.file && item.type === "image" ? (
                  <img src={item.previewUrl} alt={item.fileName} />
                ) : item.file && item.type === "video" ? (
                  <video muted preload="metadata" src={item.previewUrl} />
                ) : item.file && item.type === "audio" ? (
                  <audio controls preload="metadata" src={item.previewUrl} />
                ) : (
                  <FileText size={24} />
                )}
                <button
                  className="icon-button subtle attachment-remove"
                  type="button"
                  aria-label={t("ui.removeFile", { name: item.fileName })}
                  disabled={sending}
                  onClick={() => removeFile(item.id)}
                >
                  <X size={13} />
                </button>
                <strong title={item.fileName}>{item.fileName}</strong>
                <small>
                  {item.file
                    ? (item.file.size / 1024 / 1024).toFixed(1)
                    : (item.mimeType ?? t("ui.media"))}{" "}
                  {t("ui.megabytes")} · {item.progress}%
                </small>
              </div>
            ))}
          </div>
          <div className="attachment-actions">
            <button
              className="button button-primary attachment-send"
              type="button"
              disabled={sending}
              onClick={() => void submitAttachments()}
            >
              {sending ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <Send size={14} />
              )}{" "}
              {sending
                ? t("ui.sending")
                : t("ui.sendFiles", { count: pendingFiles.length })}
            </button>
          </div>
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          aria-label={t("ui.writeReply")}
          value={text}
          disabled={sending}
          onChange={(event) => {
            setText(event.target.value);
            onTyping?.();
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitText();
            }
          }}
          placeholder={
            automationState === "human_paused"
              ? t("ui.aiPausedPlaceholder")
              : aiMode === "safe_auto"
                ? t("ui.aiHandlingPlaceholder")
                : t("ui.writeReplyPlaceholder")
          }
          rows={1}
        />
        <button
          className={`send-button ${!text.trim() || sending ? "disabled" : ""}`}
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void submitText()}
          aria-label={t("send")}
        >
          <Send size={16} />
        </button>
      </div>
      <div className="composer-footer">
        <span className="composer-ai-state">
          <Sparkles size={12} />{" "}
          {aiMode === "off"
            ? t("ui.manual")
            : automationState === "human_paused"
              ? t("ui.aiPaused")
              : aiMode === "safe_auto"
                ? t("ui.autoReplyActive")
                : t("ui.copilotReady")}
        </span>
      </div>
    </div>
  );
}
