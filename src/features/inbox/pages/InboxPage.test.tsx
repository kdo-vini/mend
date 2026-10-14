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
      seedConversations.find(
        (conversation) => conversation.id === conversationId,
      ) ?? null
    );
  },
);
const loadOlderLiveConversationMessages = vi.fn(
  async (_workspaceId: string, _conversationId: string, _before: string) => [],
);
const deleteLiveConversation = vi.fn(async (_input: unknown) => undefined);
const updateLiveConversation = vi.fn(async (_input: unknown) => undefined);
const sendLiveMessage = vi.fn(async (_input: unknown) => undefined);
const sendLiveContact = vi.fn(async (_input: unknown) => undefined);
const pauseLiveConversationAi = vi.fn(async (_input: unknown) => undefined);
const resumeLiveConversationAi = vi.fn(async (_input: unknown) => undefined);

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
  getMessageMediaUrl: vi.fn(async () => "https://media.example/1"),
  markLiveConversationRead: vi.fn(async () => undefined),
  reactToLiveMessage: vi.fn(),
  pauseLiveConversationAi: (input: unknown) => pauseLiveConversationAi(input),
  requestAiDraft: vi.fn(),
  resolveLiveConversation: vi.fn(),
  resumeLiveConversationAi: (input: unknown) => resumeLiveConversationAi(input),
  sendLiveMedia: vi.fn(),
  sendLiveMediaBatch: vi.fn(),
  sendLiveMessage: (input: unknown) => sendLiveMessage(input),
  sendLiveContact: (input: unknown) => sendLiveContact(input),
  sendLivePresence: vi.fn(async () => undefined),
  snoozeLiveConversation: vi.fn(),
  updateLiveContact: vi.fn(),
  updateLiveConversation: (input: unknown) => updateLiveConversation(input),
  uploadLiveMediaAsset: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

function InboxHarness({
  onToast = () => undefined,
  onConfirm = async () => true,
  initialConversations = [seedConversations[0], seedConversations[1]],
  initialPath = "/inbox",
}: {
  onToast?: (message: string, tone?: string) => void;
  onConfirm?: () => Promise<boolean>;
  initialConversations?: Conversation[];
  initialPath?: string;
}) {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialConversations[0].id,
  );
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <InboxPage
        workspaceId="workspace-1"
        conversations={conversations}
        setConversations={setConversations}
        selectedConversationId={selectedConversationId}
        setSelectedConversationId={setSelectedConversationId}
        issues={[]}
        onOpenIssue={() => undefined}
        onToast={onToast}
        onConfirm={onConfirm}
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
    pauseLiveConversationAi.mockClear();
    resumeLiveConversationAi.mockClear();
    sendLiveMessage.mockReset();
    sendLiveMessage.mockResolvedValue(undefined);
    sendLiveContact.mockReset();
    sendLiveContact.mockResolvedValue(undefined);
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

  it("keeps the contact name free of an inline rename control", async () => {
    await act(async () => root.render(<InboxHarness />));
    expect(document.body.querySelector(".identity-name-edit")).toBeNull();
    expect(
      document.body.querySelector(".conversation-header h2")?.textContent,
    ).toBe(seedConversations[0].name);
    expect(
      document.body.querySelector(".conversation-assignee"),
    ).not.toBeNull();
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

  it("lets go of the text before WhatsApp answers and keeps the composer usable", async () => {
    let deliver: () => void = () => undefined;
    sendLiveMessage.mockImplementation(
      () =>
        new Promise<undefined>(
          (resolve) => (deliver = () => resolve(undefined)),
        ),
    );
    await act(async () => root.render(<InboxHarness />));
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    await act(async () => type(composer, "Já estou vendo isso."));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );

    // Delivery is still in flight, yet the bubble is in the thread and the
    // composer is empty and enabled for the next message.
    expect(sendLiveMessage).toHaveBeenCalledTimes(1);
    expect(composer.value).toBe("");
    expect(composer.disabled).toBe(false);
    expect(document.body.textContent).toContain("Já estou vendo isso.");
    expect(document.body.textContent).toContain("Sending…");

    await act(async () => deliver());
    expect(document.body.textContent).not.toContain("Sending…");
  });

  it("delivers quick consecutive messages in the order they were written", async () => {
    const pending: Array<() => void> = [];
    sendLiveMessage.mockImplementation(
      () =>
        new Promise<undefined>((resolve) =>
          pending.push(() => resolve(undefined)),
        ),
    );
    await act(async () => root.render(<InboxHarness />));
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    for (const text of ["Primeira", "Segunda"]) {
      await act(async () => type(composer, text));
      await act(async () =>
        document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
      );
    }

    expect(sendLiveMessage).toHaveBeenCalledTimes(1);
    expect(sendLiveMessage.mock.calls[0][0]).toMatchObject({
      text: "Primeira",
    });
    await act(async () => pending[0]());
    expect(sendLiveMessage).toHaveBeenCalledTimes(2);
    expect(sendLiveMessage.mock.calls[1][0]).toMatchObject({
      text: "Segunda",
    });
    await act(async () => pending[1]());
  });

  it("never marks an accepted message failed when the follow-up refresh fails", async () => {
    const toasts: Array<{ message: string; tone?: string }> = [];
    await act(async () =>
      root.render(
        <InboxHarness
          onToast={(message, tone) => toasts.push({ message, tone })}
        />,
      ),
    );
    loadLiveConversationSnapshot.mockRejectedValueOnce(new Error("offline"));
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    await act(async () => type(composer, "Resolvido, obrigado!"));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );

    expect(sendLiveMessage).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Resolvido, obrigado!");
    expect(document.body.textContent).not.toContain("Failed");
    expect(toasts.some((toast) => toast.tone === "error")).toBe(false);
  });

  it("moves attachments into the thread at once and shows upload progress there", async () => {
    const api = await import("../api");
    const upload = vi.mocked(api.uploadLiveMediaAsset);
    const sendBatch = vi.mocked(api.sendLiveMediaBatch);
    upload.mockReset();
    sendBatch.mockReset();
    sendBatch.mockResolvedValue(undefined as never);
    let reportProgress: (percent: number) => void = () => undefined;
    let finishUpload: () => void = () => undefined;
    upload.mockImplementation(
      (input) =>
        new Promise((resolve) => {
          reportProgress = (percent) =>
            input.onProgress?.({ percent } as never);
          finishUpload = () => resolve({ assetId: "asset-1" } as never);
        }),
    );
    const createObjectURL = vi.fn(() => "blob:preview");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    await act(async () => root.render(<InboxHarness />));
    const fileInput =
      document.body.querySelector<HTMLInputElement>("input[type=file]");
    if (!fileInput) throw new Error("file input was not rendered");
    const photo = new File(["png"], "foto.png", { type: "image/png" });
    Object.defineProperty(fileInput, "files", {
      value: [photo],
      configurable: true,
    });
    await act(async () =>
      fileInput.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(
      document.body.querySelector(".attachment-preview-bar"),
    ).not.toBeNull();

    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );
    // The tray is empty while the upload runs; the bubble carries the preview.
    expect(document.body.querySelector(".attachment-preview-bar")).toBeNull();
    expect(
      document.body.querySelector<HTMLImageElement>(
        ".message-row.outbound img[src='blob:preview']",
      ),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Sending… 0%");

    await act(async () => reportProgress(42));
    expect(document.body.textContent).toContain("Sending… 42%");

    await act(async () => finishUpload());
    expect(sendBatch).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("Sending…");
  });

  it("labels media that is not ready in the operator's language", async () => {
    // An id outside the seed keeps snapshot hydration from replacing messages.
    const conversation: Conversation = {
      ...seedConversations[0],
      id: "conv-media-status",
      messages: [
        {
          id: "m-processing",
          conversationId: "conv-media-status",
          direction: "inbound",
          sender: "Cliente",
          text: "",
          time: "09:00",
          type: "image",
          mediaStatus: "processing",
          attachment: { name: "foto.jpg", meta: "image/jpeg" },
        },
        {
          id: "m-unsupported",
          conversationId: "conv-media-status",
          direction: "inbound",
          sender: "Cliente",
          text: "",
          time: "09:01",
          type: "video",
          mediaStatus: "unsupported",
          attachment: { name: "clip.avi", meta: "video/x-msvideo" },
        },
        {
          id: "m-failed",
          conversationId: "conv-media-status",
          direction: "inbound",
          sender: "Cliente",
          text: "",
          time: "09:02",
          type: "document",
          mediaStatus: "failed",
        },
      ],
    };
    await i18n.changeLanguage("pt-BR");
    try {
      await act(async () =>
        root.render(<InboxHarness initialConversations={[conversation]} />),
      );
      const text = document.body.textContent ?? "";
      expect(text).toContain("Processando mídia…");
      expect(text).toContain("O formato video/x-msvideo não é compatível");
      expect(text).toContain("Mídia indisponível");
      expect(text).toContain("Mídia");
      expect(text).not.toContain("Processing media");
      expect(text).not.toContain("Media unavailable");
    } finally {
      await i18n.changeLanguage("en-US");
    }
  });

  function clickConversation(name: string) {
    const row = [
      ...document.body.querySelectorAll<HTMLElement>(".conversation-row"),
    ].find((item) => item.textContent?.includes(name));
    const hit = row?.querySelector<HTMLElement>(".conversation-row-hit");
    if (!hit) throw new Error(`conversation ${name} was not rendered`);
    hit.click();
  }

  it("applies a ?conversation= link once instead of pulling the operator back", async () => {
    const [first, second] = [seedConversations[0], seedConversations[1]];
    await act(async () =>
      root.render(
        <InboxHarness initialPath={`/inbox?conversation=${second.id}`} />,
      ),
    );
    expect(openConversationName()).toBe(second.name);

    await act(async () => clickConversation(first.name));
    const composer = document.body.querySelector("textarea");
    if (!composer) throw new Error("composer was not rendered");
    // Any later list change (here: a send) used to re-apply the link.
    await act(async () => type(composer, "Oi"));
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>(".send-button")?.click(),
    );
    expect(openConversationName()).toBe(first.name);
    expect(sendLiveMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      conversationId: first.id,
    });
  });

  it("keeps a typed draft with its own thread", async () => {
    const [first, second] = [seedConversations[0], seedConversations[1]];
    await act(async () => root.render(<InboxHarness />));
    const composer = () => {
      const element = document.body.querySelector("textarea");
      if (!element) throw new Error("composer was not rendered");
      return element;
    };
    await act(async () => type(composer(), "Resposta para o primeiro"));

    await act(async () => clickConversation(second.name));
    expect(composer().value).toBe("");

    await act(async () => clickConversation(first.name));
    expect(composer().value).toBe("Resposta para o primeiro");
  });

  it("marks the open thread read however it was opened", async () => {
    const { markLiveConversationRead } = await import("../api");
    vi.mocked(markLiveConversationRead).mockClear();
    const unreadThread = { ...seedConversations[0], unread: 3 };
    await act(async () =>
      root.render(
        <InboxHarness
          initialConversations={[unreadThread, seedConversations[1]]}
        />,
      ),
    );
    expect(markLiveConversationRead).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: unreadThread.id,
    });
  });

  async function shareContact(name: string, phone: string) {
    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Send a contact card']",
        )
        ?.click(),
    );
    await act(async () => type(field("fullName"), name));
    await act(async () => type(field("phoneNumber"), phone));
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent === "Send contact")
        ?.click(),
    );
  }

  it("shares a contact card from the composer", async () => {
    await act(async () => root.render(<InboxHarness />));
    await shareContact("Ivo Silva", "+55 11 99999-7777");

    expect(sendLiveContact).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: seedConversations[0].id,
        contacts: [{ fullName: "Ivo Silva", phoneNumber: "5511999997777" }],
      }),
    );
    expect(sendLiveMessage).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("📇 Ivo Silva");
  });

  it("retries a failed contact card as a card, not as text", async () => {
    sendLiveContact.mockRejectedValueOnce(new Error("provider down"));
    await act(async () => root.render(<InboxHarness />));
    await shareContact("Ivo Silva", "5511999997777");
    expect(document.body.textContent).toContain("Failed");

    const failedRow = [
      ...document.body.querySelectorAll<HTMLElement>(".message-row.outbound"),
    ].find((row) => row.textContent?.includes("Ivo Silva"));
    await act(async () =>
      failedRow
        ?.querySelector<HTMLButtonElement>("button[aria-haspopup='menu']")
        ?.click(),
    );
    await act(async () =>
      [...document.body.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.trim() === "Retry")
        ?.click(),
    );
    expect(sendLiveContact).toHaveBeenCalledTimes(2);
    expect(sendLiveContact.mock.calls[1][0]).toMatchObject({
      contacts: [{ fullName: "Ivo Silva", phoneNumber: "5511999997777" }],
      idempotencyKey: (
        sendLiveContact.mock.calls[0][0] as { idempotencyKey: string }
      ).idempotencyKey,
    });
    expect(sendLiveMessage).not.toHaveBeenCalled();
  });

  describe("IA ativa toggle", () => {
    // Ids outside the seed keep snapshot hydration from overwriting the axes.
    const conversationWith = (
      aiMode: Conversation["aiMode"],
      automationState: Conversation["automationState"],
    ): Conversation => ({
      ...seedConversations[0],
      id: `conv-${aiMode}-${automationState}`,
      aiMode,
      automationState,
    });

    function aiSwitch() {
      const element = document.body.querySelector<HTMLButtonElement>(
        ".conversation-controls [role=switch]",
      );
      if (!element) throw new Error("IA ativa switch was not rendered");
      return element;
    }

    it("is the only AI control in the conversation header and menu", async () => {
      await act(async () =>
        root.render(
          <InboxHarness
            initialConversations={[conversationWith("safe_auto", "ai_active")]}
          />,
        ),
      );
      expect(aiSwitch().textContent).toBe("AI active");
      expect(aiSwitch().getAttribute("aria-checked")).toBe("true");
      expect(
        document.body.querySelector(".conversation-assignee"),
      ).not.toBeNull();

      await act(async () =>
        document.body
          .querySelector<HTMLButtonElement>(
            "button[aria-label='Conversation actions']",
          )
          ?.click(),
      );
      const menu = document.body.querySelector(".context-menu")?.textContent;
      expect(menu).toBeTruthy();
      for (const label of [
        "Pause AI",
        "Resume AI",
        "Copilot",
        "Auto-reply",
        "Manual",
      ])
        expect(menu).not.toContain(label);
      expect(document.body.querySelector(".mode-label")).toBeNull();
      expect(document.body.querySelector(".composer-ai-state")).toBeNull();
    });

    it("renders the Portuguese label", async () => {
      await i18n.changeLanguage("pt-BR");
      try {
        await act(async () =>
          root.render(
            <InboxHarness
              initialConversations={[conversationWith("draft", "ai_active")]}
            />,
          ),
        );
        expect(aiSwitch().textContent).toBe("IA ativa");
      } finally {
        await i18n.changeLanguage("en-US");
      }
    });

    it("shows off for human_paused even when ai_mode is still safe_auto", async () => {
      await act(async () =>
        root.render(
          <InboxHarness
            initialConversations={[
              conversationWith("safe_auto", "human_paused"),
            ]}
          />,
        ),
      );
      expect(aiSwitch().getAttribute("aria-checked")).toBe("false");
    });

    it("turning off writes ai_mode=off only", async () => {
      const conversation = conversationWith("safe_auto", "ai_active");
      await act(async () =>
        root.render(<InboxHarness initialConversations={[conversation]} />),
      );
      await act(async () => aiSwitch().click());

      expect(updateLiveConversation).toHaveBeenCalledTimes(1);
      expect(updateLiveConversation).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        conversationId: conversation.id,
        updates: { ai_mode: "off" },
      });
      expect(pauseLiveConversationAi).not.toHaveBeenCalled();
      expect(resumeLiveConversationAi).not.toHaveBeenCalled();
      expect(aiSwitch().getAttribute("aria-checked")).toBe("false");
    });

    it("turning on sets safe_auto and resumes a human_paused conversation", async () => {
      const conversation = conversationWith("off", "human_paused");
      await act(async () =>
        root.render(<InboxHarness initialConversations={[conversation]} />),
      );
      await act(async () => aiSwitch().click());

      expect(updateLiveConversation).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        conversationId: conversation.id,
        updates: { ai_mode: "safe_auto" },
      });
      expect(resumeLiveConversationAi).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        conversationId: conversation.id,
      });
      expect(aiSwitch().getAttribute("aria-checked")).toBe("true");
    });

    it("turning on a paused safe_auto conversation only resumes it", async () => {
      const conversation = conversationWith("safe_auto", "human_paused");
      await act(async () =>
        root.render(<InboxHarness initialConversations={[conversation]} />),
      );
      await act(async () => aiSwitch().click());

      expect(updateLiveConversation).not.toHaveBeenCalled();
      expect(resumeLiveConversationAi).toHaveBeenCalledTimes(1);
      expect(aiSwitch().getAttribute("aria-checked")).toBe("true");
    });

    it("writes on one click in both directions without a confirmation", async () => {
      const onConfirm = vi.fn(async () => false);
      const conversation = conversationWith("off", "ai_active");
      await act(async () =>
        root.render(
          <InboxHarness
            onConfirm={onConfirm}
            initialConversations={[conversation]}
          />,
        ),
      );

      await act(async () => aiSwitch().click());
      expect(updateLiveConversation).toHaveBeenLastCalledWith({
        workspaceId: "workspace-1",
        conversationId: conversation.id,
        updates: { ai_mode: "safe_auto" },
      });
      expect(aiSwitch().getAttribute("aria-checked")).toBe("true");

      await act(async () => aiSwitch().click());
      expect(updateLiveConversation).toHaveBeenLastCalledWith({
        workspaceId: "workspace-1",
        conversationId: conversation.id,
        updates: { ai_mode: "off" },
      });
      expect(aiSwitch().getAttribute("aria-checked")).toBe("false");
      expect(updateLiveConversation).toHaveBeenCalledTimes(2);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
