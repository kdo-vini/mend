import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.js";

export type MendServerSupabaseClient = SupabaseClient<Database>;

function config() {
  return {
    // Never let a browser VITE_* key silently become the credential for a
    // trusted worker. Configure server access explicitly.
    url: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function createServerSupabaseClient(
  accessToken?: string,
): MendServerSupabaseClient | null {
  const values = config();
  const key = values.serviceRoleKey ?? values.publishableKey;
  if (!values.url || !key) return null;
  return createClient<Database>(values.url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    ...(accessToken
      ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      : {}),
  });
}

export function hasServerSupabaseConfig(): boolean {
  return Boolean(
    config().url && (config().serviceRoleKey || config().publishableKey),
  );
}
