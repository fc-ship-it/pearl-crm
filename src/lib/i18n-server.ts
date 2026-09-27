// Server-only helper split out from src/lib/i18n.ts. That file is imported
// by client components (<AppShell>, <LanguageSwitcher>) for the Locale type
// and translator(); this one pulls in src/lib/data.ts (and through it, the
// `pg` DB driver), which must never end up in a browser bundle. Server pages
// (Dashboard, Statistics, app/layout.tsx) import resolveUserLocale from
// here, not from "@/lib/i18n".
import { getUserPreferences } from "@/lib/data";
import { isLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/** Server pages already call getSession() for orgId/role — this takes that
 * same userId and resolves their saved language preference, defaulting to
 * English for a user who never picked one. */
export async function resolveUserLocale(userId: string): Promise<Locale> {
  const prefs = await getUserPreferences(userId);
  return isLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE;
}
