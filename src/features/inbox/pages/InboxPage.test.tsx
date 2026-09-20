// @vitest-environment jsdom
// i18n-exempt: test renders translated output through the shared i18n instance, not useTranslation().

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n from "../../../i18n";
import { seedConversations } from "../../../data";
import type { Conversation } from "../../../types";
import { conversationMatchesInboxFilter } from "../inbox-filters";
import { InboxPage } from "./InboxPage";

const startedConversation: Conversation = {
  ...seedConversations[0],
  id: "conv-new-number",
  contactId: "contact-new-number",
  name: "Novo Cliente",
  company: "",
  phone: "+55 11 98888-7777",
  initials: "NC",
  attention: "none",
  unread: 0,
  issueId: undefined,
  issueLabel: undefined,
  lastMessage: "Hello from Téchne",
  messages: [
    {
      id: "m-new-1",
      conversationId: "conv-new-number",
      direction: "outbound",
      sender: "Operator",
      text: "Hello from Téchne",
      time: "09:00",
      type: "text",
    },
  ],
};

const startConversation = vi.fn(async (_input: unknown) => ({
  conversationId: startedConversation.id,
  created: true,
}));
const loadLiveConversationSnapshot = vi.fn(
  async (_workspaceId: string, conversationId: string) => {
    if (conversationId === startedConversation.id) return startedConversation;
    return (
      seedConversations.find((conversation) => conversation.id === conversationId) ??
      null
    );
  },
);
const loadOlderLiveConversationMessages = vi.fn(
  async (
    _workspaceId: string,
    _conversationId: string,
    _before: string,
  ) => [],
);
const deleteLiveConversation = vi.fn(async (_input: unknown) => undefined);
const updateLiveConversation = vi.fn(async (_input: unknown) => undefined);
const sendLiveMessage = vi.fn(async (_input: unknown) => undefined);

vi.mock("../api", () => ({
  LiveActionError: class LiveActionError extends Error {
    constructor(
      message: string,
      readonly status?: number,
      readonly code?: string,
    ) {
      super(message);
    }
  },
  listConnectedChannels: async () => [{ id: "channel-1", name: "Téchne" }],
  startConversation: (input: unknown) => startConversation(input),
  loadLiveConversationSnapshot: (workspaceId: string, conversationId: string) =>
    loadLiveConversationSnapshot(workspaceId, conversationId),
  loadOlderLiveConversationMessages: (
    workspaceId: string,
    conversationId: string,
    before: string,
  ) => loadOlderLiveConversationMessages(workspaceId, conversationId, before),
  deleteLiveConversation: (input: unknown) => deleteLiveConversation(input),
  deleteLiveMessage: vi.fn(),
  markLiveConversationRead: vi.fn(),
  reactToLiveMessage: vi.fn(),
  pauseLiveConversationAi: vi.fn(),
  requestAiDraft: vi.fn(),
  resolveLiveConversation: vi.fn(),
  resumeLiveConversationAi: vi.fn(),
  sendLiveMedia: vi.fn(),
  sendLiveMediaBatch: vi.fn(),
  sendLiveMessage: (input: unknown) => sendLiveMessage(input),
  sendLivePresence: vi.fn(),
  snoozeLiveConversation: vi.fn(),
  updateLiveContact: vi.fn(),
  updateLiveConversation: (input: unknown) => updateLiveConversation(input),
  uploadLiveMediaAsset: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

function InboxHarness({
  onToast = () => undefined,
}: {
  onToast?: (message: string, tone?: string) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([
    seedConversations[0],
    seedConversations[1],
  ]);
  const [selectedConversationId, setSelectedConversationId] = useState(
    seedConversations[0].id,
  );
  return (
    <MemoryRouter initialEntries={["/inbox"]}>
      <InboxPage
        workspaceId="workspace-1"
        conversations={conversations}
        setConversations={setConversations}
        selectedConversationId={selectedConversationId}
        setSelectedConversationId={setSelectedConversationId}
        issues={[]}
        onOpenIssue={() => undefined}
        onToast={onToast}
        onConfirm={async () => true}
        liveMode
        senderNames={{}}
        knowledgeArticles={[]}
        assigneeOptions={[{ value: "Marina", label: "Marina" }]}
        assigneeLabel={(value) => value}
      />
    </MemoryRouter>
  );
}

function type(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function field(name: string) {
  const element = document.body.querySelector<HTMLInputElement>(
    `[name="${name}"]`,
  );
  if (!element) throw new Error(`field ${name} was not rendered`);
  return element;
}

function openConversationName() {
  return document.body
    .querySelector(".conversation-header h2")
    ?.textContent?.trim();
}

describe("InboxPage new chat", () => {
  beforeAll(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await i18n.changeLanguage("en-US");
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    // jsdom ships neither of these; the Radix scroll area and the message
    // canvas hook both feature-detect ResizeObserver.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    startConversation.mockClear();
    loadLiveConversationSnapshot.mockClear();
    loadOlderLiveConversationMessages.mockClear();
    deleteLiveConversation.mockClear();
    updateLiveConversation.mockClear();
    sendLiveMessage.mockReset();
    sendLiveMessage.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("hydrates the open thread beyond the list preview message", async () => {
    const previewOnly: Conversation = {
      ...seedConversations[0],
      messages: [seedConversations[0].messages.at(-1)!],
    };
    const fullThread: Conversation = {
      ...seedConversations[0],
      messages: [
        {
          id: "m-history-1",
          conversationId: seedConversations[0].id,
          direction: "inbound",
          sender: seedConversations[0].name,
          text: "Boa noite",
          time: "19:00",
          type: "text",
          createdAt: "2026-09-20T22:00:00.000Z",
        },
        {
          id: "m-history-2",
          conversationId: seedConversations[0].id,
          direction: "inbound",
          sender: seedConversations[0].name,
          text: "Meus site está com inconsistência",
          time: "20:10",
          type: "text",
          createdAt: "2026-09-20T23:10:00.000Z",
        },
      ],
    };
    loadLiveConversationSnapshot.mockResolvedValueOnce(fullThread);

    function PreviewHarness() {
      const [conversations, setConversations] = useState<Conversation[]>([
        previewOnly,
      ]);
      const [selectedConversationId, setSelectedConversationId] = useState(
        previewOnly.id,
      );
      return (
        <MemoryRouter initialEntries={["/inbox"]}>
          <InboxPage
            workspaceId="workspace-1"
            conversations={conversations}
            setConversations={setConversations}
            selectedConversationId={selectedConversationId}
            setSelectedConversationId={setSelectedConversationId}
            issues={[]}
            onOpenIssue={() => undefined}
            onToast={() => undefined}
            onConfirm={async () => true}
            liveMode
            senderNames={{}}
            knowledgeArticles={[]}
            assigneeOptions={[{ value: "Marina", label: "Marina" }]}
            assigneeLabel={(value) => value}
          />
        </MemoryRouter>
      );
    }

    await act(async () => root.render(<PreviewHarness />));
    await act(async () => undefined);

    expect(loadLiveConversationSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      previewOnly.id,
    );
    expect(document.body.textContent).toContain("Boa noite");
    expect(document.body.textContent).toContain(
      "Meus site está com inconsistência",
    );
  });

  it("opens the conversation it just started instead of the first one in the list", async () => {
    await act(async () => root.render(<InboxHarness />));
    expect(openConversationName()).toBe(seedConversations[0].name);

    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>(".inbox-new-chat")
        ?.click(),
    );
    await act(async () => type(field("phoneNumber"), "+55 11 98888-7777"));
    await act(async () => type(field("message"), "Hello from Téchne"));
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>("button[type=submit]")
        ?.click(),
    );

    // The defect this guards: the new id is not in `conversations`, so the page
    // fell back to conversations[0] and showed an unrelated customer's thread.
    expect(openConversationName()).toBe("Novo Cliente");
    expect(document.body.textContent).toContain("Hello from Téchne");
    expect(startConversation).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      channelId: "channel-1",
      phoneNumber: "+55 11 98888-7777",
      message: "Hello from Téchne",
    });
    expect(loadLiveConversationSnapshot).toHaveBeenCalledWith(
      "workspace-1",
      startedConversation.id,
    );
  });

  it("reveals checkboxes on demand and supports Ctrl+A", async () => {
    await act(async () => root.render(<InboxHarness />));

    const select = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    );
    await act(async () => select?.click());

    expect(
      document.body.querySelectorAll(".conversation-select input"),
    ).toHaveLength(2);
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: true,
          bubbles: true,
        }),
      ),
    );

    expect(document.body.textContent).toContain("2 selected");
    expect(
      [
        ...document.body.querySelectorAll<HTMLInputElement>(
          ".conversation-select input",
        ),
      ].every((checkbox) => checkbox.checked),
    ).toBe(true);
  });

  it("selects a contiguous range with Shift+click", async () => {
    await act(async () => root.render(<InboxHarness />));
    const select = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    );
    await act(async () => select?.click());
    const checkboxes = [
      ...document.body.querySelectorAll<HTMLInputElement>(
        ".conversation-select input",
      ),
    ];

    await act(async () => checkboxes[0]?.click());
    const rowButtons = [
      ...document.body.querySelectorAll<HTMLButtonElement>(
        "button[aria-label^='Toggle selection']",
      ),
    ];
    await act(async () =>
      rowButtons[1]?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      ),
    );

    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true);
    expect(document.body.textContent).toContain("2 selected");
  });

  it("offers an unread filter backed by unread counts", async () => {
    await act(async () => root.render(<InboxHarness />));
    expect(document.body.querySelector(".inbox-filter-trigger")).toBeTruthy();
    expect(conversationMatchesInboxFilter(seedConversations[0], "unread")).toBe(
      true,
    );
    expect(conversationMatchesInboxFilter(seedConversations[1], "unread")).toBe(
      false,
    );
  });

  it("deletes every selected conversation after one confirmation", async () => {
    await act(async () => root.render(<InboxHarness />));
    const select = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Select",
    );
    await act(async () => select?.click());
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: true,
          bubbles: true,
        }),
      ),
    );
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>(".inbox-bulk-delete")
        ?.click(),
    );

    expect(deleteLiveConversation).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("No conversations yet");
  });

  it("hands a failed send to the thread instead of leaving it in the composer", async () => {
    const toasts: Array<{ message: string; tone?: string }> = [];
    const { LiveActionError } = await import("../api");
    sendLiveMessage.mockRejectedValue(
      new LiveActionError("channel is down", 409, "channel_disconnected"),
    );
    await act(async () =>
      root.render(
        <InboxHarness
          onToast={(message, tone) => toasts.push({ message, tone })}
        />,
      ),
    );
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    await act(async () => type(composer, "Boa noite! É isso mesmo."));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );

    expect(sendLiveMessage).toHaveBeenCalledTimes(1);
    // The thread owns the message: it shows there as failed, with retry, and
    // the composer is empty so a second press cannot send a duplicate.
    expect(composer.value).toBe("");
    expect(document.body.textContent).toContain("Boa noite! É isso mesmo.");
    expect(document.body.textContent).toContain("Failed");
    expect(toasts.at(-1)?.tone).toBe("error");
    // The server named the reason, so the operator is told what to do about it
    // rather than the same "could not be sent" every failure used to produce.
    expect(toasts.at(-1)?.message).toBe(
      "The WhatsApp channel is disconnected. Reconnect it in Settings, then tap Retry.",
    );
  });

  it("clears the composer once a message is accepted", async () => {
    await act(async () => root.render(<InboxHarness />));
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    await act(async () => type(composer, "Tudo certo por aqui."));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );

    expect(sendLiveMessage).toHaveBeenCalledTimes(1);
    expect(composer.value).toBe("");
  });
});
