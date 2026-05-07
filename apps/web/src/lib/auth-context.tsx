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

import {
  getCurrentUser,
  migrateLocalUser,
  signOut as apiSignOut,
  type FamilyUser,
} from "./api";

/**
 * Family-side auth context.
 *
 * Stage C+ architecture: the actual auth credential is the HttpOnly
 * `tb_session` cookie. JS in this file CANNOT see it (HttpOnly), and
 * doesn't need to — every authed call goes through a Next route handler
 * that reads the cookie server-side.
 *
 * What this file owns:
 *   - In-memory `user` state, derived from /api/auth/me on hydration.
 *   - `setUser` for the post-invite-acceptance flow (the route handler
 *     already set the cookie; we just sync state).
 *   - `clearUser` which calls /api/auth/signout to wipe the cookie,
 *     then clears state + name hint.
 *   - One-time migration from legacy localStorage userId → cookie via
 *     /api/auth/migrate. Runs on first hydration only; once successful,
 *     localStorage is cleared and we forget about it.
 *
 * What this file no longer owns:
 *   - The userId. That's now in the cookie, server-readable only.
 *   - Any role-bearing credential.
 *
 * `name` lives in localStorage as a render hint so the dashboard
 * greeting can paint instantly without waiting for /api/auth/me. It's
 * not auth-sensitive — leaking the senior's family member's first name
 * is fine. If localStorage and the cookie disagree (e.g. signed out in
 * another tab, this tab still has the name cached), the next data
 * fetch returns 401, and the UI redirects to /.
 */
const NAME_KEY = "techbuddy.family.name";
// Legacy key the auth context used pre-Stage-C to hold the userId.
// We read it once on hydration to drive the migrate flow, then delete it.
const LEGACY_USER_ID_KEY = "techbuddy.family.userId";

type AuthContextValue = {
  user: FamilyUser | null;
  /** Persist a newly-signed-in user (after acceptFamilyInvite resolves).
   *  The cookie was set by the /api/family/accept route handler; this
   *  setter just syncs the in-memory state and the name render hint. */
  setUser: (user: FamilyUser) => void;
  /** Wipe the cookie via /api/auth/signout, clear local state. */
  clearUser: () => void;
  /** True once hydration has finished (cookie checked, migration tried). */
  ready: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readNameHint(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(NAME_KEY);
  } catch {
    return null;
  }
}

function writeNameHint(name: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (name) window.localStorage.setItem(NAME_KEY, name);
    else window.localStorage.removeItem(NAME_KEY);
  } catch {
    // localStorage unavailable — UX degrades to a brief "Hi …" flash.
  }
}

function readLegacyUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LEGACY_USER_ID_KEY);
  } catch {
    return null;
  }
}

function clearLegacyUserId(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_USER_ID_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<FamilyUser | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from cookie + localStorage migration on mount.
  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      // Path 1: cookie already set → /api/auth/me returns user.
      try {
        const u = await getCurrentUser();
        if (cancelled) return;
        if (u) {
          setUserState(u);
          writeNameHint(u.name);
          // If a legacy id is also present, the cookie supersedes it. Tidy.
          clearLegacyUserId();
          return;
        }
      } catch {
        // Network or 5xx — fall through to legacy path which has its
        // own failure handling. Worst case: user briefly sees the
        // landing page, refreshes, succeeds.
      }

      // Path 2: no cookie. Maybe we have a legacy localStorage id from
      // pre-Stage-C? Try the migrate flow once.
      const legacyId = readLegacyUserId();
      if (legacyId) {
        const migrated = await migrateLocalUser(legacyId);
        if (cancelled) return;
        if (migrated) {
          setUserState(migrated);
          writeNameHint(migrated.name);
          clearLegacyUserId();
          return;
        }
        // Migration failed — id is stale or user was deleted. Wipe it
        // so we don't keep retrying on every hydration.
        clearLegacyUserId();
        writeNameHint(null);
      }

      // Path 3: not signed in. State stays null; the page-level
      // useEffect on each protected page redirects to /.
    }

    hydrate()
      .catch(() => {
        // Defensive — shouldn't happen since we catch inside hydrate.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((u: FamilyUser) => {
    setUserState(u);
    writeNameHint(u.name);
  }, []);

  const clearUser = useCallback(() => {
    setUserState(null);
    writeNameHint(null);
    void apiSignOut();
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
