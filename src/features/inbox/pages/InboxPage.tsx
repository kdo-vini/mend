import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  CircleDot,
  Ellipsis,
  FileText,
  Filter,
  ListFilter,
  LockKeyhole,
  Paperclip,
  PenLine,
  Plus,
  Search,
  Send,
  Sparkles,
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
  loadLiveConversationSnapshot,
  markLiveConversationRead,
  pauseLiveConversationAi,
  requestAiDraft,
  resolveLiveConversation,
  resumeLiveConversationAi,
  sendLiveMedia,
  sendLiveMessage,
  snoozeLiveConversation,
  updateLiveConversation,
} from "../api";
import { normalizeSearch } from "../../../shared/lib/format";
import { EmptyState } from "../../../shared/ui/ResourceState";
import { useConversationScroll } from "../hooks/useConversationScroll";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PriorityDot } from "../../../shared/ui/DataDisplay";
import { Select } from "../../../shared/ui/Select";

interface AssigneeOption {
  value: string;
  label: string;
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((left, right) => {
    const rightTime = Date.parse(right.lastMessageAt || "") || 0;
    const leftTime = Date.parse(left.lastMessageAt || "") || 0;
    return rightTime - leftTime;
  });
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
  const [aiDetailsOpen, setAiDetailsOpen] = useState(false);
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
    setAiDetailsOpen(false);
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

  const sendMedia = async (input: {
    mediaUrl?: string;
    file?: File;
    messageType: "image" | "video" | "audio" | "document";
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }): Promise<boolean> => {
    if (!liveMode || !workspaceId) {
      onToast("Attachments are available only for a live WhatsApp workspace.");
      return false;
    }
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
      text: input.caption ?? "",
      time: "now",
      type: input.messageType,
      status: "sending",
      attachment: {
        name: input.fileName ?? input.messageType,
        meta: input.mimeType ?? "Attachment",
      },
    };
    setConversations((current) =>
      sortConversations(
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                messages: [...item.messages, optimistic],
                lastMessage: optimistic.text || "Attachment",
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
      await sendLiveMedia({
        workspaceId,
        conversationId,
        ...input,
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
      onToast("Attachment accepted by WhatsApp");
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
        className={`inbox-layout ${mobileConversationOpen ? "mobile-conversation-open" : ""}`}
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
            onAssign={assignConversation}
            assigneeOptions={assigneeOptions}
            aiDetailsOpen={aiDetailsOpen}
            onToggleAiDetails={() => setAiDetailsOpen((current) => !current)}
          />
          <div
            className={
              "conversation-insights " + (aiDetailsOpen ? "mobile-open" : "")
            }
          >
            <AiDecisionSummary
              conversation={selected}
              onDismiss={() => setAiDetailsOpen(false)}
            />
            {selected.aiDraft && (
              <AiDraftCard
                draft={selected.aiDraft}
                onInsert={(text) =>
                  setDraftInsertRequest({
                    text,
                    requestId: Date.now(),
                    conversationId: selected.id,
                  })
                }
                onDismiss={() => setAiDetailsOpen(false)}
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
                  <MessageBubble key={message.id} message={message} />
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
                      {activeIssue.identifier} · {activeIssue.title}
                    </strong>
                    <small>
                      Issue linked · {activeIssue.status} ·{" "}
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
          <Composer
            onSend={sendMessage}
            onSendMedia={sendMedia}
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
                return "Entendi o impacto. Vou investigar este caso agora e te atualizo assim que tiver um próximo passo.";
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
}: {
  conversation: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`conversation-row ${selected ? "selected" : ""}`}
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
      <div className={`attention-marker ${conversation.attention}`} />
    </button>
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
      ? "Human takeover — AI paused"
      : blocked
        ? "AI blocked — needs human"
        : conversation.aiDecision === "auto_reply"
          ? "AI active — auto-reply eligible"
          : "AI active — Copilot";
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
            {conversation.phone} · {conversation.company}
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
            ? "Human takeover — AI paused"
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
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const attachmentUrl = message.attachment?.url;
  return (
    <div className={`message-row ${message.direction}`}>
      <div className="message-meta">
        {message.direction === "outbound" && message.aiGenerated && (
          <span className="ai-tag">
            <Sparkles size={11} /> AI generated
          </span>
        )}
        {message.sender} · {message.time}
      </div>
      <div className="message-bubble-wrap">
        {message.deleted ? (
          <div className="message-bubble deleted-message">Message deleted</div>
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
      {message.direction === "outbound" && (
        <span
          className={`delivery-status ${message.status === "failed" ? "failed" : ""}`}
          aria-label={message.status ?? "sent"}
        >
          {message.status === "sending" ? (
            "Sending…"
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

function Composer({
  onSend,
  onSendMedia,
  onUseDraft,
  prefillDraft,
  aiMode,
  liveMode,
  whatsappConnected,
  automationState,
}: {
  onSend: (message: string) => boolean | Promise<boolean>;
  onSendMedia?: (input: {
    mediaUrl?: string;
    file?: File;
    messageType: "image" | "video" | "audio" | "document";
    mimeType?: string;
    fileName?: string;
    caption?: string;
  }) => boolean | Promise<boolean>;
  onUseDraft: () => string | Promise<string>;
  prefillDraft?: { text: string; requestId: number };
  aiMode: AiMode;
  liveMode: boolean;
  whatsappConnected?: boolean;
  automationState: AutomationState;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<
    "image" | "video" | "audio" | "document"
  >("document");
  const [fileName, setFileName] = useState("");
  const [caption, setCaption] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!prefillDraft) return;
    setText(prefillDraft.text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [prefillDraft]);
  const submit = async () => {
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
  const submitAttachment = async () => {
    const cleanUrl = mediaUrl.trim();
    if (
      !onSendMedia ||
      (!selectedFile && !/^https:\/\/[^\s]+$/i.test(cleanUrl)) ||
      sending
    )
      return;
    setSending(true);
    try {
      if (
        await onSendMedia({
          mediaUrl: selectedFile ? undefined : cleanUrl,
          file: selectedFile ?? undefined,
          messageType: mediaType,
          mimeType: selectedFile?.type || undefined,
          fileName: fileName.trim() || selectedFile?.name || undefined,
          caption: caption.trim() || undefined,
        })
      ) {
        setMediaUrl("");
        setSelectedFile(null);
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
    <div className="composer">
      <div className="composer-toolbar">
        <button
          className="composer-tool"
          type="button"
          disabled={!liveMode || !onSendMedia || sending}
          aria-label="Attach media"
          aria-expanded={attachmentOpen}
          onClick={() => setAttachmentOpen((current) => !current)}
        >
          <Paperclip size={15} /> Attach
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
          Enter to send · Shift + Enter for newline
        </span>
      </div>
      {attachmentOpen && (
        <div className="attachment-panel" aria-label="Send an attachment">
          <div className="attachment-panel-header">
            <div>
              <strong>Send media through WhatsApp</strong>
              <p>
                Choose a local file up to 8 MB or provide a public HTTPS URL.
              </p>
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
          <div className="attachment-form-grid">
            <label className="attachment-file-field">
              Local file
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/opus,application/pdf,text/plain"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setSelectedFile(file);
                  if (!file) return;
                  setFileName(file.name);
                  setMediaUrl("");
                  if (file.type.startsWith("image/")) setMediaType("image");
                  else if (file.type.startsWith("video/"))
                    setMediaType("video");
                  else if (file.type.startsWith("audio/"))
                    setMediaType("audio");
                  else setMediaType("document");
                }}
              />
              {selectedFile && (
                <span>
                  {selectedFile.name} ·{" "}
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
            </label>
            <span className="attachment-or">or</span>
            <label>
              Type
              <Select
                value={mediaType}
                options={[
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "audio", label: "Audio" },
                  { value: "document", label: "Document" },
                ]}
                onChange={(value) => setMediaType(value as typeof mediaType)}
              />
            </label>
            <label>
              Public HTTPS URL
              <input
                value={mediaUrl}
                disabled={Boolean(selectedFile)}
                onChange={(event) => setMediaUrl(event.target.value)}
                placeholder="https://cdn.example.com/file.pdf"
                inputMode="url"
              />
            </label>
            <label>
              File name <span className="optional-label">optional</span>
              <input
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                placeholder="manual.pdf"
              />
            </label>
            <label>
              Caption <span className="optional-label">optional</span>
              <input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="What should the customer see?"
              />
            </label>
          </div>
          {!selectedFile && !mediaUrl.trim() ? (
            <p className="attachment-help">
              Paste a URL reachable by the Mend API. Nothing is sent until you
              confirm.
            </p>
          ) : (
            !selectedFile &&
            !/^https:\/\/[^\s]+$/i.test(mediaUrl.trim()) && (
              <p className="field-error" role="alert">
                Use a valid public HTTPS URL.
              </p>
            )
          )}
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
                (!selectedFile &&
                  !/^https:\/\/[^\s]+$/i.test(mediaUrl.trim())) ||
                Boolean(selectedFile && selectedFile.size > 8 * 1024 * 1024) ||
                sending
              }
              onClick={() => void submitAttachment()}
            >
              <Send size={14} /> {sending ? "Sending…" : "Send attachment"}
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
            event.currentTarget.style.height = "auto";
            event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 128)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            automationState === "human_paused"
              ? "AI paused - resume in three dots"
              : aiMode === "safe_auto"
                ? "AI is handling safe replies…"
                : "Write a reply…"
          }
          rows={1}
        />
        <button
          className={`send-button ${!text.trim() || sending ? "disabled" : ""}`}
          type="button"
          disabled={!text.trim() || sending}
          onClick={() => void submit()}
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
