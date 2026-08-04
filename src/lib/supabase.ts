import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export type MendSupabaseClient = SupabaseClient<Database>;

export interface SupabaseClientConfig {
  url: string;
  key: string;
  persistSession?: boolean;
  autoRefreshToken?: boolean;
  detectSessionInUrl?: boolean;
}

export function createMendSupabaseClient(
  config: SupabaseClientConfig,
): MendSupabaseClient {
  return createClient<Database>(config.url, config.key, {
    auth: {
      persistSession: config.persistSession ?? true,
      autoRefreshToken: config.autoRefreshToken ?? true,
      detectSessionInUrl: config.detectSessionInUrl ?? true,
    },
  });
}

/**
 * Server-side factory for trusted workers/API handlers. Never pass a
 * service-role key to this module from browser code.
 */
export function createMendServerClient(
  url: string,
  serviceRoleKey: string,
): MendSupabaseClient {
  return createMendSupabaseClient({
    url,
    key: serviceRoleKey,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
}

const browserEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;
const browserUrl = browserEnv?.VITE_SUPABASE_URL;
const browserKey = browserEnv?.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(browserUrl && browserKey);

/**
 * Browser client. It stays null for the local demo until the Vite env vars
 * are supplied, so the existing demo remains usable without credentials.
 */
export const supabase: MendSupabaseClient | null = isSupabaseConfigured
  ? createMendSupabaseClient({ url: browserUrl!, key: browserKey! })
  : null;

export function requireSupabase(): MendSupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return supabase;
}
