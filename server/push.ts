import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";
import type { Database } from "../src/lib/database.types.js";

type PushClient = SupabaseClient<Database>;

type PushSubscriptionRow = Pick<
  Database["public"]["Tables"]["push_subscriptions"]["Row"],
  "id" | "endpoint" | "p256dh" | "auth"
>;

export interface WorkspacePushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  notificationId?: string;
}

function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@techneia.com.br";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export function getVapidPublicKey(): string | null {
  return pushConfig()?.publicKey ?? null;
}

export class WorkspacePushNotifier {
  private configured = false;

  async notify(
    client: PushClient,
    workspaceId: string,
    payload: WorkspacePushPayload,
  ): Promise<{ sent: number; configured: boolean }> {
    const config = pushConfig();
    if (!config) return { sent: 0, configured: false };
    if (!this.configured) {
      webpush.setVapidDetails(
        config.subject,
        config.publicKey,
        config.privateKey,
      );
      this.configured = true;
    }

    const result = await client
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("workspace_id", workspaceId);
    if (result.error)
      throw new Error(`supabase:push_subscriptions:${result.error.message}`);

    const subscriptions = (result.data ?? []) as PushSubscriptionRow[];
    const settled = await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            JSON.stringify({
              title: payload.title,
              body: payload.body,
              url: payload.url ?? "/inbox",
              tag: payload.tag ?? "mend-workspace-notification",
              notificationId: payload.notificationId,
            }),
            { TTL: 300 },
          );
          return true;
        } catch (error) {
          const statusCode =
            typeof error === "object" && error !== null && "statusCode" in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) {
            const deleted = await client
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id)
              .eq("workspace_id", workspaceId);
            if (deleted.error)
              throw new Error(
                `supabase:push_subscriptions:delete:${deleted.error.message}`,
              );
            return false;
          }
          throw error;
        }
      }),
    );
    return {
      sent: settled.filter(
        (item) => item.status === "fulfilled" && item.value === true,
      ).length,
      configured: true,
    };
  }
}
