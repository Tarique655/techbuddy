/**
 * Sanitize an unknown thrown value into a string suitable for logging.
 *
 * Why this exists:
 *   - `console.error("[label]", err)` with a full error object is auto-
 *     captured by Sentry's React Native SDK as a breadcrumb. The err's
 *     `message` field can contain echoed-back user input (e.g. "Bad
 *     Request: <body>") and its other fields can leak stack traces with
 *     function args. We don't want any of that in Sentry.
 *   - Senior-facing app + privacy-first defaults (sendDefaultPii: false
 *     in _layout.tsx) — keep breadcrumbs to opaque, bounded strings.
 *
 * Use it like: `console.error("[chat] send failed", safeErrorMessage(err))`.
 *
 * Returns at most MAX_LEN characters of the error's message — long
 * messages get truncated with an ellipsis, never persisted in full.
 */
const MAX_LEN = 200;

export function safeErrorMessage(err: unknown): string {
  let raw: string;
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "string") {
    raw = err;
  } else {
    raw = "non-error thrown";
  }
  // Strip newlines so multi-line messages don't fool Sentry into showing
  // partial content as separate breadcrumbs.
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_LEN) return oneLine;
  return `${oneLine.slice(0, MAX_LEN - 1)}…`;
}
