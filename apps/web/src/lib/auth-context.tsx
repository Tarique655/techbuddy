"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { STORAGE_KEY, type FamilyUser } from "./api";

/**
 * Family-side auth context. We persist a tiny `{id, name}` blob in
 * localStorage — the X-User-Id header is the actual auth token, and
 * the name is just for the dashboard greeting. There's no logout
 * concept yet; "log out" is `clearUser()` which wipes localStorage.
 */
const NAME_KEY = "techbuddy.family.name";

type AuthContextValue = {
  user: FamilyUser | null;
  /** Persist a logged-in user (called after acceptFamilyInvite resolves). */
  setUser: (user: FamilyUser) => void;
  /** Wipe the stored auth, returning the app to the landing page. */
  clearUser: () => void;
  /** True until we've checked localStorage at least once. */
  ready: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<FamilyUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount. Runs client-side only — Next's
  // SSR pass returns ready=false on the initial paint, then this effect
  // fires after hydration and flips it true.
  useEffect(() => {
    try {
      const id = window.localStorage.getItem(STORAGE_KEY);
      const name = window.localStorage.getItem(NAME_KEY);
      if (id && name) {
        setUserState({ id, name, role: "family" });
      }
    } catch {
      // localStorage blocked or unavailable — log them out gracefully.
    }
    setReady(true);
  }, []);

  const setUser = useCallback((u: FamilyUser) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, u.id);
      window.localStorage.setItem(NAME_KEY, u.name);
    } catch {
      // ignore — we still set in-memory so navigation works this session
    }
    setUserState(u);
  }, []);

  const clearUser = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(NAME_KEY);
    } catch {
      // ignore
    }
    setUserState(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, setUser, clearUser, ready }),
    [user, setUser, clearUser, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
