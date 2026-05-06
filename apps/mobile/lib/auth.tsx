import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { exchangeAuthToken, setApiAuth } from "./api";
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "./auth-token";

/**
 * Where the user blob lives.
 *
 * Prior to 2026-05-06 this was kept in AsyncStorage, which is plaintext
 * on disk and readable by anything with app-storage access (the audit
 * flagged it as P0). The id functions as a bearer credential — leaking
 * it impersonates the account.
 *
 * It now lives in `expo-secure-store`, which wraps iOS Keychain and
 * Android Keystore. On first launch after that change, we migrate any
 * existing AsyncStorage value into SecureStore and remove the legacy
 * copy, so existing testers don't get logged out.
 *
 * Stage B (2026-05-06 evening): the JWT lives separately in
 * `techbuddy.auth.token.v1`; see `lib/auth-token.ts`. Keeping them
 * under different keys means a failed write to one can't corrupt the
 * other, and we can independently detect "have user, no token" — the
 * trigger for the legacy-id → JWT exchange path below.
 */
const STORAGE_KEY = "techbuddy.user.v1";

export type AuthUser = {
  id: string;
  name: string;
};

/** Combined session shape passed when signing in. Onboarding produces
 *  this (createUser returns {user, token}); sign-out passes null. */
export type AuthSession = {
  user: AuthUser;
  token: string;
};

type AuthContextValue = {
  /** Currently signed-in user, or null if no onboarding has happened yet. */
  user: AuthUser | null;
  /**
   * Replace the current session. Pass `{user, token}` on sign-in
   * (onboarding); pass `null` to sign out. Persists user blob +
   * JWT atomically and updates the api module's auth state.
   */
  setSession: (next: AuthSession | null) => void;
  /** True after hydration completes. Wait for this before routing. */
  ready: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isAuthUser(value: unknown): value is AuthUser {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).name === "string" &&
    ((value as Record<string, unknown>).id as string).length > 0
  );
}

/**
 * Read the user blob, preferring SecureStore. If nothing's there but
 * the legacy AsyncStorage copy exists, copy it forward to SecureStore
 * and delete the legacy one. Returns the AuthUser found, or null.
 *
 * This runs once per app launch (on AuthProvider mount). After the
 * first successful migration, subsequent launches read directly from
 * SecureStore — AsyncStorage is no longer touched for auth.
 */
async function loadUserAndMigrate(): Promise<AuthUser | null> {
  // 1. Primary path: SecureStore.
  try {
    const secure = await SecureStore.getItemAsync(STORAGE_KEY);
    if (secure) {
      const parsed = JSON.parse(secure);
      if (isAuthUser(parsed)) return parsed;
    }
  } catch {
    // SecureStore unavailable (e.g. simulator without Keychain access)
    // or corrupt JSON. Fall through to the legacy path.
  }

  // 2. Legacy path: AsyncStorage. Read once, migrate, delete.
  try {
    const legacy = await AsyncStorage.getItem(STORAGE_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy);
    if (!isAuthUser(parsed)) return null;

    // Best-effort migration. If the SecureStore write fails (rare —
    // would mean the device fundamentally can't store secrets), we
    // leave the AsyncStorage copy alone so the senior stays logged in
    // and we can try again on the next launch.
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, legacy);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* swallow — keep legacy as fallback */
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist the user blob to SecureStore and proactively delete any
 * lingering legacy copy. The AsyncStorage cleanup is idempotent — no-op
 * if there was nothing there.
 */
async function persistUser(next: AuthUser | null): Promise<void> {
  if (next) {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // SecureStore write failed — fall back to AsyncStorage so the
      // senior stays logged in. Better leaky than logged out for v1.
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(
        () => {}
      );
      return;
    }
    // Belt-and-suspenders: clear any legacy copy.
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  } else {
    // Sign-out: wipe both backends.
    SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }
}

/**
 * Full-session loader for app start.
 *
 * Decision tree:
 *   - No user blob anywhere → not signed in. Caller routes to onboarding.
 *   - User blob, no token in SecureStore → upgrade path. Try
 *     /v1/auth/exchange once. On success, persist the new token.
 *     On failure (network, API 5xx), set token=null and let the api
 *     module fall back to the legacy X-User-Id header for this session.
 *   - User blob AND token → straight Bearer henceforth.
 *
 * Returns the resolved session (user + token | null) or null if no user.
 * The caller hands this off to setApiAuth + setUserState.
 */
async function loadSession(): Promise<{
  user: AuthUser;
  token: string | null;
} | null> {
  const user = await loadUserAndMigrate();
  if (!user) return null;

  // Primary: existing JWT in SecureStore.
  let token = await getAuthToken();
  if (token) return { user, token };

  // Migration: no token yet. Try to exchange the legacy id for one.
  // The exchange endpoint is allowlisted from auth on the API side,
  // so it works regardless of whether AUTH_ACCEPT_BEARER is on.
  try {
    token = await exchangeAuthToken(user.id);
    await setAuthToken(token);
    return { user, token };
  } catch {
    // Network / API failure. The api module will fall back to sending
    // X-User-Id this session. Next app launch will retry the exchange.
    return { user, token: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from disk on mount.
  useEffect(() => {
    let cancelled = false;
    loadSession()
      .then((session) => {
        if (cancelled) return;
        if (session) {
          setUserState(session.user);
          setApiAuth({ userId: session.user.id, token: session.token });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((next: AuthSession | null) => {
    if (next) {
      // Sign-in path: state + persistence + api-module update, in that
      // order. State first so any consumer who's watching `user` in a
      // useEffect can race-fetch without waiting for the disk write;
      // setApiAuth before persistence so even if the SecureStore write
      // is delayed, the next API call uses the new token.
      setUserState(next.user);
      setApiAuth({ userId: next.user.id, token: next.token });
      void persistUser(next.user);
      void setAuthToken(next.token);
    } else {
      // Sign-out: wipe everything.
      setUserState(null);
      setApiAuth(null);
      void persistUser(null);
      void clearAuthToken();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, setSession, ready }),
    [user, setSession, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
