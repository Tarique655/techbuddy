/**
 * Typed client for the family portal.
 *
 * Stage C+ architecture (see JWT_MIGRATION_PLAN.md §3.3):
 *
 *   - Every authenticated call goes to a Next.js route handler at
 *     `/api/...` on the Vercel origin (NOT to the Fastify API directly).
 *   - The route handler reads the `tb_session` HttpOnly cookie, pulls
 *     the JWT, forwards it as `Authorization: Bearer` to Fastify.
 *   - The cookie is first-party to Vercel; the JWT never enters the
 *     browser's JS context. There's no `X-User-Id`, no localStorage
 *     bearer, no API key in any client-side code.
 *
 * The client just calls `fetch('/api/...')` with `credentials: 'include'`
 * (the default for same-origin) and the cookie travels automatically.
 *
 * Wire types (DeviceKey, SessionStatus, IssueSummary, etc.) come from
 * @techbuddy/shared so the family portal and the mobile app can't drift
 * apart on the same DTOs.
 */
import type {
  DeviceKey,
  IssueSummary,
  RecommendedRoute,
  SessionStatus,
  Urgency,
} from "@techbuddy/shared";

export type { DeviceKey, IssueSummary, RecommendedRoute, SessionStatus, Urgency };

async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let parsed: { error?: string; message?: string } | null = null;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      // ignore
    }
    const detail = parsed?.message ?? parsed?.error ?? body ?? "no body";
    throw new Error(`Request failed (${response.status}): ${detail}`);
  }
  return (await response.json()) as T;
}

// ============================================================================
// Auth
// ============================================================================

export type FamilyUser = {
  id: string;
  name: string;
  role: "family";
};

export type AcceptInviteResponse = {
  user: FamilyUser;
  link: { id: string; seniorUserId: string };
};

/**
 * Submit the invite code + name + optional label to /api/family/accept.
 * The Next route handler creates the family user via the Fastify API
 * and sets the `tb_session` cookie before returning. The browser
 * automatically attaches the new cookie to subsequent calls.
 *
 * Returns the user (no token — the client never sees the JWT).
 */
export async function acceptFamilyInvite(input: {
  code: string;
  name: string;
  label?: string;
}): Promise<AcceptInviteResponse> {
  const response = await fetch(`/api/family/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<AcceptInviteResponse>(response);
}

/**
 * Read the currently signed-in user, or null if not signed in.
 * Used by the auth context's hydration pass — replaces the old
 * localStorage read with a roundtrip that confirms the cookie's
 * still valid (signature + tokenVersion + user existence).
 */
export async function getCurrentUser(): Promise<FamilyUser | null> {
  const response = await fetch(`/api/auth/me`, { method: "GET" });
  if (response.status === 401) return null;
  if (!response.ok) {
    // 5xx etc — surface as an error so the caller can show a banner.
    const body = await response.text().catch(() => "");
    throw new Error(`Get user failed (${response.status}): ${body || "no body"}`);
  }
  const data = (await response.json()) as { user: FamilyUser };
  return data.user;
}

/**
 * Migration helper: convert a legacy localStorage userId into a
 * `tb_session` cookie via /api/auth/migrate. Called once on hydration
 * if we detect a legacy id but no cookie. Returns the user on success,
 * null on failure (which means: no cookie was set, the legacy id is
 * stale, the auth context should clear local state and route to /).
 */
export async function migrateLocalUser(
  userId: string
): Promise<FamilyUser | null> {
  const response = await fetch(`/api/auth/migrate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { user: FamilyUser };
  return data.user;
}

/**
 * Clear the `tb_session` cookie. The cookie is HttpOnly so the browser
 * can't clear it directly — we POST to a route handler that writes a
 * Set-Cookie with maxAge=0.
 */
export async function signOut(): Promise<void> {
  await fetch(`/api/auth/signout`, { method: "POST" }).catch(() => {
    // Best-effort. If the network is down, the cookie persists on the
    // server, but the auth context has already wiped local state — so
    // the user is signed out from THIS browser tab regardless. They
    // could be re-signed-in if they refresh before the network recovers,
    // but that's a tiny edge case and the next /api/auth/me call would
    // succeed and re-hydrate them.
  });
}

// ============================================================================
// Linked seniors
// ============================================================================

export type LinkedSenior = {
  seniorUserId: string;
  name: string;
  label: string | null;
  linkedAt: string;
  lastSession: {
    id: string;
    device: DeviceKey | null;
    status: SessionStatus;
    startedAt: string;
  } | null;
};

export async function listLinkedSeniors(): Promise<LinkedSenior[]> {
  const response = await fetch(`/api/family/seniors`, { method: "GET" });
  const data = await jsonOrThrow<{ seniors: LinkedSenior[] }>(response);
  return data.seniors;
}

// ============================================================================
// Senior session list (with summaries)
// ============================================================================

export type SeniorSession = {
  id: string;
  device: DeviceKey | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  summary: IssueSummary | null;
};

export async function listSeniorSessions(
  seniorUserId: string
): Promise<SeniorSession[]> {
  const response = await fetch(
    `/api/family/seniors/${encodeURIComponent(seniorUserId)}/sessions`,
    { method: "GET" }
  );
  const data = await jsonOrThrow<{ sessions: SeniorSession[] }>(response);
  return data.sessions;
}
