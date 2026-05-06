/**
 * SecureStore wrapper for the JWT specifically.
 *
 * The auth flow has TWO things in SecureStore:
 *
 *   - The user blob (`techbuddy.user.v1`) — `{id, name}`. Lives in
 *     lib/auth.tsx, which also handles the AsyncStorage → SecureStore
 *     migration that shipped 2026-05-06.
 *   - The auth JWT (`techbuddy.auth.token.v1`) — this file. Stage B
 *     introduces it; older builds didn't store one.
 *
 * They're kept under DIFFERENT keys (rather than co-located in a single
 * blob) so that:
 *   1. A failed write to one can't corrupt the other.
 *   2. The auth.tsx hydration logic can independently detect "have user,
 *      no token yet" — that's the trigger for the one-time
 *      legacy-id → JWT exchange.
 *   3. Sign-out can clear them in either order without intermediate
 *      "I have a token but no user" confusion.
 *
 * All exports are async + best-effort. SecureStore writes can fail on
 * jailbroken devices, devices with no passcode set, or simulator quirks
 * — none of those should crash the app. Callers treat absence/failure
 * the same as "no token yet" and fall back to the legacy header path.
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "techbuddy.auth.token.v1";

/**
 * Read the persisted JWT, or null if none stored. Treats any SecureStore
 * error as "no token" — see the file-level comment for why.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const stored = await SecureStore.getItemAsync(TOKEN_KEY);
    return stored && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Persist a JWT. Returns true on success. Failure is silent (returns
 * false) so callers can decide whether to retry — typically they don't,
 * because the legacy-fallback path keeps the user logged in even
 * without a persisted token.
 */
export async function setAuthToken(token: string): Promise<boolean> {
  if (!token || token.length === 0) return false;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Wipe the persisted JWT. Idempotent — no-op if nothing was stored. */
export async function clearAuthToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* swallow — nothing to recover, sign-out continues */
  }
}
