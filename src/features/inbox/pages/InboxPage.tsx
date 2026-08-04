import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  CircleDot,
  Copy,
  Ellipsis,
  FileText,
  Filter,
  Mic,
  ListFilter,
  LockKeyhole,
  Paperclip,
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
} from "lucide-react";
import { useLocation } from "react-router-dom";
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
  loadLiveConversationSnapshot,
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
  updateLiveConversation,
  uploadLiveMediaAsset,
} from "../api";
import { ActionMenu } from "../../../shared/ui/ActionMenu";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { useConversationScroll } from "../hooks/useConversationScroll";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PriorityDot } from "../../../shared/ui/DataDisplay";
import { Select } from "../../../shared/ui/Select";
import {
  dismissAiCard,
  getAiCardDismissalStorage,
  isAiCardDismissed,
  readAiCardDismissals,
  writeAiCardDismissals,
  type AiCardDismissals,
  type AiCardKind,
} from "../ai-card-dismissals";

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

function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.lastMessageAt || "") || 0;
    const leftTime = Date.parse(left.lastMessageAt || "") || 0;
    return rightTime - leftTime;
  });
}

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

function mergeConversationSnapshot(
  current: Conversation[],
  snapshot: Conversation,
): Conversation[] {
  const existing = current.find((item) => item.id === snapshot.id);
  const persistedTextCounts = new Map(
    snapshot.messages.map((message) => [
      `${message.direction}:${message.text}`,
      snapshot.messages.filter(
        (candidate) =>
          candidate.direction === message.direction &&
          candidate.text === message.text,
      ).length,
    ]),
  );
  const pending = (existing?.messages ?? []).filter((message) => {
    if (!message.id.startsWith("temp:")) return false;
    const key = `${message.direction}:${message.text}`;
    const remaining = persistedTextCounts.get(key) ?? 0;
    if (remaining > 0) {
      persistedTextCounts.set(key, remaining - 1);
      return false;
    }
    return true;
  });
  const merged = { ...snapshot, messages: [...snapshot.messages, ...pending] };
  return sortConversations(
    existing
      ? current.map((item) => (item.id === snapshot.id ? merged : item))
      : [merged, ...current],
  );
}

export function InboxPage({
  workspaceId,
  conversations,
  setConversations,
  selectedConversationId,
  setSelectedConversationId,
  issues,
  onOpenIssue,
  onNewIssue,
  onToast,
  liveMode,
  whatsappConnected,
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
  onNewIssue: () => void;
  onToast: (message: string) => void;
  liveMode: boolean;
  whatsappConnected?: boolean;
  knowledgeArticles: KnowledgeArticle[];
  assigneeOptions: AssigneeOption[];
  assigneeLabel: (value: string) => string;
}) {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All conversations");
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [draftInsertRequest, setDraftInsertRequest] = useState<{
    text: string;
    requestId: number;
    conversationId: string;
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
  const [conversationDeleting, setConversationDeleting] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const selected =
    conversations.find((item) => item.id === selectedConversationId) ??
    conversations[0];
  const messageSignature = selected?.messages
    .map((message) => message.id)
    .join("|");
  const { messageCanvasRef, showScrollDown, scrollMessagesToBottom } =
    useConversationScroll({
      conversationId: selected?.id,
      messageSignature,
      viewKey: mobileConversationOpen ? "open" : "closed",
    });
  const filtered = useMemo(
    () =>
      conversations.filter((conversation) => {
        const queryMatch = normalizeSearch(
          `${conversation.name} ${conversation.company} ${conversation.phone} ${conversation.lastMessage}`,
        ).includes(normalizeSearch(search));
        const filterMatch =
          filter === "All conversations" ||
          (filter === "Needs attention" &&
            conversation.attention === "needs_attention") ||
          (filter === "AI handling" &&
            conversation.attention === "ai_handling") ||
          (filter === "Waiting customer" &&
            conversation.attention === "waiting_customer") ||
          (filter === "Unassigned" && conversation.assignee === "Unassigned") ||
          (filter === "Resolved" && conversation.status === "resolved");
        return queryMatch && filterMatch;
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
  }, [selected?.id]);

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

  if (!selected) {
    return (
      <div className="inbox-page">
        <EmptyState
          title="No conversations yet"
          description="New WhatsApp conversations will appear here when the connection is active."
          action={
            <button
              className="button button-ghost"
              type="button"
              onClick={onNewIssue}
            >
              <Plus size={14} /> Create an internal issue
            </button>
          }
        />
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
  const filterItems = [
    "All conversations",
    "Needs attention",
    "AI handling",
    "Waiting customer",
    "Unassigned",
    "Resolved",
  ];
  const countForFilter = (item: string) =>
    item === "All conversations"
      ? conversations.length
      : conversations.filter(
          (conversation) =>
            (item === "Needs attention" &&
              conversation.attention === "needs_attention") ||
            (item === "AI handling" &&
              conversation.attention === "ai_handling") ||
            (item === "Waiting customer" &&
              conversation.attention === "waiting_customer") ||
            (item === "Unassigned" && conversation.assignee === "Unassigned") ||
            (item === "Resolved" && conversation.status === "resolved"),
        ).length;

  const selectConversation = (conversation: Conversation) => {
    setSelectedConversationId(conversation.id);
    setMobileConversationOpen(true);
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
      }).catch((error) =>
        onToast(
          error instanceof Error
            ? error.message
            : "Could not mark conversation as read.",
        ),
      );
  };

  const sendMessage = async (text: string): Promise<boolean> => {
    if (!text.trim()) return false;
    const conversationId = selected.id;
    const clientId =
      globalThis.crypto?.randomUUID?.() ??
      `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic: Message = {
      id: `temp:${clientId}`,
      clientId,
      conversationId,
      direction: "outbound",
      sender: "You",
      text: text.trim(),
      time: "now",
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
            ? "Message sent. AI paused after your reply - choose Resume AI in the three dots menu to continue."
            : "Message accepted by WhatsApp",
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
        onToast(
          error instanceof Error ? error.message : "Message could not be sent.",
        );
        return false;
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
    onToast("Message sent");
    return true;
  };

  const sendMediaBatch = async (
    inputs: ComposerMediaInput[],
  ): Promise<boolean> => {
    if (!liveMode || !workspaceId) {
      onToast("Attachments are available only for a live WhatsApp workspace.");
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
                lastMessage: pending.at(-1)?.optimistic.text || "Attachment",
                lastTime: "now",
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
      if (snapshot)
        setConversations((current) =>
          mergeConversationSnapshot(current, snapshot),
        );
      onToast("Attachment accepted by WhatsApp");
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
      onToast(
        error instanceof Error
          ? error.message
          : "Attachment could not be sent.",
      );
      return false;
    }
  };

  const setAiMode = (mode: AiMode) => {
    if (
      mode === "safe_auto" &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable Auto-reply for this conversation? Only allowlisted, high-confidence messages can be sent.",
      )
    )
      return;
    if (liveMode && workspaceId)
      void updateLiveConversation({
        workspaceId,
        conversationId: selected.id,
        updates: { ai_mode: mode },
      }).catch((error) =>
        onToast(
          error instanceof Error
            ? error.message
            : "AI mode could not be saved.",
        ),
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
      onToast(paused ? "AI paused for this conversation" : "AI resumed");
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id
            ? { ...item, automationState: previous }
            : item,
        ),
      );
      onToast(
        error instanceof Error ? error.message : "AI state could not be saved.",
      );
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
          ? "Conversation snoozed for 1 hour"
          : "Conversation resolved",
      );
    } catch (error) {
      setConversations((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );
      onToast(
        error instanceof Error
          ? error.message
          : `Conversation could not be ${status}.`,
      );
    }
  };

  const deleteConversation = async (conversationId = selected.id) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Delete this conversation from Mend? The WhatsApp chat will not be deleted.",
      )
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
      onToast("Conversation deleted from Mend");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Conversation could not be deleted.",
      );
    } finally {
      setConversationDeleting(false);
    }
  };

  const deleteMessage = async (message: Message) => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Delete this message for everyone on WhatsApp?")
    )
      return;
    if (liveMode && workspaceId && !message.providerMessageId) {
      onToast("This message does not have a WhatsApp message id yet.");
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
      onToast("Message deleted for everyone");
    } catch (error) {
      onToast(
        error instanceof Error
          ? error.message
          : "Message could not be deleted.",
      );
    } finally {
      setMessageActionId(undefined);
    }
  };

  const reactToMessage = async (message: Message, reaction: string) => {
    if (liveMode && workspaceId && !message.providerMessageId) {
      onToast("This message does not have a WhatsApp message id yet.");
      return;
    }
    try {
      if (liveMode && workspaceId)
        await reactToLiveMessage({
          workspaceId,
          conversationId: selected.id,
          messageId: message.id,
          reaction,
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
                        reactions: [
                          ...(item.reactions ?? []),
                          { emoji: reaction, mine: true },
                        ],
                      }
                    : item,
                ),
              }
            : conversation,
        ),
      );
      onToast(`Reaction ${reaction} sent`);
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Reaction could not be sent.",
      );
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
      onToast(`Assigned to ${assigneeLabel(assignee)}`);
    } catch (error) {
      setConversations((current) =>
        current.map((item) =>
          item.id === selected.id ? { ...item, assignee: previous } : item,
        ),
      );
      onToast(
        error instanceof Error
          ? error.message
          : "Assignment could not be saved.",
      );
    }
  };

  return (
    <div
      className={`inbox-page ${mobileConversationOpen ? "mobile-detail-open" : ""}`}
    >
      <div className="inbox-toolbar">
        <div>
          <div className="page-kicker">
            Live queue <span className="live-dot inline" />
          </div>
          <h1>
            Inbox{" "}
            <span className="title-count">
              {conversations.filter((item) => item.unread > 0).length}
            </span>
          </h1>
        </div>
        <div className="toolbar-actions">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => setFilter("All conversations")}
          >
            <Filter size={15} /> All conversations
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={onNewIssue}
          >
            <Plus size={15} /> New issue
          </button>
        </div>
      </div>
      <div
        className={`inbox-layout ${mobileConversationOpen ? "mobile-conversation-open" : ""} ${filtered.length === 0 ? "no-visible-conversation" : ""}`}
      >
        <section className="conversation-rail">
          <div className="rail-heading">
            <span>
              Conversations{" "}
              <span className="count-muted">{filtered.length}</span>
            </span>
            <button
              className="icon-button subtle"
              type="button"
              aria-label="Focus conversation search"
              onClick={() => searchRef.current?.focus()}
            >
              <ListFilter size={16} />
            </button>
          </div>
          <label className="search-field">
            <Search size={15} />
            <input
              ref={searchRef}
              data-global-search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
            <kbd>/</kbd>
          </label>
          <div
            className="filter-strip"
            role="tablist"
            aria-label="Conversation filters"
          >
            {filterItems.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                className={filter === item ? "selected" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
                <span>{countForFilter(item)}</span>
              </button>
            ))}
          </div>
          <div className="conversation-list">
            {filtered.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={conversation.id === selected.id}
                onClick={() => selectConversation(conversation)}
                onDelete={() => void deleteConversation(conversation.id)}
              />
            ))}
            {filtered.length === 0 && (
              <EmptyState
                title="No conversations found"
                description="Try a different search or clear the current filter."
                search={Boolean(search)}
                action={
                  search || filter !== "All conversations" ? (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setSearch("");
                        setFilter("All conversations");
                      }}
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
          <div className="rail-footer">
            <span>
              <span className="live-dot" /> WhatsApp
            </span>
            <span>{conversations.length} conversations</span>
          </div>
        </section>
        <section className="conversation-panel">
          <button
            className="mobile-conversation-back"
            type="button"
            onClick={() => setMobileConversationOpen(false)}
          >
            <ArrowLeft size={15} /> Conversations
          </button>
          <ConversationHeader
            conversation={selected}
            onNewIssue={() => {
              if (activeIssue) onOpenIssue(activeIssue.id);
              else onNewIssue();
            }}
            onSetAiMode={setAiMode}
            onSetAiPause={(paused) => void setAiPause(paused)}
            onSnooze={() => void setConversationState("snoozed")}
            onResolve={() => void setConversationState("resolved")}
            onDelete={() => void deleteConversation()}
            deleting={conversationDeleting}
            onAssign={assignConversation}
            assigneeOptions={assigneeOptions}
            aiDetailsOpen={aiDetailsOpen}
            onToggleAiDetails={() => setAiDetailsOpen((current) => !current)}
          />
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
          <div className="message-canvas-shell">
            <div className="message-canvas" ref={messageCanvasRef}>
              <div className="day-divider">
                <span>Today</span>
              </div>
              {selected.messages.length ? (
                selected.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    actionPending={messageActionId === message.id}
                    onDelete={() => void deleteMessage(message)}
                    onCopy={async () => {
                      if (!message.text) return;
                      try {
                        await navigator.clipboard.writeText(message.text);
                        onToast("Message copied");
                      } catch {
                        onToast("Message could not be copied.");
                      }
                    }}
                    onReact={(reaction) =>
                      void reactToMessage(message, reaction)
                    }
                  />
                ))
              ) : (
                <EmptyState
                  title="No messages yet"
                  description="The first customer message will appear here."
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
                      {activeIssue.identifier} Â· {activeIssue.title}
                    </strong>
                    <small>
                      Issue linked Â· {activeIssue.status} Â·{" "}
                      {activeIssue.priority}
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
            {showScrollDown && (
              <button
                className="scroll-down-cta"
                type="button"
                aria-label="Scroll to latest messages"
                onClick={() => scrollMessagesToBottom("smooth")}
              >
                <ChevronDown size={14} /> New messages
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
            whatsappConnected={whatsappConnected}
            prefillDraft={
              draftInsertRequest?.conversationId === selected.id
                ? draftInsertRequest
                : undefined
            }
            onUseDraft={async () => {
              if (!liveMode)
                return "Entendi o impacto. Vou investigar este caso agora e te atualizo assim que tiver um prÃ³ximo passo.";
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
                onToast(
                  error instanceof Error
                    ? error.message
                    : "AI draft unavailable.",
                );
                return "";
              }
            }}
          />
        </section>
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onClick,
  onDelete,
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={`conversation-row ${selected ? "selected" : ""}`}>
      <button
        className="conversation-row-hit"
        type="button"
        aria-current={selected ? "true" : undefined}
        aria-label={`Open conversation with ${conversation.name}`}
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
            <strong>{conversation.name}</strong>
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
      <div className="conversation-row-actions">
        <ActionMenu label={conversation.name}>
          <button
            className="danger"
            type="button"
            role="menuitem"
            onClick={onDelete}
          >
            <Trash2 size={14} /> Delete conversation
          </button>
        </ActionMenu>
      </div>
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
      ? "Human takeover â€” AI paused"
      : blocked
        ? "AI blocked â€” needs human"
        : conversation.aiDecision === "auto_reply"
          ? "AI active â€” auto-reply eligible"
          : "AI active â€” Copilot";
  return (
    <aside
      className={`ai-decision-card ${blocked ? "blocked" : ""} ${conversation.automationState === "human_paused" ? "paused" : ""}`}
      aria-label="AI decision summary"
    >
      <div className="ai-decision-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> {title}
        </span>
        <span className="ai-decision-heading-actions">
          {conversation.aiConfidence !== undefined && (
            <span className="ai-confidence">
              {Math.round(conversation.aiConfidence * 100)}% confidence
            </span>
          )}
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label="Hide AI details"
              onClick={onDismiss}
            >
              <X size={14} />
            </button>
          )}
        </span>
      </div>
      <div className="ai-decision-meta">
        {conversation.aiIntent && (
          <span>Intent: {conversation.aiIntent.replaceAll("_", " ")}</span>
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
  return (
    <aside className="ai-draft-card" aria-label="Persisted AI draft">
      <div className="ai-draft-heading">
        <span className="ai-decision-title">
          <Sparkles size={13} /> AI draft ready
        </span>
        <span className="ai-draft-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => onInsert(draft.body)}
          >
            Insert
          </button>
          {onDismiss && (
            <button
              className="icon-button subtle ai-card-dismiss"
              type="button"
              aria-label="Hide AI draft"
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
              Sources: {draft.sources.map((source) => source.title).join(", ")}
            </span>
          )}
        </div>
      )}
    </aside>
  );
}

function ConversationHeader({
  conversation,
  onNewIssue,
  onSetAiMode,
  onSetAiPause,
  onSnooze,
  onResolve,
  onDelete,
  deleting,
  onAssign,
  assigneeOptions,
  aiDetailsOpen,
  onToggleAiDetails,
}: {
  conversation: Conversation;
  onNewIssue: () => void;
  onSetAiMode: (mode: AiMode) => void;
  onSetAiPause: (paused: boolean) => void;
  onSnooze: () => void;
  onResolve: () => void;
  onDelete: () => void;
  deleting: boolean;
  onAssign: (assignee: string) => void;
  assigneeOptions: AssigneeOption[];
  aiDetailsOpen: boolean;
  onToggleAiDetails: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="conversation-header">
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
            <h2>{conversation.name}</h2>
            <span className="channel-status">
              <span className="live-dot" /> WhatsApp
            </span>
          </div>
          <p>
            {conversation.phone} Â· {conversation.company}
          </p>
        </div>
      </div>
      <div className="conversation-controls">
        <label className="conversation-assignee conversation-desktop-control">
          <UserRound size={13} aria-hidden="true" />
          <span className="sr-only">Conversation assignee</span>
          <Select
            ariaLabel="Conversation assignee"
            value={conversation.assignee}
            options={assigneeOptions}
            onChange={onAssign}
          />
        </label>
        <span
          className={`mode-label ${conversation.aiMode} ${conversation.automationState}`}
        >
          <Sparkles size={13} />{" "}
          {conversation.automationState === "human_paused"
            ? "Human takeover â€” AI paused"
            : conversation.aiMode === "safe_auto"
              ? "Auto-reply"
              : conversation.aiMode === "draft"
                ? "Copilot"
                : "Manual"}
        </span>
        {conversation.humanTakeoverReason && (
          <span className="ai-reason" title="Human takeover reason">
            {conversation.humanTakeoverReason.replaceAll("_", " ")}
          </span>
        )}
        <button
          className="icon-button conversation-desktop-control"
          type="button"
          onClick={onNewIssue}
          aria-label="Open linked issue"
        >
          <CircleDot size={16} />
        </button>
        <div className="menu-wrap">
          <button
            className="icon-button"
            type="button"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Conversation actions"
          >
            <Ellipsis size={17} />
          </button>
          {menuOpen && (
            <div className="context-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleAiDetails();
                  setMenuOpen(false);
                }}
              >
                <Sparkles size={14} />
                {aiDetailsOpen ? "Hide AI details" : "Show AI details"}
              </button>
              <label className="context-menu-select mobile-menu-control">
                <UserRound size={14} />
                <span>Assignee</span>
                <Select
                  ariaLabel="Conversation assignee"
                  value={conversation.assignee}
                  options={assigneeOptions}
                  onChange={(value) => {
                    onAssign(value);
                    setMenuOpen(false);
                  }}
                />
              </label>
              <button
                className="mobile-menu-control"
                type="button"
                role="menuitem"
                onClick={() => {
                  onNewIssue();
                  setMenuOpen(false);
                }}
              >
                <CircleDot size={14} /> Open linked issue
              </button>
              <hr className="mobile-menu-control" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("draft");
                  setMenuOpen(false);
                }}
              >
                <PenLine size={14} /> Copilot
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("safe_auto");
                  setMenuOpen(false);
                }}
              >
                <Zap size={14} /> Auto-reply
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSetAiMode("off");
                  setMenuOpen(false);
                }}
              >
                <LockKeyhole size={14} /> Manual
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
                    <Zap size={14} /> Resume AI
                  </>
                ) : (
                  <>
                    <LockKeyhole size={14} /> Pause AI
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
                <Archive size={14} /> Snooze conversation
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
                  <Check size={14} /> Resolve conversation
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
                <Trash2 size={14} /> Delete conversation
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
  actionPending,
  onDelete,
  onCopy,
  onReact,
}: {
  message: Message;
  actionPending: boolean;
  onDelete: () => void;
  onCopy: () => void;
  onReact: (reaction: string) => void;
}) {
  const attachmentUrl = message.attachment?.url;
  return (
    <div className={`message-row ${message.direction}`}>
      <div className="message-meta">
        {message.direction === "outbound" && message.aiGenerated && (
          <span className="ai-tag">
            <Sparkles size={11} /> AI generated
          </span>
        )}
        {message.sender} Â· {message.time}
      </div>
      <div className="message-content-row">
        <div className="message-bubble-wrap">
          {message.deleted ? (
            <div className="message-bubble deleted-message">
              Message deleted
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
                    ? "Processing mediaâ€¦"
                    : message.mediaStatus === "unsupported"
                      ? `Format ${message.attachment?.meta ?? "unknown"} is not supported`
                      : "Media unavailable"}
                </small>
              </span>
            </div>
          ) : message.type === "text" ? (
            <div className="message-bubble">{message.text}</div>
          ) : message.type === "image" && attachmentUrl ? (
            <div className="message-bubble media-bubble">
              <img
                src={attachmentUrl}
                alt={message.attachment?.name ?? "WhatsApp image"}
              />
              {message.text && <span>{message.text}</span>}
            </div>
          ) : message.type === "video" && attachmentUrl ? (
            <div className="message-bubble media-bubble">
              <video controls preload="metadata" src={attachmentUrl}>
                <track kind="captions" />
              </video>
              {message.text && <span>{message.text}</span>}
            </div>
          ) : message.type === "audio" && attachmentUrl ? (
            <div className="message-bubble media-bubble">
              <audio controls preload="metadata" src={attachmentUrl} />
              {message.text && <span>{message.text}</span>}
            </div>
          ) : (
            <a
              className="message-bubble attachment-bubble"
              href={attachmentUrl}
              target={attachmentUrl ? "_blank" : undefined}
              rel={attachmentUrl ? "noreferrer" : undefined}
              aria-disabled={!attachmentUrl}
            >
              <FileText size={18} />
              <span>
                <strong>{message.attachment?.name ?? "Attachment"}</strong>
                <small>{message.attachment?.meta ?? "File"}</small>
              </span>
            </a>
          )}
        </div>
        {message.reactions && message.reactions.length > 0 && (
          <div className="message-reactions" aria-label="Message reactions">
            {message.reactions.map((reaction, index) => (
              <span key={`${reaction.emoji}-${index}`}>{reaction.emoji}</span>
            ))}
          </div>
        )}
        <ActionMenu label={`${message.sender} message`}>
          {!message.deleted && message.text && (
            <button type="button" role="menuitem" onClick={onCopy}>
              <Copy size={14} /> Copy message
            </button>
          )}
          {!message.deleted && (
            <button
              className="danger"
              type="button"
              role="menuitem"
              disabled={actionPending}
              onClick={onDelete}
            >
              <Trash2 size={14} />
              {actionPending ? "DeletingÃ¢â‚¬Â¦" : "Delete for everyone"}
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
                  onClick={() => onReact(reaction)}
                >
                  {reaction} React
                </button>
              ))}
            </>
          )}
        </ActionMenu>
      </div>
      {message.direction === "outbound" && (
        <span
          className={`delivery-status ${message.status === "failed" ? "failed" : ""}`}
          aria-label={message.status ?? "sent"}
        >
          {message.status === "sending" ? (
            "Sendingâ€¦"
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
  whatsappConnected,
  automationState,
}: {
  onSend: (message: string) => boolean | Promise<boolean>;
  onTyping?: () => void;
  onSendMediaBatch?: (
    input: ComposerMediaInput[],
  ) => boolean | Promise<boolean>;
  onUseDraft: () => string | Promise<string>;
  prefillDraft?: { text: string; requestId: number };
  aiMode: AiMode;
  liveMode: boolean;
  whatsappConnected?: boolean;
  automationState: AutomationState;
}) {
  type PendingFile = {
    id: string;
    file: File;
    type: ComposerMediaInput["messageType"];
    caption: string;
    previewUrl: string;
    progress: number;
  };
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] =
    useState<ComposerMediaInput["messageType"]>("document");
  const [fileName, setFileName] = useState("");
  const [caption, setCaption] = useState("");
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
      type: typeForFile(file),
      caption: "",
      previewUrl: URL.createObjectURL(file),
      progress: 0,
    }));
    if (!additions.length) return;
    setPendingFiles((current) => [...current, ...additions]);
    setMediaUrl("");
    setAttachmentOpen(true);
  };

  const removeFile = (id: string) => {
    setPendingFiles((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
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
        addFiles([
          new File(recordingChunksRef.current, `voice-${Date.now()}.webm`, {
            type: mimeType,
          }),
        ]);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        recordingStreamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  };

  const submitText = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      if (await onSend(text)) {
        setText("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  };

  const submitAttachments = async () => {
    if (!onSendMediaBatch || sending) return;
    const inputs: ComposerMediaInput[] = pendingFiles.map((item) => ({
      file: item.file,
      messageType: item.type,
      fileName: item.file.name,
      caption: item.caption.trim() || undefined,
      onProgress: (percent) =>
        setPendingFiles((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, progress: percent } : entry,
          ),
        ),
    }));
    if (!inputs.length && /^https:\/\/[^\s]+$/i.test(mediaUrl.trim()))
      inputs.push({
        mediaUrl: mediaUrl.trim(),
        messageType: mediaType,
        fileName: fileName.trim() || undefined,
        caption: caption.trim() || undefined,
      });
    if (!inputs.length) return;
    setSending(true);
    try {
      if (await onSendMediaBatch(inputs)) {
        pendingFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
        setPendingFiles([]);
        setMediaUrl("");
        setFileName("");
        setCaption("");
        setAttachmentOpen(false);
      }
    } finally {
      setSending(false);
    }
  };

  const connectionLabel = whatsappConnected
    ? "Connected to Whatsmiau"
    : liveMode
      ? "WhatsApp not connected"
      : "Demo workspace";
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
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMediaBatch || sending}
          aria-label="Attach media"
          aria-expanded={attachmentOpen}
          onClick={() => setAttachmentOpen((current) => !current)}
        >
          <Paperclip size={15} /> Attach
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || sending}
          aria-label={recording ? "Stop recording" : "Record audio"}
          onClick={() =>
            void (recording ? recorderRef.current?.stop() : startRecording())
          }
        >
          {recording ? <Square size={14} /> : <Mic size={15} />}{" "}
          {recording ? "Stop" : "Voice"}
        </button>
        <button
          className="composer-tool"
          type="button"
          disabled={sending}
          aria-label="Insert AI draft"
          onClick={() => void Promise.resolve(onUseDraft()).then(setText)}
        >
          <Sparkles size={15} /> Insert AI draft
        </button>
        <span className="composer-hint">
          Enter to send Â· Shift + Enter for newline
        </span>
      </div>
      {attachmentOpen && (
        <div className="attachment-panel" aria-label="Send attachments">
          <div className="attachment-panel-header">
            <div>
              <strong>Send through WhatsApp</strong>
              <p>Drop files, paste an image, or choose up to 10 files.</p>
            </div>
            <button
              className="icon-button subtle"
              type="button"
              aria-label="Close attachment panel"
              onClick={() => setAttachmentOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            hidden
            type="file"
            multiple
            accept={accepted}
            onChange={(event) => addFiles(Array.from(event.target.files ?? []))}
          />
          <button
            className="attachment-dropzone"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} /> Choose files or drop them here
          </button>
          {pendingFiles.length > 0 && (
            <div className="attachment-preview-grid">
              {pendingFiles.map((item) => (
                <div className="attachment-preview-card" key={item.id}>
                  {item.type === "image" ? (
                    <img src={item.previewUrl} alt={item.file.name} />
                  ) : item.type === "video" ? (
                    <video muted preload="metadata" src={item.previewUrl} />
                  ) : item.type === "audio" ? (
                    <audio controls preload="metadata" src={item.previewUrl} />
                  ) : (
                    <FileText size={24} />
                  )}
                  <button
                    className="icon-button subtle attachment-remove"
                    type="button"
                    aria-label={`Remove ${item.file.name}`}
                    onClick={() => removeFile(item.id)}
                  >
                    <X size={13} />
                  </button>
                  <strong title={item.file.name}>{item.file.name}</strong>
                  <small>
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB Â·{" "}
                    {item.progress}%
                  </small>
                  <input
                    aria-label={`Caption for ${item.file.name}`}
                    value={item.caption}
                    onChange={(event) =>
                      setPendingFiles((current) =>
                        current.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, caption: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="Caption (optional)"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="attachment-form-grid">
            <label>
              Type for public URL
              <Select
                value={mediaType}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "audio", label: "Audio" },
                  { value: "document", label: "Document" },
                ]}
                onChange={(value) =>
                  setMediaType(value as ComposerMediaInput["messageType"])
                }
              />
            </label>
            <label>
              Public HTTPS URL <span className="optional-label">optional</span>
              <input
                value={mediaUrl}
                disabled={pendingFiles.length > 0}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://cdn.example.com/file.pdf"
                inputMode="url"
              />
            </label>
            <label>
              URL file name <span className="optional-label">optional</span>
              <input
                value={fileName}
                disabled={pendingFiles.length > 0}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="manual.pdf"
              />
            </label>
            <label>
              URL caption <span className="optional-label">optional</span>
              <input
                value={caption}
                disabled={pendingFiles.length > 0}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="What should the customer see?"
              />
            </label>
          </div>
          <div className="attachment-actions">
            <button
              className="button button-ghost"
              type="button"
              onClick={() => setAttachmentOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={
                (!pendingFiles.length &&
                  !/^https:\/\/[^\s]+$/i.test(mediaUrl.trim())) ||
                sending
              }
              onClick={() => void submitAttachments()}
            >
              <Send size={14} />{" "}
              {sending
                ? "Sendingâ€¦"
                : `Send ${pendingFiles.length || 1} attachment${pendingFiles.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          aria-label="Write a reply"
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
              ? "AI paused - resume in three dots"
              : aiMode === "safe_auto"
                ? "AI is handling safe repliesâ€¦"
                : "Write a replyâ€¦"
          }
          rows={1}
        />
        <button
          className={`send-button ${!text.trim() || sending ? "disabled" : ""}`}
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void submitText()}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </div>
      <div className="composer-footer">
        <span
          className={`connection-state ${whatsappConnected ? "" : "offline"}`}
        >
          <span className={`live-dot ${whatsappConnected ? "" : "offline"}`} />{" "}
          {connectionLabel}
        </span>
        <span className="composer-ai-state">
          <Sparkles size={12} />{" "}
          {aiMode === "off"
            ? "Manual"
            : automationState === "human_paused"
              ? "AI paused"
              : aiMode === "safe_auto"
                ? "Auto-reply active"
                : "Copilot drafts ready"}
        </span>
      </div>
    </div>
  );
}
