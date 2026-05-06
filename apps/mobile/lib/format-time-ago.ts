import type { Language, StringKey } from "./i18n";

/**
 * Render a friendly relative time string for the senior, using their
 * chosen language's i18n keys for the words and the right locale for
 * the absolute-date fallback when the gap is older than a week.
 *
 * Why this exists in lib/: the same logic was previously duplicated
 * across history.tsx and settings.tsx with comments admitting "kept in
 * sync by hand". One source of truth here means a tweak to one window
 * (e.g. "say 'a moment ago' for <2 min instead of <1 min") rolls out
 * everywhere consistently.
 *
 * Inputs:
 *   - iso: ISO timestamp from the API
 *   - t: i18n translator function (caller passes the one from useT())
 *   - language: senior's chosen language, used for the date locale
 *   - now: testing seam; defaults to real `new Date()`
 *
 * Output: a localized, human-friendly string like "5 minutes ago",
 * "yesterday", or "Mar 14".
 */
export function formatTimeAgo(
  iso: string,
  t: (key: StringKey, vars?: Record<string, string | number>) => string,
  language: Language,
  now: Date = new Date()
): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 2) return t("time_now");
  if (minutes < 60) return t("time_minutes_ago", { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? t("time_hour_ago") : t("time_hours_ago", { n: hours });
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return t("time_yesterday");
  if (days < 7) return t("time_days_ago", { n: days });
  // Pick a locale for the absolute-date formatter that matches the
  // senior's chosen language. `undefined` falls back to the system
  // locale, which is right for English (we don't want to override
  // en-GB → en-US for users on UK iPhones).
  const dateLocale =
    language === "fr" ? "fr-CA" : language === "es" ? "es-ES" : undefined;
  return then.toLocaleDateString(dateLocale, {
    month: "short",
    day: "numeric",
  });
}
