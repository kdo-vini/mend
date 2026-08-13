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
  async (_workspaceId: string, _conversationId: string) => startedConversation,
);

vi.mock("../api", () => ({
  LiveActionError: class LiveActionError extends Error {},
  listConnectedChannels: async () => [{ id: "channel-1", name: "Téchne" }],
  startConversation: (input: unknown) => startConversation(input),
  loadLiveConversationSnapshot: (workspaceId: string, conversationId: string) =>
    loadLiveConversationSnapshot(workspaceId, conversationId),
  deleteLiveConversation: vi.fn(),
  deleteLiveMessage: vi.fn(),
  markLiveConversationRead: vi.fn(),
  reactToLiveMessage: vi.fn(),
  pauseLiveConversationAi: vi.fn(),
  requestAiDraft: vi.fn(),
  resolveLiveConversation: vi.fn(),
  resumeLiveConversationAi: vi.fn(),
  sendLiveMedia: vi.fn(),
  sendLiveMediaBatch: vi.fn(),
  sendLiveMessage: vi.fn(),
  sendLivePresence: vi.fn(),
  snoozeLiveConversation: vi.fn(),
  updateLiveContact: vi.fn(),
  updateLiveConversation: vi.fn(),
  uploadLiveMediaAsset: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

function InboxHarness() {
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
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
});
