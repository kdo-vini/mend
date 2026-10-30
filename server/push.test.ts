import { afterEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({ default: pushMocks }));

import { WorkspacePushNotifier, getVapidPublicKey } from "./push.js";

const originalEnv = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT,
};

afterEach(() => {
  process.env.VAPID_PUBLIC_KEY = originalEnv.publicKey;
  process.env.VAPID_PRIVATE_KEY = originalEnv.privateKey;
  process.env.VAPID_SUBJECT = originalEnv.subject;
  pushMocks.setVapidDetails.mockReset();
  pushMocks.sendNotification.mockReset();
});

function activeMembers(userIds: string[]) {
  const chain = {
    eq: vi.fn(() => chain),
    then: (
      resolve: (value: { data: { user_id: string }[]; error: null }) => unknown,
    ) =>
      Promise.resolve(
        resolve({
          data: userIds.map((user_id) => ({ user_id })),
          error: null,
        }),
      ),
  };
  return { select: vi.fn(() => chain), chain };
}

function pushClient(
  rows: { user_id?: string }[],
  activeUserIds = rows.flatMap((row) => (row.user_id ? [row.user_id] : [])),
) {
  const members = activeMembers(activeUserIds);
  const select = {
    eq: vi.fn(async () => ({ data: rows, error: null })),
  };
  const remove = {
    eq: vi.fn(() => remove),
    then: (resolve: (value: { error: null }) => unknown) =>
      Promise.resolve(resolve({ error: null })),
  };
  return {
    from: vi.fn((table: string) =>
      table === "push_subscriptions"
        ? {
            select: vi.fn(() => select),
            delete: vi.fn(() => remove),
          }
        : members,
    ),
    members,
  };
}

describe("workspace web push", () => {
  it("does not advertise push when VAPID is not configured", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(getVapidPublicKey()).toBeNull();
  });

  it("sends a workspace notification to every active subscription", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    pushMocks.sendNotification.mockResolvedValue({});
    const client = pushClient([
      {
        id: "subscription-1",
        user_id: "agent-1",
        endpoint: "https://push.example/1",
        p256dh: "p256dh",
        auth: "auth",
      },
    ]);

    const result = await new WorkspacePushNotifier().notify(
      client as never,
      "workspace-1",
      { title: "Human needed", body: "A conversation was escalated." },
    );

    expect(result).toEqual({ sent: 1, configured: true });
    expect(pushMocks.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "public",
      "private",
    );
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("can send an assignment notification only to the selected member", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    pushMocks.sendNotification.mockResolvedValue({});
    const client = pushClient([
      {
        id: "subscription-1",
        user_id: "agent-1",
        endpoint: "https://push.example/1",
        p256dh: "p256dh",
        auth: "auth",
      },
      {
        id: "subscription-2",
        user_id: "agent-2",
        endpoint: "https://push.example/2",
        p256dh: "p256dh",
        auth: "auth",
      },
    ]);

    await new WorkspacePushNotifier().notify(
      client as never,
      "workspace-1",
      { title: "Assigned", body: "A conversation was assigned." },
      { userId: "agent-1" },
    );

    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/1" }),
      expect.any(String),
      expect.anything(),
    );
  });

  it("renders known notification kinds with the Portuguese copy", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    pushMocks.sendNotification.mockResolvedValue({});
    const client = pushClient([
      {
        id: "subscription-pt",
        user_id: "user-pt",
        endpoint: "https://push.example/pt",
        p256dh: "p256dh",
        auth: "auth",
      } as { user_id: string },
    ]);

    await new WorkspacePushNotifier().notify(client as never, "workspace-1", {
      title: "New WhatsApp message",
      body: "A conversation assigned to you needs attention.",
      kind: "conversation_message",
    });

    expect(pushMocks.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Nova mensagem no WhatsApp"),
      expect.anything(),
    );
    expect(client.from).toHaveBeenCalledWith("push_subscriptions");
  });

  it("skips members who marked themselves as away", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    pushMocks.sendNotification.mockResolvedValue({});
    const client = pushClient(
      [
        {
          id: "subscription-on-shift",
          user_id: "lucas",
          endpoint: "https://push.example/on-shift",
          p256dh: "p256dh",
          auth: "auth",
        },
        {
          id: "subscription-away",
          user_id: "vinicius",
          endpoint: "https://push.example/away",
          p256dh: "p256dh",
          auth: "auth",
        },
      ] as { user_id: string }[],
      ["lucas"],
    );

    const result = await new WorkspacePushNotifier().notify(
      client as never,
      "workspace-1",
      { title: "New message", body: "Hello" },
    );

    expect(result).toEqual({ sent: 1, configured: true });
    expect(pushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/on-shift" }),
      expect.any(String),
      expect.anything(),
    );
    expect(client.from).toHaveBeenCalledWith("workspace_members");
    expect(client.members.chain.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("sends nothing when everyone is away", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    const client = pushClient(
      [
        {
          id: "subscription-away",
          user_id: "vinicius",
          endpoint: "https://push.example/away",
          p256dh: "p256dh",
          auth: "auth",
        },
      ] as { user_id: string }[],
      [],
    );

    const result = await new WorkspacePushNotifier().notify(
      client as never,
      "workspace-1",
      { title: "New message", body: "Hello" },
    );

    expect(result).toEqual({ sent: 0, configured: true });
    expect(pushMocks.sendNotification).not.toHaveBeenCalled();
  });
});
