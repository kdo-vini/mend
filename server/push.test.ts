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

function pushClient(rows: unknown[]) {
  const select = {
    eq: vi.fn(async () => ({ data: rows, error: null })),
  };
  const remove = {
    eq: vi.fn(() => remove),
    then: (resolve: (value: { error: null }) => unknown) =>
      Promise.resolve(resolve({ error: null })),
  };
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => select),
      delete: vi.fn(() => remove),
    })),
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

  it("localizes known notification kinds per recipient preference", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    pushMocks.sendNotification.mockResolvedValue({});
    const subscriptions = {
      eq: vi.fn(async () => ({
        data: [
          {
            id: "subscription-pt",
            user_id: "user-pt",
            endpoint: "https://push.example/pt",
            p256dh: "p256dh",
            auth: "auth",
          },
        ],
        error: null,
      })),
    };
    const preferences = {
      eq: vi.fn(() => preferences),
      maybeSingle: vi.fn(async () => ({
        data: { interface_language: "pt-BR" },
        error: null,
      })),
    };
    const client = {
      from: vi.fn((table: string) =>
        table === "push_subscriptions"
          ? { select: vi.fn(() => subscriptions) }
          : { select: vi.fn(() => preferences) },
      ),
    };

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
  });

  it("uses English when the recipient explicitly selected English", async () => {
    process.env.VAPID_PUBLIC_KEY = "public";
    process.env.VAPID_PRIVATE_KEY = "private";
    pushMocks.sendNotification.mockResolvedValue({});
    const subscriptions = {
      eq: vi.fn(async () => ({
        data: [
          {
            id: "subscription-en",
            user_id: "user-en",
            endpoint: "https://push.example/en",
            p256dh: "p256dh",
            auth: "auth",
          },
        ],
        error: null,
      })),
    };
    const preferences = {
      eq: vi.fn(() => preferences),
      maybeSingle: vi.fn(async () => ({
        data: { interface_language: "en-US" },
        error: null,
      })),
    };
    const client = {
      from: vi.fn((table: string) =>
        table === "push_subscriptions"
          ? { select: vi.fn(() => subscriptions) }
          : { select: vi.fn(() => preferences) },
      ),
    };

    await new WorkspacePushNotifier().notify(client as never, "workspace-1", {
      title: "New WhatsApp message",
      body: "A conversation assigned to you needs attention.",
      kind: "conversation_message",
    });

    expect(pushMocks.sendNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("New WhatsApp message"),
      expect.anything(),
    );
  });
});
