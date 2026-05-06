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

import { setApiUserId } from "./api";

/**
 * Where the user blob lives.
 *
 * Prior to 2026-05-06 this was kept in AsyncStorage, which is plaintext
 * on disk and readable by anything with app-storage access (the audit
 * flagged it as P0). The id functions as a bearer credential — leaking
 * it impersonates the account.
 *
 * It now lives in `expo-secure-store`, which wraps iOS Keychain and
 * Android Keystore. On first launch after this change, we migrate any
 * existing AsyncStorage value into SecureStore and remove the legacy
 * copy, so existing testers don't get logged out.
 */
const STORAGE_KEY = "techbuddy.user.v1";

export type AuthUser = {
  id: string;
  name: string;
};

type AuthContextValue = {
  /** Currently signed-in user, or null if no onboarding has happened yet. */
  user: AuthUser | null;
  /** Replace the current user (used during onboarding and sign-out). */
  setUser: (next: AuthUser | null) => void;
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
async function loadAndMigrate(): Promise<AuthUser | null> {
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from disk on mount.
  useEffect(() => {
    let cancelled = false;
    loadAndMigrate()
      .then((u) => {
        if (cancelled) return;
        if (u) setUserState(u);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the api module's user id in sync so all fetches send the right
  // X-User-Id header. Call on every user change, including hydration.
  useEffect(() => {
    setApiUserId(user?.id ?? null);
  }, [user]);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    void persistUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, setUser, ready }),
    [user, setUser, ready]
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
