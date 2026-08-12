import type { SupabaseClient } from "@supabase/supabase-js";
import type { WhatsAppProvider } from "../../whatsapp-service.js";
import type { MessagingInstance } from "../../whatsmiau.js";

export type AnySupabaseClient = SupabaseClient;

export interface WhatsmiauProviderPort extends WhatsAppProvider {
  createInstance(input: {
    instanceName: string;
    qrcode?: boolean;
    syncFullHistory?: boolean;
    webhookUrl?: string;
    webhookSecret?: string;
  }): Promise<MessagingInstance>;
  configureWebhook?(input: {
    instanceName: string;
    url: string;
    secret: string;
  }): Promise<unknown>;
  connectInstance(
    instanceName: string,
  ): Promise<{ qrcode?: string; pairingCode?: string }>;
  getQrCode(instanceName: string): Promise<Uint8Array | null>;
  getConnectionState(instanceName: string): Promise<{ state: string }>;
  disconnect(instanceName: string): Promise<unknown>;
}
