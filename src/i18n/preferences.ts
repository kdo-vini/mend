import type { SupabaseClient } from "@supabase/supabase-js";
import i18n from "./index";
import { normalizeLocale, type SupportedLocale } from "./resources";
import type { Database } from "../lib/database.types";

type Client = SupabaseClient<Database>;

export const interfaceLanguageStorageKey = "mend.interface-language";

export function storedInterfaceLanguage(): SupportedLocale {
  if (typeof window === "undefined") return "pt-BR";
  return normalizeLocale(
    window.localStorage.getItem(interfaceLanguageStorageKey),
  );
}

export async function applyInterfaceLanguage(
  locale: SupportedLocale,
): Promise<void> {
  if (currentInterfaceLanguage() !== locale) await i18n.changeLanguage(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined")
    window.localStorage.setItem(interfaceLanguageStorageKey, locale);
}

export function currentInterfaceLanguage(): SupportedLocale {
  return normalizeLocale(i18n.language);
}

export function resolvePreferredLocale(
  persisted?: unknown,
  localChoice?: unknown,
): SupportedLocale {
  if (persisted) return normalizeLocale(persisted);
  if (localChoice) return normalizeLocale(localChoice);
  return "pt-BR";
}

export async function resolveInterfaceLanguage(
  client: Client,
  cached = storedInterfaceLanguage(),
): Promise<SupportedLocale> {
  const userResult = await client.auth.getUser();
  const user = userResult.data.user;
  if (!user) {
    await applyInterfaceLanguage(cached);
    return cached;
  }

  const preference = await client
    .from("user_preferences")
    .select("interface_language")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!preference.error && preference.data) {
    const locale = normalizeLocale(preference.data.interface_language);
    await applyInterfaceLanguage(locale);
    return locale;
  }

  const locale = resolvePreferredLocale(undefined, cached);

  await client.from("user_preferences").upsert(
    {
      user_id: user.id,
      interface_language: locale,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  await applyInterfaceLanguage(locale);
  return locale;
}

export async function saveInterfaceLanguage(
  client: Client,
  locale: SupportedLocale,
): Promise<void> {
  const userResult = await client.auth.getUser();
  if (!userResult.data.user) throw new Error("unauthenticated");
  const result = await client.from("user_preferences").upsert(
    {
      user_id: userResult.data.user.id,
      interface_language: locale,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (result.error) throw new Error(result.error.message);
  await applyInterfaceLanguage(locale);
}
