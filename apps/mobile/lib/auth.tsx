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

import { setApiUserId } from "./api";

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
  /** True after AsyncStorage hydration completes. Wait for this before routing. */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from disk on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (isAuthUser(parsed)) {
            setUserState(parsed);
          }
        } catch {
          /* corrupt storage — fall back to no user */
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // Keep the api module's user id in sync so all fetches send the right
  // X-User-Id header. Call on every user change, including hydration.
  useEffect(() => {
    setApiUserId(user?.id ?? null);
  }, [user]);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (next) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    } else {
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    }
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
