/**
 * Render an API error in the form the family portal shows to users.
 *
 * Why this exists: api.ts's `jsonOrThrow` throws Errors prefixed with
 * `Request failed (404):` which is dev-friendly but ugly for end-users.
 * Three pages were each running their own regex to trim that prefix.
 * Centralizing here means consistent display + a single place to evolve
 * the format (e.g. eventually mapping HTTP status codes to friendlier
 * sentences instead of just stripping the prefix).
 */
export function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Something went wrong.";
  return raw.replace(/^Request failed \(\d+\):\s*/, "");
}
