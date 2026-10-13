import type { Database } from "../lib/database.types";
import type { MendSupabaseClient } from "../lib/supabase";
import { mendApiBaseUrl } from "./live-actions";

type Tables = Database["public"]["Tables"];
export type WorkspaceNotification = Tables["notifications"]["Row"];

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
}

export type PushSetupResult =
  | "enabled"
  | "unsupported"
  | "requires-install"
  | "unavailable"
  | "denied";

async function unwrap<T>(
  request: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data");
  return data;
}

export function listWorkspaceNotifications(
  client: MendSupabaseClient,
  workspaceId: string,
  limit = 50,
): Promise<WorkspaceNotification[]> {
  return unwrap(
    client
      .from("notifications")
      .select("*")
      .eq("workspace_id", workspaceId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
}

export async function dismissWorkspaceNotification(
  client: MendSupabaseClient,
  workspaceId: string,
  notificationId: string,
): Promise<void> {
  const { error } = await client
    .from("notifications")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", notificationId);
  if (error) throw new Error(error.message);
}

export async function dismissWorkspaceNotifications(
  client: MendSupabaseClient,
  workspaceId: string,
): Promise<void> {
  const { error } = await client
    .from("notifications")
    .delete()
    .eq("workspace_id", workspaceId)
    .is("read_at", null);
  if (error) throw new Error(error.message);
}

export async function getPushConfig(): Promise<PushConfig> {
  const response = await fetch(`${mendApiBaseUrl}/api/push/config`);
  if (!response.ok)
    throw new Error(`Push config request failed (${response.status})`);
  const payload = (await response.json()) as Partial<PushConfig>;
  return {
    enabled: payload.enabled === true && typeof payload.publicKey === "string",
    publicKey: typeof payload.publicKey === "string" ? payload.publicKey : null,
  };
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isIosDevice(): boolean {
  const platform = navigator.platform ?? "";
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function enableNativePush(
  client: MendSupabaseClient,
  workspaceId: string,
): Promise<PushSetupResult> {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    !("serviceWorker" in navigator)
  )
    return "unsupported";
  // iOS only exposes Web Push to a Home Screen web app (iOS 16.4+).
  if (isIosDevice() && !isStandaloneDisplay()) return "requires-install";
  if (!("PushManager" in window) || !("Notification" in window))
    return "unsupported";

  // WebKit only honors the permission prompt inside the user gesture, so ask
  // before any await (such as the config fetch) can consume the activation.
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";

  const config = await getPushConfig();
  if (!config.enabled || !config.publicKey) return "unavailable";

  await navigator.serviceWorker.register("/push-sw.js");
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(config.publicKey),
    }));
  const json = subscription.toJSON();
  const keys = json.keys;
  if (!json.endpoint || !keys?.p256dh || !keys.auth)
    throw new Error("The browser returned an incomplete push subscription.");
  const user = await client.auth.getUser();
  if (!user.data.user) throw new Error("A signed-in user is required.");
  const { error } = await client.from("push_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      user_id: user.data.user.id,
      endpoint: json.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent.slice(0, 500),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,user_id,endpoint" },
  );
  if (error) throw new Error(error.message);
  return "enabled";
}
