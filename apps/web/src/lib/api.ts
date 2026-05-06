/**
 * Typed client for the TechBuddy backend, family-portal flavor.
 *
 * Calls the same Fastify API the mobile app uses (NEXT_PUBLIC_API_URL).
 * Auth model mirrors the mobile side: a family User id stored in
 * localStorage and forwarded as the X-User-Id header on every request.
 *
 * Server actions are deliberately NOT used here — keeping all calls on the
 * client lets us share the auth token easily and keeps the backend the
 * single source of truth (no proxy through Next).
 *
 * Wire types (DeviceKey, SessionStatus, Urgency, RecommendedRoute,
 * IssueSummary, ...) come from @techbuddy/shared so the family portal
 * and the mobile app can't drift apart on the same DTOs.
 */
import type {
  DeviceKey,
  IssueSummary,
  RecommendedRoute,
  SessionStatus,
  Urgency,
} from "@techbuddy/shared";

export type { DeviceKey, IssueSummary, RecommendedRoute, SessionStatus, Urgency };

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const STORAGE_KEY = "techbuddy.family.userId";

function getStoredUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const id = getStoredUserId();
  return id ? { "X-User-Id": id } : {};
}

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

export async function acceptFamilyInvite(input: {
  code: string;
  name: string;
  label?: string;
}): Promise<AcceptInviteResponse> {
  const response = await fetch(`${API_URL}/v1/family/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return jsonOrThrow<AcceptInviteResponse>(response);
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
  const response = await fetch(`${API_URL}/v1/family/seniors`, {
    headers: authHeaders(),
  });
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
    `${API_URL}/v1/family/seniors/${encodeURIComponent(seniorUserId)}/sessions`,
    {
      headers: authHeaders(),
    }
  );
  const data = await jsonOrThrow<{ sessions: SeniorSession[] }>(response);
  return data.sessions;
}

export { API_URL };
