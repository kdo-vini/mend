import {
  Fragment,
  memo,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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
  Contact,
  LockKeyhole,
  Paperclip,
  PanelRight,
  PenLine,
  Reply,
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
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  AiMode,
  AiDraft,
  Conversation,
  Issue,
  KnowledgeArticle,
  Message,
} from "../../../types";
import {
  deleteLiveConversation,
  deleteLiveMessage,
  editLiveMessage,
  listConnectedChannels,
  LiveActionError,
  loadLiveConversationSnapshot,
  loadOlderLiveConversationMessages,
  markLiveConversationRead,
  reactToLiveMessage,
  refreshLiveContactPhoto,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMediaBatch,
  sendLiveContact,
  sendLiveMessage,
  sendLivePresence,
  snoozeLiveConversation,
  startConversation,
  updateLiveContact,
  updateLiveConversation,
  uploadLiveMediaAsset,
} from "../api";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { createComposerDrafts } from "../composer-drafts";
import { firstUnreadMessageId } from "../unread-divider";
import { continuesGroup } from "../message-groups";
import { useZeloCustomer } from "../hooks/useZeloCustomer";
import { customerAlerts, type CustomerLabel } from "../zelo-customer";
import { contactPhotoUrl } from "../../../shared/contact-photo";
import { ContactAvatar } from "../components/ContactAvatar";
import { ZeloCustomerPanel } from "../components/ZeloCustomerPanel";
import { RecordingIndicator } from "../components/RecordingIndicator";
import {
  useInboxShortcuts,
  type InboxShortcutHandlers,
} from "../hooks/useInboxShortcuts";
import {
  canEditMessage,
  canReplyToMessage,
  replaceVisibleBody,
} from "../message-actions";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { useConversationScroll } from "../hooks/useConversationScroll";
import {
  INBOX_RAIL_WIDTH_MAX,
  INBOX_RAIL_WIDTH_MIN,
  useInboxRailWidth,
} from "../hooks/useInboxRailWidth";
import { MessageMedia } from "../components/MessageMedia";
import {
  SHARE_CONTACT_DIALOG_ID,
  ShareContactDialog,
  type ShareContactInput,
} from "../components/ShareContactDialog";
import {
  formatMessageTime,
  getMessageDayKey,
  getMessageDayLabel,
} from "../message-dates";
import {
  WhatsAppComposerHighlight,
  WhatsAppMessageText,
  WhatsAppPreviewText,
} from "../components/WhatsAppText";
import { toggleWhatsAppFormat, type WaFormatMarker } from "../whatsapp-markup";
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
  isConversationAiActive,
  planConversationAiToggle,
} from "../conversation-ai-toggle";
import { SUPPORT_AI_SURFACES_ENABLED } from "../../../shared/support-ai-surfaces";
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
import {
  createOlderLoadTracker,
  parseConversationParam,
  shouldCorrectOlderScroll,
  shouldMarkConversationRead,
  withConversationParam,
} from "../conversation-selection";

/** Server delivery-failure codes, mapped to the inbox message for each. */
const sendErrorKeys: Record<string, string> = {
  channel_disconnected: "errors.sendChannelDisconnected",
  provider_rejected: "errors.sendRejected",
  provider_unavailable: "errors.sendUnavailable",
  provider_timeout: "errors.sendTimeout",
  conversation_not_found: "errors.sendConversationMissing",
  message_text_invalid: "errors.sendTextInvalid",
  quoted_message_not_found: "errors.quotedMessageMissing",
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
}

interface LightboxMedia {
  id: string;
  type: "image" | "video";
  url: string;
  name: string;
  meta: string;
}

/*
 * Outbound send state outlives the inbox page: the thread lives in App state,
 * so leaving the inbox mid-upload must not drop the queue, the retry inputs
 * or the local previews of bubbles that are still on screen.
 */
const composerDrafts = createComposerDrafts();
const CONTEXT_COLLAPSED_STORAGE_KEY = "mend.inbox-context-collapsed";
const photoLookupsTried = new Set<string>();
const CONTEXT_DRAWER_QUERY = "(max-width: 1279px)";

function readContextCollapsed() {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem(CONTEXT_COLLAPSED_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}
const deliveryQueues = new Map<string, Promise<void>>();
const failedMediaRetryInputs = new Map<string, ComposerMediaInput>();
const failedContactRetryInputs = new Map<string, ShareContactInput>();
const outboundPreviewUrls = new Map<string, string>();
const markReadInFlight = new Set<string>();

function latestInboundCreatedAt(
  messages:
    | ReadonlyArray<{ direction: string; createdAt?: string }>
    | undefined,
): string | undefined {
  let latest: { time: number; iso: string } | undefined;
  for (const message of messages ?? []) {
    if (message.direction !== "inbound" || !message.createdAt) continue;
    const time = Date.parse(message.createdAt);
    if (Number.isNaN(time)) continue;
    if (!latest || time > latest.time)
      latest = { time, iso: new Date(time).toISOString() };
  }
  return latest?.iso;
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

type RowHandlers = {
  toggleConversationSelection: (id: string, shiftKey: boolean) => void;
  selectConversation: (conversation: Conversation) => void;
  deleteConversation: (id?: string) => Promise<void>;
  selectionMode: boolean;
  deleteMessage: (message: Message) => Promise<void>;
  editFailedMessage: (message: Message) => void;
  cancelFailedMessage: (message: Message) => void;
  retryFailedMessage: (message: Message) => Promise<void>;
  refreshFailedMedia: (messageId: string) => void;
  setMessageMediaUrl: (
    conversationId: string,
    messageId: string,
    url: string | undefined,
  ) => void;
  openMediaViewer: (messageId: string) => void;
  reactToMessage: (message: Message, reaction: string) => Promise<void>;
  replyToMessage: (message: Message) => void;
  startEditMessage: (message: Message) => void;
  selectedId: string | undefined;
  onToast: (message: string, tone?: ToastTone) => void;
  t: TFunction<"inbox">;
};

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
  snapshotResync = 0,
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
  /** Bumped by the app's live catch-up to re-read the open thread. */
  snapshotResync?: number;
  senderNames: Record<string, string>;
  knowledgeArticles: KnowledgeArticle[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
}) {
  const { t } = useTranslation("inbox");
  // Ticks once a minute so day dividers stay correct without a fresh Date on
  // every render.
  const [messageDayNow, setMessageDayNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(
      () => setMessageDayNow(new Date()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    width: railWidth,
    dragging: railDragging,
    layoutStyle: railLayoutStyle,
    onResizePointerDown,
    onResizeKeyDown,
  } = useInboxRailWidth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<
    Set<string>
  >(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  // Only a thread the operator chose (click, keyboard, link) is marked read;
  // the layout's own auto-selection never is.
  const [explicitReadId, setExplicitReadId] = useState<string | null>(null);
  /** Operator-chosen selection: reads the thread and lands it in the URL. */
  const openConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setExplicitReadId(conversationId);
    setMobileConversationOpen(true);
    if (parseConversationParam(location.search) !== conversationId)
      // Pushed so phone Back returns from the thread to the list.
      navigate({
        pathname: location.pathname,
        search: withConversationParam(location.search, conversationId),
      });
  };
  const [contextOpen, setContextOpen] = useState(false);
  const [draftInsertRequest, setDraftInsertRequest] = useState<{
    text: string;
    requestId: number;
    conversationId: string;
    mediaInput?: ComposerMediaInput;
  }>();
  // What the composer is doing besides a plain send: answering one message
  // (quoted on WhatsApp) or rewriting one already sent. Tied to a thread so
  // neither follows the operator into another conversation.
  const [composerMode, setComposerMode] = useState<{
    kind: "reply" | "edit";
    conversationId: string;
    message: Message;
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
  const failedMediaRefreshIdsRef = useRef(new Set<string>());
  const clearedMediaUrlsRef = useRef(new Set<string>());
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
      openConversation(result.conversationId);
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
  // Read after an await: the operator may have switched threads meanwhile.
  const latestRef = useRef({ conversations, selectedId: selected?.id });
  latestRef.current = { conversations, selectedId: selected?.id };
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
  const {
    messageCanvasRef,
    showScrollDown,
    scrollMessagesToBottom,
    isBottomScrollPending,
  } = useConversationScroll({
    conversationId: selected?.id,
    messageSignature,
    viewKey: mobileConversationOpen ? "open" : "closed",
  });
  // The unread count when the thread opened. Opening marks the thread read
  // right away, so the divider keeps the count it had on arrival until the
  // operator moves to another conversation.
  const [unreadOnOpen, setUnreadOnOpen] = useState<{
    conversationId?: string;
    count: number;
  }>({ count: 0 });
  if (selected && unreadOnOpen.conversationId !== selected.id)
    setUnreadOnOpen({ conversationId: selected.id, count: selected.unread });
  const firstUnreadId = selected
    ? firstUnreadMessageId(
        selected.messages,
        unreadOnOpen.conversationId === selected.id ? unreadOnOpen.count : 0,
      )
    : undefined;
  const zeloCustomer = useZeloCustomer(workspaceId, selected?.id, liveMode);
  // Contacts whose photo the webhook never brought get one looked up on open,
  // once per page load; the server stores what it finds for everyone else.
  const [foundPhotos, setFoundPhotos] = useState<Record<string, string>>({});
  const photoLookupId =
    liveMode &&
    workspaceId &&
    selected &&
    selected.chatType === "direct" &&
    !selected.photoUrl &&
    !photoLookupsTried.has(selected.id)
      ? selected.id
      : undefined;
  useEffect(() => {
    if (!photoLookupId || !workspaceId) return;
    photoLookupsTried.add(photoLookupId);
    void refreshLiveContactPhoto({ workspaceId, conversationId: photoLookupId })
      .then((url) => {
        const photo = contactPhotoUrl(url);
        if (photo)
          setFoundPhotos((current) => ({ ...current, [photoLookupId]: photo }));
      })
      .catch(() => undefined);
  }, [photoLookupId, workspaceId]);
  const headerAlerts: CustomerLabel[] =
    zeloCustomer?.status === "ready" && zeloCustomer.customers.length === 1
      ? customerAlerts(zeloCustomer.customers[0])
      : [];
  const [contextCollapsed, setContextCollapsed] =
    useState(readContextCollapsed);
  const [contextIsDrawer, setContextIsDrawer] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(CONTEXT_DRAWER_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(CONTEXT_DRAWER_QUERY);
    const sync = () => setContextIsDrawer(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const toggleContext = () => {
    // Below the desktop breakpoint the panel is a drawer that opens on top.
    if (window.matchMedia(CONTEXT_DRAWER_QUERY).matches) {
      setContextOpen(true);
      return;
    }
    setContextCollapsed((current) => {
      try {
        window.localStorage.setItem(
          CONTEXT_COLLAPSED_STORAGE_KEY,
          current ? "0" : "1",
        );
      } catch {
        // Blocked storage only forgets the choice after a reload.
      }
      return !current;
    });
  };
  const messagesById = useMemo(
    () => new Map(selected?.messages.map((message) => [message.id, message])),
    [selected?.messages],
  );
  const threadLoaded = selected?.threadLoaded === true;
  const olderLoadsRef = useRef(createOlderLoadTracker());
  const exhaustedConversationIdsRef = useRef(new Set<string>());

  // The inbox list only embeds the latest message per conversation. Opening a
  // thread must load the recent history or the canvas stays on a single bubble.
  // This is the only snapshot loader per selection; the app's live catch-up
  // re-runs it through `snapshotResync`.
  useEffect(() => {
    if (!liveMode || !workspaceId || !selectedConversationId) return;
    let cancelled = false;
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
  }, [
    liveMode,
    selectedConversationId,
    setConversations,
    snapshotResync,
    workspaceId,
  ]);

  useEffect(() => {
    if (selectedConversationId)
      exhaustedConversationIdsRef.current.delete(selectedConversationId);
  }, [selectedConversationId]);

  const oldestPersisted = selected?.messages.find(
    (message) => message.createdAt && !message.id.startsWith("temp:"),
  );
  const oldestCreatedAt = oldestPersisted?.createdAt;
  const oldestId = oldestPersisted?.id;
  useEffect(() => {
    const canvas = messageCanvasRef.current;
    const conversationId = selected?.id;
    const before =
      oldestCreatedAt && oldestId
        ? { createdAt: oldestCreatedAt, id: oldestId }
        : undefined;
    // Wait for the first full snapshot: paging back from the list preview
    // would race it and fetch rows the snapshot is about to bring.
    if (
      !canvas ||
      !liveMode ||
      !workspaceId ||
      !conversationId ||
      !before ||
      !threadLoaded
    )
      return;

    const loadOlder = () => {
      if (
        canvas.scrollTop > 24 ||
        isBottomScrollPending() ||
        !olderLoadsRef.current.start(conversationId)
      )
        return;
      if (exhaustedConversationIdsRef.current.has(conversationId)) {
        olderLoadsRef.current.finish(conversationId);
        return;
      }
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
            // The response may land after the operator opened another thread.
            if (
              !shouldCorrectOlderScroll(
                conversationId,
                latestRef.current.selectedId,
              )
            )
              return;
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
          olderLoadsRef.current.finish(conversationId);
        });
    };

    canvas.addEventListener("scroll", loadOlder, { passive: true });
    // When the preview (or a short page) does not overflow, scroll never
    // fires — pull older messages until the canvas fills or history ends.
    // A thread that already overflows waits for the operator to scroll up.
    const fillTimer = window.setTimeout(() => {
      if (canvas.scrollHeight <= canvas.clientHeight + 24) loadOlder();
    }, 0);
    return () => {
      canvas.removeEventListener("scroll", loadOlder);
      window.clearTimeout(fillTimer);
    };
  }, [
    isBottomScrollPending,
    liveMode,
    messageCanvasRef,
    messageSignature,
    oldestCreatedAt,
    oldestId,
    onToast,
    scrollMessagesToBottom,
    selected?.id,
    setConversations,
    t,
    threadLoaded,
    workspaceId,
  ]);
  const filtered = useMemo(
    () =>
      conversations.filter((conversation) => {
        const queryMatch = normalizeSearch(
          `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
        ).includes(normalizeSearch(search));
        // The open thread stays listed when its own state stops matching the
        // filter (a reply clears "needs attention", opening it clears
        // "unread"). Dropping it would move the selection, and the composer,
        // to another customer mid-task.
        return (
          queryMatch &&
          (conversation.id === selectedConversationId ||
            conversationMatchesInboxFilter(conversation, filter))
        );
      }),
    [conversations, filter, search, selectedConversationId],
  );

  // The URL is the selection: opening or refreshing `?conversation=<id>`
  // selects (and reads) that thread, and Back to a URL without it returns a
  // phone to the list. Applied once per navigation so a list refresh never
  // pulls the operator back.
  const handledConversationLinkRef = useRef<string | null>(null);
  const hadConversationParamRef = useRef(false);
  const conversationParam = parseConversationParam(location.search);
  const conversationParamKnown = conversations.some(
    (conversation) => conversation.id === conversationParam,
  );
  useEffect(() => {
    if (!conversationParam) {
      if (hadConversationParamRef.current) setMobileConversationOpen(false);
      hadConversationParamRef.current = false;
      return;
    }
    hadConversationParamRef.current = true;
    if (handledConversationLinkRef.current === location.key) return;
    if (conversationParamKnown) {
      handledConversationLinkRef.current = location.key;
      setSelectedConversationId(conversationParam);
      setExplicitReadId(conversationParam);
      setMobileConversationOpen(true);
      return;
    }
    // Not in the loaded page of threads (older than the newest 100): load it
    // directly so the link does not wait for a list that never includes it.
    if (!liveMode || !workspaceId) return;
    handledConversationLinkRef.current = location.key;
    let cancelled = false;
    void loadLiveConversationSnapshot(workspaceId, conversationParam)
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
        setSelectedConversationId(conversationParam);
        setExplicitReadId(conversationParam);
        setMobileConversationOpen(true);
      })
      .catch(() => {
        // Stays on the current thread when the linked one cannot load.
      });
    return () => {
      cancelled = true;
      // Allow the retry after a re-render that cancelled the load.
      if (handledConversationLinkRef.current === location.key)
        handledConversationLinkRef.current = null;
    };
  }, [
    conversationParam,
    conversationParamKnown,
    liveMode,
    location.key,
    setConversations,
    setSelectedConversationId,
    workspaceId,
  ]);

  useEffect(() => {
    if (!filtered.length) setMobileConversationOpen(false);
  }, [filtered.length]);

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

  useEffect(() => {
    const previews = outboundPreviewUrls;
    if (!previews.size) return;
    const liveIds = new Set(
      conversations.flatMap((conversation) =>
        conversation.messages.map((message) => message.id),
      ),
    );
    for (const [messageId, url] of previews) {
      if (liveIds.has(messageId)) continue;
      URL.revokeObjectURL(url);
      previews.delete(messageId);
    }
  }, [conversations]);

  // A thread the operator chose (click, link) is read while it is on screen,
  // including messages arriving meanwhile. Auto-selected threads (first load,
  // layout fallback) stay unread until chosen.
  const selectedId = selected?.id;
  const selectedUnread = selected?.unread ?? 0;
  // Newest inbound message the operator can see: a bounded mark-read leaves
  // anything that arrives after it unread.
  const selectedReadUpTo = latestInboundCreatedAt(selected?.messages);
  const threadOnScreen =
    mobileConversationOpen ||
    typeof window === "undefined" ||
    !window.matchMedia("(max-width: 650px)").matches;
  useEffect(() => {
    if (
      !shouldMarkConversationRead({
        selectedId,
        explicitId: explicitReadId,
        unread: selectedUnread,
        threadOnScreen,
      })
    )
      return;
    if (!selectedId) return;
    const markRead = () => {
      if (document.visibilityState !== "visible") return false;
      setConversations((current) =>
        current.map((item) =>
          item.id === selectedId ? { ...item, unread: 0 } : item,
        ),
      );
      if (liveMode && workspaceId && !markReadInFlight.has(selectedId)) {
        markReadInFlight.add(selectedId);
        void markLiveConversationRead({
          workspaceId,
          conversationId: selectedId,
          ...(selectedReadUpTo ? { readUpTo: selectedReadUpTo } : {}),
        })
          .catch((error) =>
            onToast(localizedError(error, t("errors.markRead"))),
          )
          .finally(() => markReadInFlight.delete(selectedId));
      }
      return true;
    };
    if (markRead()) return;
    const onVisible = () => {
      if (markRead())
        document.removeEventListener("visibilitychange", onVisible);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [
    explicitReadId,
    liveMode,
    onToast,
    selectedId,
    selectedReadUpTo,
    selectedUnread,
    setConversations,
    t,
    threadOnScreen,
    workspaceId,
  ]);

  // Row and bubble handlers take the id as an argument and read the latest
  // closures through a ref, so their identity never changes and memoized rows
  // and bubbles skip renders when only another conversation changed.
  const rowHandlersRef = useRef<RowHandlers | null>(null);
  const onRowSelectionChange = useCallback(
    (id: string, shiftKey: boolean) =>
      rowHandlersRef.current?.toggleConversationSelection(id, shiftKey),
    [],
  );
  const onRowClick = useCallback(
    (conversation: Conversation, shiftKey: boolean) => {
      const handlers = rowHandlersRef.current;
      if (!handlers) return;
      if (handlers.selectionMode)
        handlers.toggleConversationSelection(conversation.id, shiftKey);
      else handlers.selectConversation(conversation);
    },
    [],
  );
  const onRowDelete = useCallback(
    (id: string) => void rowHandlersRef.current?.deleteConversation(id),
    [],
  );
  const onBubbleDelete = useCallback(
    (message: Message) => void rowHandlersRef.current?.deleteMessage(message),
    [],
  );
  const onBubbleEditFailed = useCallback(
    (message: Message) => rowHandlersRef.current?.editFailedMessage(message),
    [],
  );
  const onBubbleCancelFailed = useCallback(
    (message: Message) => rowHandlersRef.current?.cancelFailedMessage(message),
    [],
  );
  const onBubbleRetryFailed = useCallback(
    (message: Message) =>
      void rowHandlersRef.current?.retryFailedMessage(message),
    [],
  );
  const onBubbleMediaError = useCallback(
    (messageId: string) =>
      rowHandlersRef.current?.refreshFailedMedia(messageId),
    [],
  );
  const onBubbleMediaResolved = useCallback(
    (messageId: string, url: string) => {
      const handlers = rowHandlersRef.current;
      if (!handlers) return;
      if (handlers.selectedId)
        handlers.setMessageMediaUrl(handlers.selectedId, messageId, url);
    },
    [],
  );
  const onBubbleOpenMedia = useCallback(
    (messageId: string) => rowHandlersRef.current?.openMediaViewer(messageId),
    [],
  );
  const onBubbleCopy = useCallback(async (message: Message) => {
    if (!message.text) return;
    const handlers = rowHandlersRef.current;
    if (!handlers) return;
    const { onToast: toast, t: translate } = handlers;
    try {
      await navigator.clipboard.writeText(message.text);
      toast(translate("toasts.messageCopied"));
    } catch {
      toast(translate("errors.copyMessage"));
    }
  }, []);
  const onBubbleReact = useCallback(
    (message: Message, reaction: string) =>
      void rowHandlersRef.current?.reactToMessage(message, reaction),
    [],
  );
  const onBubbleReply = useCallback(
    (message: Message) => rowHandlersRef.current?.replyToMessage(message),
    [],
  );
  const onBubbleEdit = useCallback(
    (message: Message) => rowHandlersRef.current?.startEditMessage(message),
    [],
  );
  const onQuoteOpen = useCallback((messageId: string) => {
    const row = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(messageId)}"]`,
    );
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.remove("message-row-flash");
    void row.offsetWidth;
    row.classList.add("message-row-flash");
  }, []);
  // Filled in once the handlers below exist; the hook reads it on each key.
  const shortcutHandlersRef = useRef<InboxShortcutHandlers | null>(null);
  useInboxShortcuts({
    onNext: () => shortcutHandlersRef.current?.onNext(),
    onPrevious: () => shortcutHandlersRef.current?.onPrevious(),
    onReply: () => shortcutHandlersRef.current?.onReply(),
    onResolve: () => shortcutHandlersRef.current?.onResolve(),
    onToggleContext: () => shortcutHandlersRef.current?.onToggleContext(),
  });

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
  const showAiDecision =
    SUPPORT_AI_SURFACES_ENABLED &&
    !isAiCardDismissed(
      dismissedAiCards,
      selected.id,
      "decision",
      decisionSignature,
    );
  const showAiDraft =
    SUPPORT_AI_SURFACES_ENABLED &&
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
  const setMessageMediaUrl = (
    conversationId: string,
    messageId: string,
    url: string | undefined,
  ) =>
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id !== conversationId
          ? conversation
          : {
              ...conversation,
              messages: conversation.messages.map((candidate) =>
                candidate.id !== messageId || !candidate.attachment
                  ? candidate
                  : {
                      ...candidate,
                      attachment: { ...candidate.attachment, url },
                    },
              ),
            },
      ),
    );
  const refreshFailedMedia = (messageId: string) => {
    if (!workspaceId || !selected) return;
    // Snapshot merges keep a resolved URL, so one that failed (an expired
    // signature) must leave state for the bubble to resolve a fresh one. Once
    // per URL: a URL that fails again after that is broken, not stale.
    const failedUrl = selected.messages.find(
      (candidate) => candidate.id === messageId,
    )?.attachment?.url;
    if (
      failedUrl &&
      !messageId.startsWith("temp:") &&
      !clearedMediaUrlsRef.current.has(failedUrl)
    ) {
      clearedMediaUrlsRef.current.add(failedUrl);
      setMessageMediaUrl(selected.id, messageId, undefined);
    }
    if (failedMediaRefreshIdsRef.current.has(messageId)) return;
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
    openConversation(conversation.id);
    setContextOpen(false);
  };

  /**
   * Delivery failures the server can name. Each maps to the one thing the
   * operator can do about it, instead of the same "could not send" for a
   * dropped WhatsApp session, a refused message and a provider outage.
   */
  const sendFailureMessage = (
    error: unknown,
    fallbackKey = "errors.sendMessage",
  ): string => {
    const code = error instanceof LiveActionError ? error.code : undefined;
    const key = code ? sendErrorKeys[code] : undefined;
    return localizedError(error, t(key ?? fallbackKey));
  };

  /**
   * Runs deliveries for one conversation one after another. The composer lets
   * go of a message as soon as its bubble is in the thread, so the operator can
   * keep typing; the queue keeps quick consecutive sends reaching WhatsApp in
   * the order they were written.
   */
  const enqueueDelivery = (
    conversationId: string,
    deliver: () => Promise<void>,
  ): Promise<void> => {
    const queue = deliveryQueues;
    const next = (queue.get(conversationId) ?? Promise.resolve())
      .then(deliver)
      .catch(() => undefined);
    queue.set(conversationId, next);
    void next.then(() => {
      if (queue.get(conversationId) === next) queue.delete(conversationId);
    });
    return next;
  };

  const patchMessages = (
    conversationId: string,
    messageIds: ReadonlySet<string>,
    patch: Partial<Message>,
  ) =>
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? {
              ...item,
              messages: item.messages.map((message) =>
                messageIds.has(message.id) ? { ...message, ...patch } : message,
              ),
            }
          : item,
      ),
    );

  /**
   * Best-effort re-read after a send the provider already accepted. A failure
   * here must never mark the message failed: realtime and the live catch-up
   * reconcile it, while a "failed" bubble would invite a duplicate resend.
   */
  const refreshAfterSend = async (
    liveWorkspaceId: string,
    conversationId: string,
  ) => {
    try {
      const snapshot = await loadLiveConversationSnapshot(
        liveWorkspaceId,
        conversationId,
      );
      if (snapshot)
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
    } catch {
      // Reconciled by realtime and the live catch-up.
    }
  };

  /**
   * Queues one outbound message. The optimistic bubble is in the thread before
   * the first await, so the composer clears immediately (see
   * `queueComposerMessage`); delivery is reported on the bubble itself, and a
   * failed send stays there with retry, edit and cancel. The returned promise
   * settles after delivery, which retry uses to hold its pending state.
   */
  const sendMessage = async (
    text: string,
    idempotencyKey?: string,
    /** Set when the bubble is a shared contact card rather than typed text. */
    contact?: ShareContactInput,
    /** The message this text answers, quoted above it on WhatsApp. */
    quotedMessageId?: string,
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
      ...(quotedMessageId ? { quotedMessageId } : {}),
    };
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [...item.messages, optimistic],
                lastMessage: optimistic.text,
                lastTime: t("ui.now"),
                lastMessageAt: new Date().toISOString(),
                attention: "waiting_customer",
                unread: 0,
              }
            : item,
        ),
      ),
    );
    const optimisticIds = new Set([optimistic.id]);
    if (contact) failedContactRetryInputs.set(optimistic.id, contact);
    if (liveMode && workspaceId) {
      const liveWorkspaceId = workspaceId;
      const acceptedToast =
        selected.aiMode === "safe_auto" &&
        selected.automationState === "ai_active"
          ? t("toasts.messageSentAiPaused")
          : t("toasts.messageAccepted");
      await enqueueDelivery(conversationId, async () => {
        try {
          if (contact)
            await sendLiveContact({
              workspaceId: liveWorkspaceId,
              conversationId,
              contacts: [contact],
              idempotencyKey: clientId,
            });
          else
            await sendLiveMessage({
              workspaceId: liveWorkspaceId,
              conversationId,
              text: text.trim(),
              idempotencyKey: clientId,
              ...(quotedMessageId ? { quotedMessageId } : {}),
            });
        } catch (error) {
          patchMessages(conversationId, optimisticIds, { status: "failed" });
          onToast(sendFailureMessage(error), "error");
          return;
        }
        failedContactRetryInputs.delete(optimistic.id);
        // Promote the optimistic bubble immediately so a slow/partial refresh
        // cannot leave the thread stuck on "Sending…" or a single bubble.
        patchMessages(conversationId, optimisticIds, { status: "sent" });
        onToast(acceptedToast);
        await refreshAfterSend(liveWorkspaceId, conversationId);
      });
      return true;
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
   * Queues one attachment batch. Same contract as `sendMessage`: the bubbles,
   * with a local preview and upload progress, are in the thread before the
   * first await, and failures stay there as failed bubbles. `idempotencyKey`
   * is only honoured for a single attachment (a retry), so the server
   * de-duplicates a resend the provider had already accepted.
   */
  const sendMediaBatch = async (
    inputs: ComposerMediaInput[],
    idempotencyKey?: string,
  ): Promise<boolean> => {
    if (!liveMode || !workspaceId) {
      onToast(t("toasts.attachmentsUnavailable"), "error");
      return false;
    }
    const liveWorkspaceId = workspaceId;
    const conversationId = selected.id;
    const batchId = globalThis.crypto?.randomUUID?.() ?? `batch-${Date.now()}`;
    const pending = inputs.map((input) => {
      const clientId =
        (inputs.length === 1 ? idempotencyKey : undefined) ??
        globalThis.crypto?.randomUUID?.() ??
        `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const previewUrl =
        input.file && input.messageType !== "document"
          ? URL.createObjectURL(input.file)
          : undefined;
      if (previewUrl) outboundPreviewUrls.set(`temp:${clientId}`, previewUrl);
      return {
        input,
        clientId,
        optimistic: {
          id: `temp:${clientId}`,
          clientId,
          conversationId,
          direction: "outbound" as const,
          sender: t("ui.you"),
          text: input.caption ?? "",
          time: t("ui.now"),
          createdAt: new Date().toISOString(),
          type: input.messageType,
          status: "sending" as const,
          // Only uploads go out through the batch the server stores.
          ...(input.file ? { mediaBatchId: batchId, uploadProgress: 0 } : {}),
          attachment: {
            name: input.fileName ?? input.file?.name ?? input.messageType,
            meta: input.mimeType ?? input.file?.type ?? t("ui.attachment"),
            ...(previewUrl ? { url: previewUrl } : {}),
          },
        } satisfies Message,
      };
    });
    pending.forEach((item) =>
      failedMediaRetryInputs.set(item.optimistic.id, item.input),
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
    const optimisticIds = new Set(pending.map((item) => item.optimistic.id));
    await enqueueDelivery(conversationId, async () => {
      try {
        const uploaded: Array<{
          assetId: string;
          messageType: ComposerMediaInput["messageType"];
          caption?: string;
          idempotencyKey: string;
        }> = [];
        for (const item of pending) {
          if (item.input.file) {
            const bubbleIds = new Set([item.optimistic.id]);
            let lastPercent = 0;
            const asset = await uploadLiveMediaAsset({
              workspaceId: liveWorkspaceId,
              conversationId,
              file: item.input.file,
              batchId,
              onProgress: (progress) => {
                const percent = Math.round(progress.percent);
                if (percent === lastPercent) return;
                lastPercent = percent;
                patchMessages(conversationId, bubbleIds, {
                  uploadProgress: percent,
                });
              },
            });
            uploaded.push({
              assetId: asset.assetId,
              messageType: item.input.messageType,
              caption: item.input.caption,
              idempotencyKey: item.clientId,
            });
          } else if (item.input.mediaUrl) {
            await sendLiveMedia({
              workspaceId: liveWorkspaceId,
              conversationId,
              ...item.input,
              idempotencyKey: item.clientId,
            });
          }
        }
        if (uploaded.length)
          await sendLiveMediaBatch({
            workspaceId: liveWorkspaceId,
            conversationId,
            batchId,
            attachments: uploaded,
          });
      } catch (error) {
        patchMessages(conversationId, optimisticIds, {
          status: "failed",
          uploadProgress: undefined,
        });
        onToast(sendFailureMessage(error, "errors.sendAttachment"), "error");
        return;
      }
      pending.forEach((item) =>
        failedMediaRetryInputs.delete(item.optimistic.id),
      );
      patchMessages(conversationId, optimisticIds, {
        status: "sent",
        uploadProgress: undefined,
      });
      onToast(t("toasts.attachmentAccepted"));
      await refreshAfterSend(liveWorkspaceId, conversationId);
    });
    return true;
  };

  /**
   * Composer entry points: hand the message to the thread and return at once,
   * so the text and attachments leave the input as soon as their bubbles are
   * on screen instead of after the WhatsApp round trip.
   */
  const queueComposerMessage = (text: string): boolean => {
    if (!text.trim()) return false;
    const replyTo =
      composerMode?.kind === "reply" &&
      composerMode.conversationId === selected.id
        ? composerMode.message
        : undefined;
    if (replyTo) setComposerMode(undefined);
    void sendMessage(text, undefined, undefined, replyTo?.id);
    return true;
  };
  /** Same body the server records, so the persisted copy retires the bubble. */
  const queueContactCard = (contact: ShareContactInput) => {
    void sendMessage(
      `📇 ${contact.fullName}\n${contact.phoneNumber}`,
      undefined,
      contact,
    );
  };
  const queueComposerMedia = (inputs: ComposerMediaInput[]): boolean => {
    if (!liveMode || !workspaceId) {
      onToast(t("toasts.attachmentsUnavailable"), "error");
      return false;
    }
    void sendMediaBatch(inputs);
    return true;
  };

  const setConversationAiActive = async (active: boolean) => {
    const plan = planConversationAiToggle(selected, active);
    if (!plan) return;
    const previous = selected;
    setConversations((current) =>
      current.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              ...(plan.aiMode ? { aiMode: plan.aiMode } : {}),
              ...(active ? { attention: "ai_handling" as const } : {}),
              ...(plan.resume
                ? {
                    automationState: "ai_active" as const,
                    humanTakeoverReason: undefined,
                  }
                : {}),
            }
          : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (plan.aiMode)
          await updateLiveConversation({
            workspaceId,
            conversationId: selected.id,
            updates: { ai_mode: plan.aiMode },
          });
        // Turning AI on must clear human_paused; otherwise the worker keeps
        // short-circuiting and Support keeps getting replyAllowed=false.
        if (plan.resume)
          await resumeLiveConversationAi({
            workspaceId,
            conversationId: selected.id,
          });
      }
      onToast(active ? t("toasts.aiTurnedOn") : t("toasts.aiTurnedOff"));
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id
            ? {
                ...item,
                aiMode: previous.aiMode,
                automationState: previous.automationState,
                attention: previous.attention,
                humanTakeoverReason: previous.humanTakeoverReason,
              }
            : item,
        ),
      );
      onToast(localizedError(error, t("errors.saveAiState")), "error");
    }
  };

  const setConversationState = async (status: "snoozed" | "resolved") => {
    const conversationId = selected.id;
    const previous = { status: selected.status, attention: selected.attention };
    setConversations((current) =>
      current.map((item) =>
        item.id === conversationId
          ? { ...item, status, attention: "none" }
          : item,
      ),
    );
    try {
      if (liveMode && workspaceId) {
        if (status === "snoozed")
          await snoozeLiveConversation({
            workspaceId,
            conversationId,
            until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          });
        else
          await resolveLiveConversation({
            workspaceId,
            conversationId,
          });
      }
      onToast(
        status === "snoozed"
          ? t("toasts.conversationSnoozed")
          : t("toasts.conversationResolved"),
      );
    } catch (error) {
      // Roll back only the fields this action changed; messages that arrived
      // meanwhile stay.
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId ? { ...item, ...previous } : item,
        ),
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
    setConversationDeleting(true);
    try {
      if (liveMode && workspaceId)
        await deleteLiveConversation({ workspaceId, conversationId });
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== conversationId),
      );
      const latest = latestRef.current;
      if (latest.selectedId === conversationId) {
        setSelectedConversationId(
          latest.conversations.find(
            (conversation) => conversation.id !== conversationId,
          )?.id ?? "",
        );
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
    const pausedIds = new Set(
      conversations
        .filter(
          (conversation) =>
            ids.includes(conversation.id) &&
            conversation.automationState === "human_paused",
        )
        .map((conversation) => conversation.id),
    );
    const results = liveMode
      ? await Promise.allSettled(
          ids.map(async (conversationId) => {
            if (!workspaceId) throw new Error("workspace_missing");
            await updateLiveConversation({
              workspaceId,
              conversationId,
              updates: { ai_mode: mode },
            });
            if (mode !== "off" && pausedIds.has(conversationId))
              await resumeLiveConversationAi({
                workspaceId,
                conversationId,
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
              ...(mode !== "off" && pausedIds.has(conversation.id)
                ? {
                    automationState: "ai_active" as const,
                    humanTakeoverReason: undefined,
                  }
                : {}),
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
    // Filter the live list, not the copy from before the confirm dialog: a
    // stale copy erased messages and threads that arrived during the delete.
    setConversations((current) =>
      current.filter((conversation) => !deleted.has(conversation.id)),
    );
    const latest = latestRef.current;
    if (latest.selectedId && deleted.has(latest.selectedId)) {
      setSelectedConversationId(
        latest.conversations.find(
          (conversation) => !deleted.has(conversation.id),
        )?.id ?? "",
      );
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
    failedMediaRetryInputs.delete(messageId);
    failedContactRetryInputs.delete(messageId);
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
    if (failedContactRetryInputs.has(message.id)) {
      onToast(t("errors.editMessage"));
      return;
    }
    const mediaInput =
      message.type === "text"
        ? undefined
        : failedMediaRetryInputs.get(message.id);
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
    // Read before removeFailedMessage clears it, or the card goes out as text.
    const contact = failedContactRetryInputs.get(message.id);
    const mediaInput =
      message.type === "text"
        ? undefined
        : failedMediaRetryInputs.get(message.id);
    if (message.type !== "text" && !mediaInput) {
      onToast(t("errors.retryMessage"));
      return;
    }
    setMessageActionId(message.id);
    removeFailedMessage(message.id);
    try {
      if (message.type === "text")
        await sendMessage(
          message.text,
          message.clientId,
          contact,
          message.quotedMessageId,
        );
      else if (mediaInput)
        await sendMediaBatch(
          [{ ...mediaInput, caption: message.text || mediaInput.caption }],
          message.clientId,
        );
    } finally {
      setMessageActionId(undefined);
    }
  };

  const cancelFailedMessage = (message: Message) => {
    removeFailedMessage(message.id);
    onToast(t("toasts.messageCanceled"));
  };

  const replyToMessage = (message: Message) => {
    if (!canReplyToMessage(message)) {
      onToast(t("errors.syncingMessage"));
      return;
    }
    setComposerMode({ kind: "reply", conversationId: selected.id, message });
  };

  const startEditMessage = (message: Message) => {
    if (!canEditMessage(message)) {
      onToast(t("errors.editWindowClosed"));
      return;
    }
    setComposerMode({ kind: "edit", conversationId: selected.id, message });
  };

  /**
   * Rewrites a sent text. The bubble shows the new text at once and goes back
   * to the old one if WhatsApp refuses the edit.
   */
  const saveEditedMessage = async (message: Message, body: string) => {
    setComposerMode(undefined);
    const conversationId = selected.id;
    const previous = { text: message.text, editedAt: message.editedAt };
    const ids = new Set([message.id]);
    patchMessages(conversationId, ids, {
      text: replaceVisibleBody(message.text, body),
      editedAt: new Date().toISOString(),
    });
    if (!liveMode || !workspaceId) {
      onToast(t("toasts.messageEdited"));
      return;
    }
    try {
      await editLiveMessage({
        workspaceId,
        conversationId,
        messageId: message.id,
        text: body,
      });
      onToast(t("toasts.messageEdited"));
    } catch (error) {
      patchMessages(conversationId, ids, previous);
      const code = error instanceof LiveActionError ? error.code : undefined;
      onToast(
        code === "message_edit_window_closed"
          ? t("errors.editWindowClosed")
          : sendFailureMessage(error, "errors.editSentMessage"),
        "error",
      );
    }
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

  rowHandlersRef.current = {
    toggleConversationSelection,
    selectConversation,
    deleteConversation,
    selectionMode,
    deleteMessage,
    editFailedMessage,
    cancelFailedMessage,
    retryFailedMessage,
    refreshFailedMedia,
    setMessageMediaUrl,
    openMediaViewer,
    reactToMessage,
    replyToMessage,
    startEditMessage,
    selectedId: selected?.id,
    onToast,
    t,
  };
  const stepConversation = (step: 1 | -1) => {
    const index = filtered.findIndex((item) => item.id === selected.id);
    const next = filtered[index + step];
    if (next) selectConversation(next);
  };
  shortcutHandlersRef.current = {
    onNext: () => stepConversation(1),
    onPrevious: () => stepConversation(-1),
    onReply: () =>
      document
        .querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.focus(),
    onResolve: () => void setConversationState("resolved"),
    onToggleContext: toggleContext,
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
        className={`inbox-layout ${mobileConversationOpen ? "mobile-conversation-open" : ""} ${filtered.length === 0 ? "no-visible-conversation" : ""} ${railDragging ? "is-resizing-rail" : ""}`}
        style={railLayoutStyle}
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
                {SUPPORT_AI_SURFACES_ENABLED && (
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
                )}
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
                onSelectionChange={onRowSelectionChange}
                onClick={onRowClick}
                onDelete={onRowDelete}
                photoUrl={conversation.photoUrl ?? foundPhotos[conversation.id]}
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
          <button
            className={`conversation-rail-resize ${railDragging ? "is-dragging" : ""}`}
            type="button"
            aria-label={t("ui.resizeConversationList")}
            aria-orientation="vertical"
            aria-valuemin={INBOX_RAIL_WIDTH_MIN}
            aria-valuemax={INBOX_RAIL_WIDTH_MAX}
            aria-valuenow={railWidth}
            onPointerDown={onResizePointerDown}
            onKeyDown={onResizeKeyDown}
          />
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
            onSetAiActive={(active) => void setConversationAiActive(active)}
            onSnooze={() => void setConversationState("snoozed")}
            onResolve={() => void setConversationState("resolved")}
            onDelete={() => void deleteConversation()}
            deleting={conversationDeleting}
            onAssign={assignConversation}
            onRename={saveContactName}
            assigneeOptions={assigneeOptions}
            aiDetailsOpen={aiDetailsOpen}
            onToggleAiDetails={() => setAiDetailsOpen((current) => !current)}
            contextExpanded={contextIsDrawer ? contextOpen : !contextCollapsed}
            contextIsDrawer={contextIsDrawer}
            onOpenContext={toggleContext}
            customerAlerts={headerAlerts}
            photoUrl={selected.photoUrl ?? foundPhotos[selected.id]}
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
                  const continued =
                    !showDayDivider &&
                    message.id !== firstUnreadId &&
                    continuesGroup(selected.messages[index - 1], message);
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
                      {message.id === firstUnreadId && (
                        <div className="unread-divider" role="separator">
                          <span>
                            {t("ui.unreadMessages", {
                              count: unreadOnOpen.count,
                            })}
                          </span>
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        continued={continued}
                        messageWorkspaceId={workspaceId ?? ""}
                        senderName={
                          message.senderUserId
                            ? senderNames[message.senderUserId]
                            : undefined
                        }
                        actionPending={messageActionId === message.id}
                        reactionPending={reactionPendingId === message.id}
                        onDelete={onBubbleDelete}
                        onEditFailed={onBubbleEditFailed}
                        onCancelFailed={onBubbleCancelFailed}
                        onRetryFailed={onBubbleRetryFailed}
                        onMediaError={onBubbleMediaError}
                        onMediaResolved={onBubbleMediaResolved}
                        onOpenMedia={onBubbleOpenMedia}
                        onCopy={onBubbleCopy}
                        onReact={onBubbleReact}
                        onReply={onBubbleReply}
                        onEdit={onBubbleEdit}
                        onQuoteOpen={onQuoteOpen}
                        quoted={
                          message.quotedMessageId
                            ? messagesById.get(message.quotedMessageId)
                            : undefined
                        }
                        quotedSenderName={(() => {
                          const quoted = message.quotedMessageId
                            ? messagesById.get(message.quotedMessageId)
                            : undefined;
                          return quoted?.senderUserId
                            ? senderNames[quoted.senderUserId]
                            : undefined;
                        })()}
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
            // One composer per thread: staged files, a recording and the
            // pending text can never follow the operator into another chat.
            key={selected.id}
            initialText={composerDrafts.get(selected.id) ?? ""}
            onTextChange={(text) => composerDrafts.set(selected.id, text)}
            onPrefillApplied={() => setDraftInsertRequest(undefined)}
            onShareContact={liveMode ? queueContactCard : undefined}
            onSend={queueComposerMessage}
            mode={
              composerMode?.conversationId === selected.id
                ? {
                    kind: composerMode.kind,
                    message: composerMode.message,
                    senderName: composerMode.message.senderUserId
                      ? senderNames[composerMode.message.senderUserId]
                      : undefined,
                  }
                : undefined
            }
            onCancelMode={() => setComposerMode(undefined)}
            onSubmitEdit={(message, text) =>
              void saveEditedMessage(message, text)
            }
            onTyping={notifyTyping}
            onSendMediaBatch={queueComposerMedia}
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
          collapsed={contextCollapsed}
          onToggleCollapsed={toggleContext}
          onClose={() => {
            if (window.matchMedia(CONTEXT_DRAWER_QUERY).matches)
              setContextOpen(false);
            else toggleContext();
          }}
          onOpenIssue={(issueId) => {
            setContextOpen(false);
            onOpenIssue(issueId);
          }}
          customer={
            liveMode ? (
              <ZeloCustomerPanel
                key={selected.id}
                state={zeloCustomer}
                issues={issues
                  .filter((issue) => issue.conversationId === selected.id)
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .slice(0, 5)}
                onOpenIssue={(issueId) => {
                  setContextOpen(false);
                  onOpenIssue(issueId);
                }}
                onCopied={() => onToast(t("customer.idCopied"))}
              />
            ) : null
          }
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

const ConversationRow = memo(function ConversationRow({
  conversation,
  selected,
  selectionMode,
  checked,
  selectionDisabled,
  onSelectionChange,
  onClick,
  onDelete,
  photoUrl = conversation.photoUrl,
}: {
  conversation: Conversation;
  selected: boolean;
  selectionMode: boolean;
  checked: boolean;
  selectionDisabled: boolean;
  onSelectionChange: (id: string, shiftKey: boolean) => void;
  onClick: (conversation: Conversation, shiftKey: boolean) => void;
  onDelete: (id: string) => void;
  /** A photo found after the list loaded; defaults to the stored one. */
  photoUrl?: string;
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
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              onSelectionChange(
                conversation.id,
                (event.nativeEvent as MouseEvent).shiftKey,
              )
            }
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
        onClick={(event: ReactMouseEvent<HTMLButtonElement>) =>
          onClick(conversation, event.shiftKey)
        }
      >
        <ContactAvatar conversation={conversation} photoUrl={photoUrl} />
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
          <div className="conversation-preview">
            <WhatsAppPreviewText text={conversation.lastMessage} />
          </div>
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
              onClick={() => onDelete(conversation.id)}
            >
              <Trash2 size={14} /> {t("ui.deleteConversation")}
            </button>
          </ActionMenu>
        </div>
      )}
      <div className={`attention-marker ${conversation.attention}`} />
    </div>
  );
});

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

/**
 * "IA ativa" in full; a narrow thread keeps only the first word so the switch
 * never loses its label.
 */
function AiToggleLabel({ text }: { text: string }) {
  const [first, ...rest] = text.split(" ");
  return (
    <span className="conversation-ai-toggle-label">
      {first}
      {rest.length > 0 && (
        <span className="conversation-ai-toggle-rest"> {rest.join(" ")}</span>
      )}
    </span>
  );
}

function ConversationHeader({
  conversation,
  onMobileBack,
  onOpenLinkedIssue,
  onSetAiActive,
  onSnooze,
  onResolve,
  onDelete,
  deleting,
  onAssign,
  onRename,
  assigneeOptions,
  aiDetailsOpen,
  onToggleAiDetails,
  contextExpanded,
  contextIsDrawer,
  onOpenContext,
  customerAlerts: alerts,
  photoUrl = conversation.photoUrl,
}: {
  conversation: Conversation;
  onMobileBack: () => void;
  onOpenLinkedIssue?: () => void;
  onSetAiActive: (active: boolean) => void;
  onSnooze: () => void;
  onResolve: () => void;
  onDelete: () => void;
  deleting: boolean;
  onAssign: (assignee: string) => void;
  onRename: (displayName: string) => void | Promise<void>;
  assigneeOptions: AssigneeOption[];
  aiDetailsOpen: boolean;
  onToggleAiDetails: () => void;
  /** The drawer is open, or the desktop column is showing. */
  contextExpanded: boolean;
  contextIsDrawer: boolean;
  onOpenContext: () => void;
  /** What the Zelo panel flags, kept in sight when the panel is folded. */
  customerAlerts: CustomerLabel[];
  photoUrl?: string;
}) {
  const { t } = useTranslation("inbox");
  const conversationAssigneeOptions = assigneeOptions.map((option) =>
    option.value === conversation.assignee
      ? { ...option, disabled: false }
      : option,
  );
  const aiActive = isConversationAiActive(conversation);
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
        <ContactAvatar conversation={conversation} photoUrl={photoUrl} large />
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
                {alerts.map((alert) => (
                  <span
                    key={alert.key}
                    className={`customer-chip ${alert.tone}`}
                  >
                    {t(`customer.${alert.key}`, alert.values)}
                  </span>
                ))}
              </>
            )}
          </div>
          <p>
            {conversation.chatType === "group"
              ? t("ui.groupChat")
              : conversation.phone}
            {conversation.company ? ` · ${conversation.company}` : ""}
            {conversation.humanTakeoverReason && (
              <span className="ai-reason" title={t("ui.humanTakeoverReason")}>
                <span className="ai-reason-separator"> · </span>
                {t(`takeover.${conversation.humanTakeoverReason}`, {
                  defaultValue: conversation.humanTakeoverReason.replaceAll(
                    "_",
                    " ",
                  ),
                })}
              </span>
            )}
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
        <button
          className={`conversation-ai-toggle ${aiActive ? "checked" : ""}`}
          type="button"
          role="switch"
          aria-checked={aiActive}
          onClick={() => onSetAiActive(!aiActive)}
        >
          <span className="conversation-ai-toggle-track" aria-hidden="true">
            <span />
          </span>
          <AiToggleLabel text={t("ui.aiActive")} />
        </button>
        {SUPPORT_AI_SURFACES_ENABLED &&
          conversation.humanTakeoverReason?.startsWith("support_ai_") && (
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
          aria-label={
            contextIsDrawer
              ? t("context.open")
              : contextExpanded
                ? t("context.collapse")
                : t("context.expand")
          }
          aria-expanded={contextExpanded}
          aria-controls={INBOX_CASE_CONTEXT_ID}
          onClick={onOpenContext}
        >
          <PanelRight size={16} />
        </button>
        {onOpenLinkedIssue && (
          <button
            className="icon-button conversation-desktop-control linked-issue-shortcut"
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
              {SUPPORT_AI_SURFACES_ENABLED && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleAiDetails();
                    setMenuOpen(false);
                  }}
                >
                  <Sparkles size={14} />
                  {aiDetailsOpen
                    ? t("ui.hideAiDetails")
                    : t("ui.showAiDetails")}
                </button>
              )}
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
                  className="mobile-menu-control linked-issue-menu-item"
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
              {SUPPORT_AI_SURFACES_ENABLED &&
                conversation.humanTakeoverReason?.startsWith("support_ai_") && (
                  <Link
                    className="mobile-menu-control"
                    role="menuitem"
                    to="/settings/engineering/agents/support"
                    onClick={() => setMenuOpen(false)}
                  >
                    <LockKeyhole size={14} /> {t("ui.configureSupportAi")}
                  </Link>
                )}
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

/** The quoted message shown above a reply, as WhatsApp does. */
function MessageQuote({
  quoted,
  senderName,
  onOpen,
}: {
  quoted?: Message;
  senderName?: string;
  onOpen: (messageId: string) => void;
}) {
  const { t } = useTranslation("inbox");
  if (!quoted)
    return (
      <div className="message-quote unavailable">
        {t("ui.quotedMessageUnavailable")}
      </div>
    );
  const preview = conversationPreviewText(quoted);
  return (
    <button
      className={`message-quote ${quoted.direction}`}
      type="button"
      aria-label={t("ui.goToQuoted")}
      onClick={() => onOpen(quoted.id)}
    >
      <strong>
        {quoted.direction === "outbound"
          ? senderName || quoted.sender
          : quoted.sender}
      </strong>
      <span>{quoted.deleted ? t("ui.messageDeleted") : preview}</span>
    </button>
  );
}

const MessageBubble = memo(function MessageBubble({
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
  onReply,
  onEdit,
  onQuoteOpen,
  quoted,
  quotedSenderName,
  continued = false,
}: {
  message: Message;
  /** Follows a bubble from the same sender a moment earlier. */
  continued?: boolean;
  messageWorkspaceId: string;
  senderName?: string;
  actionPending: boolean;
  reactionPending: boolean;
  onDelete: (message: Message) => void;
  onEditFailed: (message: Message) => void;
  onCancelFailed: (message: Message) => void;
  onRetryFailed: (message: Message) => void;
  onMediaError: (messageId: string) => void;
  onMediaResolved: (messageId: string, url: string) => void;
  onOpenMedia: (messageId: string) => void;
  onCopy: (message: Message) => void;
  onReact: (message: Message, reaction: string) => void;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onQuoteOpen: (messageId: string) => void;
  /** The message this one answers, when it is loaded in the thread. */
  quoted?: Message;
  quotedSenderName?: string;
}) {
  const { t } = useTranslation("inbox");
  const visibleText = stripHumanWhatsAppIntro(message.text);
  const editable = canEditMessage(message);
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
      className={`message-row ${message.direction}${pendingOutbound ? " optimistic-pending" : ""}${continued ? " continued" : ""}`}
      data-message-id={message.id}
    >
      <div className="message-meta">
        {!continued &&
          message.direction === "outbound" &&
          message.aiGenerated && (
            <span className="ai-tag">
              <Sparkles size={11} /> {t("ui.aiGenerated")}
            </span>
          )}
        {!continued && <>{senderName || message.sender} · </>}
        {formatMessageTime(message.createdAt, message.time)}
        {message.editedAt && !message.deleted && (
          <> · {t("ui.messageEdited")}</>
        )}
      </div>
      <div className="message-content-row">
        <div className="message-bubble-wrap">
          {message.quotedMessageId && !message.deleted && (
            <MessageQuote
              quoted={quoted}
              senderName={quotedSenderName}
              onOpen={onQuoteOpen}
            />
          )}
          {message.deleted ? (
            <div className="message-bubble deleted-message">
              {t("ui.messageDeleted")}
            </div>
          ) : message.type !== "text" &&
            message.mediaStatus &&
            message.mediaStatus !== "ready" ? (
            <div className="message-bubble attachment-bubble media-unavailable">
              <div className="media-static-preview" aria-hidden="true">
                {(message.attachment?.meta ?? t("ui.media"))
                  .split("/")
                  .at(-1)
                  ?.toUpperCase()}
              </div>
              <span>
                <strong>{message.attachment?.name ?? t("ui.media")}</strong>
                <small>
                  {message.mediaStatus === "processing"
                    ? t("ui.processingMedia")
                    : message.mediaStatus === "unsupported"
                      ? t("ui.mediaUnsupported", {
                          format: message.attachment?.meta ?? t("ui.unknown"),
                        })
                      : t("ui.mediaUnavailable")}
                </small>
              </span>
            </div>
          ) : message.type === "text" ? (
            <div
              className={`message-bubble${visibleText ? "" : " unavailable-message"}`}
            >
              {visibleText ? (
                <WhatsAppMessageText text={visibleText} />
              ) : (
                t("ui.messageUnavailable")
              )}
            </div>
          ) : (
            <MessageMedia
              workspaceId={messageWorkspaceId}
              message={message}
              onError={() => onMediaError(message.id)}
              onOpen={() => onOpenMedia(message.id)}
              onResolved={(url) => onMediaResolved(message.id, url)}
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
                  onClick={() => onReact(message, "")}
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
                onClick={() => onEditFailed(message)}
              >
                <PenLine size={14} /> {t("ui.editMessage")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={actionPending}
                onClick={() => onCancelFailed(message)}
              >
                <X size={14} /> {t("ui.cancelMessage")}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={actionPending}
                onClick={() => onRetryFailed(message)}
              >
                <Send size={14} />
                {actionPending ? t("ui.retrying") : t("ui.retryMessage")}
              </button>
            </>
          )}
          {!failedOutbound && (
            <>
              {canReplyToMessage(message) && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onReply(message)}
                >
                  <Reply size={14} /> {t("ui.reply")}
                </button>
              )}
              {editable && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={actionPending}
                  onClick={() => onEdit(message)}
                >
                  <PenLine size={14} /> {t("ui.editMessage")}
                </button>
              )}
              {!message.deleted && message.text && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => onCopy(message)}
                >
                  <Copy size={14} /> {t("ui.copyMessage")}
                </button>
              )}
              {!message.deleted && message.direction === "outbound" && (
                <button
                  className="danger"
                  type="button"
                  role="menuitem"
                  disabled={actionPending}
                  onClick={() => onDelete(message)}
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
                      onClick={() => onReact(message, reaction)}
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
            message.uploadProgress !== undefined &&
            message.uploadProgress < 100 ? (
              t("ui.sendingProgress", { percent: message.uploadProgress })
            ) : (
              t("ui.sending")
            )
          ) : message.status === "failed" ? (
            t("ui.failed")
          ) : message.status === "read" ? (
            <CheckCheck className="read" size={13} />
          ) : message.status === "delivered" ? (
            <CheckCheck size={13} />
          ) : (
            <Check size={13} />
          )}
        </span>
      )}
    </div>
  );
});

/** WhatsApp Web formatting shortcuts: Ctrl/⌘+B, I, Shift+X and Shift+M. */
function formatShortcutMarker(
  event: ReactKeyboardEvent<HTMLTextAreaElement>,
): WaFormatMarker | undefined {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return undefined;
  const key = event.key.toLowerCase();
  if (!event.shiftKey && key === "b") return "*";
  if (!event.shiftKey && key === "i") return "_";
  if (event.shiftKey && key === "x") return "~";
  if (event.shiftKey && key === "m") return "```";
  return undefined;
}

function MediaComposer({
  onSend,
  mode,
  onCancelMode,
  onSubmitEdit,
  onTyping,
  onSendMediaBatch,
  onUseDraft,
  prefillDraft,
  onPrefillApplied,
  initialText = "",
  onTextChange,
  onShareContact,
  liveMode,
}: {
  onShareContact?: (contact: ShareContactInput) => void;
  initialText?: string;
  onTextChange?: (text: string) => void;
  onPrefillApplied?: () => void;
  onSend: (message: string) => boolean | Promise<boolean>;
  /** Replying to one message, or rewriting one already sent. */
  mode?: {
    kind: "reply" | "edit";
    message: Message;
    senderName?: string;
  };
  onCancelMode?: () => void;
  onSubmitEdit?: (message: Message, text: string) => void;
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
  liveMode: boolean;
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
  };
  const [text, setText] = useState(initialText);
  const onPrefillAppliedRef = useRef(onPrefillApplied);
  onPrefillAppliedRef.current = onPrefillApplied;
  const [sending, setSending] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [recording, setRecording] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
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
        },
      ]);
    }
    // Consumed once: a remount (switching threads and back) must not stage the
    // same retry attachment again.
    onPrefillAppliedRef.current?.();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefillDraft]);

  const editing = mode?.kind === "edit" ? mode.message : undefined;
  const replyingTo = mode?.kind === "reply" ? mode.message : undefined;
  const editingId = editing?.id;
  const editingText = editing ? stripHumanWhatsAppIntro(editing.text) : "";
  // The reply being typed waits here while a sent message is rewritten, and
  // comes back once the edit is saved or cancelled.
  const draftBeforeEditRef = useRef<string | undefined>(undefined);
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    if (editingId) {
      if (draftBeforeEditRef.current === undefined)
        draftBeforeEditRef.current = textRef.current;
      setText(editingText);
    } else if (draftBeforeEditRef.current !== undefined) {
      setText(draftBeforeEditRef.current);
      draftBeforeEditRef.current = undefined;
    }
    // editingText is read once per message: retyping must not be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);
  const modeKey = mode ? `${mode.kind}:${mode.message.id}` : undefined;
  useEffect(() => {
    if (modeKey) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [modeKey]);

  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;
  useEffect(() => {
    // The text of a message being edited is not a draft of a new one.
    if (editingId) return;
    onTextChangeRef.current?.(text);
  }, [text, editingId]);

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
      discardRecordingRef.current = false;
      recordingStreamRef.current = stream;
      setRecordingStream(stream);
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
        setRecordingStream(null);
        setRecording(false);
        if (!audio.size || discardRecordingRef.current) return;
        // Stopping only ends the recording: the clip waits in the preview bar,
        // where the operator listens back and then sends or removes it.
        setPendingFiles((current) =>
          current.length >= 10
            ? current
            : [
                ...current,
                {
                  id:
                    globalThis.crypto?.randomUUID?.() ??
                    `${Date.now()}-${Math.random()}`,
                  file: audio,
                  fileName: audio.name,
                  mimeType: audio.type,
                  type: "audio",
                  previewUrl: URL.createObjectURL(audio),
                  progress: 0,
                },
              ],
        );
      };
      recorder.start(250);
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  /** Ends the recording; a discarded clip never reaches the preview bar. */
  const stopRecording = (discard = false) => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    discardRecordingRef.current = discard;
    if (!discard) recorder.requestData();
    recorder.stop();
  };

  const submit = async () => {
    if (editing) {
      const value = text.trim();
      if (!value) return;
      if (value === editingText.trim()) onCancelMode?.();
      else onSubmitEdit?.(editing, value);
      return;
    }
    // Pending files go out with the typed text as their caption, so a single
    // press of the composer send button delivers the whole message.
    if (pendingFiles.length) return submitAttachments();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      // The thread owns the message as soon as its bubble is on screen, before
      // WhatsApp answers, and keeps it when delivery fails: it renders there as
      // a failed bubble with retry, edit and cancel. Keeping the text here too
      // would show it twice and let a second press send a duplicate.
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
    }));
    setSending(true);
    try {
      if (await onSendMediaBatch(inputs)) {
        pendingFiles.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
        setPendingFiles([]);
        // The text went out as the caption; keeping it would resend it.
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  };

  const canSubmit =
    !sending && (Boolean(text.trim()) || pendingFiles.length > 0);

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
        // Clipboard images often arrive without a name, which the upload API rejects.
        const files = Array.from(event.clipboardData.files).map(
          (file, index) =>
            file.name.trim()
              ? file
              : new File(
                  [file],
                  `pasted-${Date.now()}-${index + 1}.${file.type.split("/")[1]?.split("+")[0] || "bin"}`,
                  { type: file.type, lastModified: file.lastModified },
                ),
        );
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
          disabled={
            !liveMode || !onSendMediaBatch || sending || recording || !!editing
          }
          aria-label={t("ui.attachFiles")}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip size={15} /> {t("ui.files")}
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMediaBatch || sending || !!editing}
          aria-label={recording ? t("ui.stopRecording") : t("ui.recordAudio")}
          aria-pressed={recording}
          onClick={() => {
            if (recording) stopRecording();
            else void startRecording();
          }}
        >
          {recording ? <Square size={14} /> : <Mic size={15} />}{" "}
          {recording ? t("ui.stop") : t("ui.voice")}
        </button>
        {onShareContact && (
          <button
            className="composer-tool"
            type="button"
            disabled={recording}
            aria-label={t("shareContact.triggerLabel")}
            aria-haspopup="dialog"
            aria-expanded={contactDialogOpen}
            aria-controls={SHARE_CONTACT_DIALOG_ID}
            onClick={() => setContactDialogOpen(true)}
          >
            <Contact size={15} /> {t("shareContact.trigger")}
          </button>
        )}
        {contactDialogOpen && onShareContact && (
          <ShareContactDialog
            onClose={() => setContactDialogOpen(false)}
            onShare={(contact) => {
              setContactDialogOpen(false);
              onShareContact(contact);
            }}
          />
        )}
        {SUPPORT_AI_SURFACES_ENABLED && (
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
        )}
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
                  {t("ui.megabytes")}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
      {recording && (
        <RecordingIndicator
          stream={recordingStream}
          onStop={() => stopRecording()}
          onDiscard={() => stopRecording(true)}
        />
      )}
      {mode && (
        <div className={`composer-context-bar ${mode.kind}`}>
          {mode.kind === "edit" ? (
            <PenLine size={14} aria-hidden="true" />
          ) : (
            <Reply size={14} aria-hidden="true" />
          )}
          <span>
            <strong>
              {mode.kind === "edit"
                ? t("ui.editingMessage")
                : t("ui.replyingTo", {
                    name:
                      replyingTo?.direction === "outbound"
                        ? mode.senderName || replyingTo.sender
                        : replyingTo?.sender,
                  })}
            </strong>
            <small>{conversationPreviewText(mode.message)}</small>
          </span>
          <button
            className="icon-button subtle"
            type="button"
            aria-label={
              mode.kind === "edit" ? t("ui.cancelEdit") : t("ui.cancelReply")
            }
            onClick={() => onCancelMode?.()}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="composer-input-row">
        <div className="composer-field">
          <div
            ref={highlightRef}
            className="composer-highlight"
            aria-hidden="true"
          >
            <WhatsAppComposerHighlight text={text} />
          </div>
          <textarea
            ref={textareaRef}
            aria-label={t("ui.writeReply")}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              onTyping?.();
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px`;
            }}
            onScroll={(event) => {
              if (highlightRef.current)
                highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onKeyDown={(event) => {
              const marker = formatShortcutMarker(event);
              if (marker) {
                event.preventDefault();
                const field = event.currentTarget;
                const next = toggleWhatsAppFormat(
                  field.value,
                  field.selectionStart,
                  field.selectionEnd,
                  marker,
                );
                setText(next.text);
                onTyping?.();
                requestAnimationFrame(() => {
                  field.setSelectionRange(
                    next.selectionStart,
                    next.selectionEnd,
                  );
                });
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
                return;
              }
              if (event.key === "Escape" && recording) {
                event.preventDefault();
                stopRecording(true);
                return;
              }
              if (event.key === "Escape" && mode) {
                event.preventDefault();
                onCancelMode?.();
              }
            }}
            placeholder={t("ui.writeReplyPlaceholder")}
            rows={1}
          />
        </div>
        <button
          className={`send-button ${!canSubmit ? "disabled" : ""}`}
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
          aria-label={t("send")}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
