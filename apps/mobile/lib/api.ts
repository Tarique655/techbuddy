/**
 * Typed client for the TechBuddy backend.
 *
 * The base URL comes from EXPO_PUBLIC_API_URL in apps/mobile/.env.
 * Anything prefixed EXPO_PUBLIC_ is bundled into the JS that ships to the
 * device — safe for non-secret config like the API hostname.
 *
 * In dev, this points at the dev machine's LAN IP (e.g. http://192.168.1.50:4000)
 * so the senior's phone can reach the backend over Wi-Fi.
 *
 * Wire types (DeviceKey, SessionStatus, ImageInput, IssueSummary, ...)
 * live in @techbuddy/shared so this app and the family portal can't
 * drift apart. Anything mobile-only (mobile API request shapes, local
 * UI types) stays in this file.
 *
 * Auth model (Stage B+):
 *   - Authorization: Bearer <jwt> is the preferred header. Issued by the
 *     API at onboarding (`POST /v1/users` returns `{user, token}`) and at
 *     legacy-id upgrade (`POST /v1/auth/exchange`).
 *   - X-User-Id is the legacy fallback. The API still accepts it while
 *     AUTH_ACCEPT_BEARER is on (Stage A multi-mode); we keep sending it
 *     when no JWT is available, so a hydration where SecureStore lost
 *     the token doesn't lock the senior out.
 *   - Sliding renewal: if the API is going to renew our token, it rides
 *     the response back as the X-Renewed-Token header. The fetch wrapper
 *     catches it and persists the new token to SecureStore.
 */
import type {
  DeviceKey,
  ImageInput,
  MessageRole,
  SessionStatus,
} from "@techbuddy/shared";

import { setAuthToken } from "./auth-token";

export type { DeviceKey, ImageInput, MessageRole, SessionStatus };

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// =============================================================================
// Auth state (module-local, set by AuthProvider)
// =============================================================================
//
// AuthProvider calls setApiAuth() whenever the senior's session changes
// (hydration, onboarding completion, sign-out). We stash it module-locally
// so authedFetch can synchronously inject the right header on every call.
//
// Token may be null even when userId is set — happens when SecureStore
// lost the JWT, or when /v1/auth/exchange failed during hydration. In
// that case we fall back to the legacy X-User-Id header.

interface ApiAuth {
  userId: string;
  /** Null = no JWT yet; the legacy X-User-Id path will be used. */
  token: string | null;
}

let _currentAuth: ApiAuth | null = null;

export function setApiAuth(next: ApiAuth | null): void {
  _currentAuth = next;
}

/** Construct the auth header pair for a request. Bearer wins if available. */
function authHeaders(): Record<string, string> {
  if (!_currentAuth) return {};
  if (_currentAuth.token) {
    return { Authorization: `Bearer ${_currentAuth.token}` };
  }
  return { "X-User-Id": _currentAuth.userId };
}

// =============================================================================
// 401 recovery
// =============================================================================
//
// If the API rejects our token (e.g. JWT_SECRET was rotated server-side, or
// the user's tokenVersion was bumped to revoke), we get a single chance to
// re-exchange our legacy userId for a fresh JWT and retry the request. The
// senior never sees the failure.
//
// Single-flight: when N parallel requests all 401 at the same time (typical
// app-foregrounding burst), only one exchange call goes out. The others
// await the same promise and retry with whatever it produced.
//
// What this does NOT cover:
//   - True sign-out-everywhere via tokenVersion bump: auto-re-exchange
//     mints a new token carrying the bumped tv, so the user stays signed
//     in. Real revocation needs an additional "exchange disabled" flag
//     on the user row, which is out of scope for Stage B.
//   - A leaked-but-still-valid JWT_SECRET on the server: client-side
//     recovery only fires on 401, so a still-trusted leaked secret
//     doesn't trigger anything. Fix is to rotate the secret server-side.

let _pendingExchange: Promise<string | null> | null = null;

/**
 * Re-exchange the current legacy userId for a fresh JWT, with single-flight
 * deduplication. Returns the new token string, or null if the exchange
 * itself failed (network, user genuinely deleted, etc.).
 *
 * On success: also updates `_currentAuth.token` synchronously and
 * fire-and-forgets the SecureStore write — same guarantees as the
 * sliding-renewal path.
 */
async function refreshTokenSingleFlight(
  userId: string
): Promise<string | null> {
  if (_pendingExchange) return _pendingExchange;
  _pendingExchange = (async () => {
    try {
      const fresh = await exchangeAuthToken(userId);
      _currentAuth = { userId, token: fresh };
      void setAuthToken(fresh);
      return fresh;
    } catch {
      // Exchange failed. Caller (authedFetch) returns the original 401.
      // Common reasons: network down, API 5xx, user truly deleted.
      return null;
    } finally {
      _pendingExchange = null;
    }
  })();
  return _pendingExchange;
}

/**
 * Apply any X-Renewed-Token header on a response. Shared between the
 * initial request and the post-recovery retry — the retry's response can
 * also carry a renewal (rare, but possible if the freshly-exchanged
 * token immediately crosses the 50% mark, which only happens at the
 * sub-second tail of a TTL).
 */
function applyRenewal(response: Response): void {
  const renewed = response.headers.get("X-Renewed-Token");
  if (renewed && _currentAuth) {
    _currentAuth = { userId: _currentAuth.userId, token: renewed };
    void setAuthToken(renewed);
  }
}

/**
 * fetch() wrapper that:
 *   1. Injects the right auth header (Bearer preferred, X-User-Id fallback).
 *   2. Watches the response for X-Renewed-Token and persists the new
 *      token to SecureStore + module state so subsequent calls use it.
 *   3. On 401, attempts a one-shot re-exchange + retry.
 *
 * Every authed call site goes through this. Unauthenticated calls
 * (createUser, exchangeAuthToken) use raw fetch directly — they don't
 * need the header injection, renewal handling, or recovery path. (The
 * recovery path also can't recurse into itself: exchange uses raw fetch.)
 */
async function authedFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const doRequest = async (): Promise<Response> => {
    // Build headers fresh on every attempt — the post-recovery retry
    // needs the NEW Bearer token that authHeaders() now returns.
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(authHeaders())) headers.set(k, v);
    return fetch(input, { ...init, headers });
  };

  let response = await doRequest();
  applyRenewal(response);

  // 401 recovery: only attempt if we have a userId to exchange. Anonymous
  // (signed-out) callers just see the 401.
  if (response.status === 401 && _currentAuth?.userId) {
    const fresh = await refreshTokenSingleFlight(_currentAuth.userId);
    if (fresh) {
      response = await doRequest();
      applyRenewal(response);
    }
  }

  return response;
}

// =============================================================================
// User account
// =============================================================================

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: "senior" | "family" | "technician";
};

export type CreateUserResponse = {
  user: AuthenticatedUser;
  /** JWT minted at onboarding so the client never has to call /v1/auth/exchange. */
  token: string;
};

/**
 * Create a brand-new user during onboarding. This is the ONE call that
 * doesn't need any auth header — it's whitelisted in the backend.
 *
 * Returns both the user blob and a freshly minted JWT. Older mobile
 * builds (pre Stage B) ignore the `token` field and fall through to the
 * legacy header path, which the API still accepts. Callers should
 * persist BOTH via the auth context.
 */
export async function createUser(input: {
  name: string;
}): Promise<CreateUserResponse> {
  const response = await fetch(`${API_URL}/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`User create failed (${response.status}): ${body}`);
  }
  return (await response.json()) as CreateUserResponse;
}

/**
 * Exchange a legacy userId for a JWT. Used once on app start by the
 * AuthProvider when it detects "user blob exists, no token in
 * SecureStore" — the migration path for builds upgrading from
 * pre-Stage-B. Allowlisted from auth on the backend; rate-limited per IP.
 *
 * Throws on non-200. The caller (AuthProvider) catches and falls back
 * to legacy-header behavior for the rest of the session.
 */
export async function exchangeAuthToken(userId: string): Promise<string> {
  const response = await fetch(`${API_URL}/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, audience: "techbuddy-mobile" }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Auth exchange failed (${response.status}): ${body || "no body"}`
    );
  }
  const data = (await response.json()) as { token: string };
  if (!data.token || typeof data.token !== "string") {
    throw new Error("Auth exchange returned no token");
  }
  return data.token;
}

/**
 * Verify the stored user id is still valid. Used at app start to detect a
 * deleted user (e.g. someone wiped the dev DB).
 */
export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await authedFetch(`${API_URL}/v1/users/me`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Get user failed: ${response.status}`);
  }
  const data = (await response.json()) as { user: AuthenticatedUser };
  return data.user;
}

/**
 * One message turn in the chat transcript. `role` and the wire format
 * for `MessageRole` come from @techbuddy/shared.
 */
export type ChatMessage = {
  role: MessageRole;
  content: string;
};

type ChatResponse = {
  /** The session this message was appended to. The client should remember
   *  this and pass it on subsequent calls so all turns persist together. */
  sessionId: string;
  message: ChatMessage;
  usage?: { input_tokens: number; output_tokens: number };
};

/**
 * Send the conversation so far to Buddy and get the next reply.
 *
 * The backend persists each message but the *conversation history* sent
 * here is still the source of truth — Anthropic's API is stateless and
 * the client always knows the full transcript.
 *
 * Pass `sessionId` to append to an existing session. Omit it on the very
 * first turn; the backend will create one and return its ID.
 *
 * If `image` is provided, it's attached to the LAST user message as a
 * Claude Vision input on this turn only.
 *
 * `language` controls which language Buddy responds in.
 */
/**
 * Custom error thrown when Anthropic is too busy to handle the request
 * (HTTP 503 + `error: "upstream_overloaded"` from our API). The chat
 * screen catches this specifically to show "Buddy is very busy, try
 * again in a moment" instead of the generic "Buddy is having trouble"
 * alert — different recovery path, different user expectation.
 *
 * Usage:
 *   try { await sendChatMessage(...) }
 *   catch (err) {
 *     if (err instanceof BuddyBusyError) { ...show busy alert... }
 *     else { ...show generic trouble alert... }
 *   }
 */
export class BuddyBusyError extends Error {
  readonly retryAfterSec: number;
  constructor(message: string, retryAfterSec: number) {
    super(message);
    this.name = "BuddyBusyError";
    this.retryAfterSec = retryAfterSec;
  }
}

export async function sendChatMessage(params: {
  messages: ChatMessage[];
  seniorName?: string;
  device?: DeviceKey;
  sessionId?: string;
  image?: ImageInput;
  language?: "en" | "fr" | "es";
}): Promise<ChatResponse> {
  const response = await authedFetch(`${API_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");

    // 503 + upstream_overloaded means Anthropic returned 529 even after
    // the SDK's automatic retries — tell the caller to surface the
    // distinct "busy" UX instead of the generic "trouble" alert.
    if (response.status === 503) {
      let retryAfter = 5;
      try {
        const parsed = JSON.parse(body) as {
          error?: string;
          retryable?: boolean;
        };
        if (parsed?.error === "upstream_overloaded") {
          const header = response.headers.get("Retry-After");
          if (header) {
            const n = Number.parseInt(header, 10);
            if (Number.isFinite(n) && n > 0) retryAfter = n;
          }
          throw new BuddyBusyError(
            `Chat upstream overloaded — retry in ${retryAfter}s`,
            retryAfter
          );
        }
      } catch (parseOrThrow) {
        if (parseOrThrow instanceof BuddyBusyError) throw parseOrThrow;
        // JSON parse failed — fall through to the generic error below.
      }
    }

    throw new Error(
      `Chat request failed (${response.status}): ${body || "no body"}`
    );
  }

  return (await response.json()) as ChatResponse;
}

// ===========================================================================
// Sessions list
// ===========================================================================

export type SessionSummary = {
  id: string;
  device: DeviceKey | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  preview: string | null;
};

export async function listSessions(): Promise<SessionSummary[]> {
  const response = await authedFetch(`${API_URL}/v1/sessions`);
  if (!response.ok) {
    throw new Error(`Sessions list failed: ${response.status}`);
  }
  const body = (await response.json()) as { sessions: SessionSummary[] };
  return body.sessions;
}

// ===========================================================================
// Session detail (used to rehydrate a chat on resume)
// ===========================================================================

export type SessionDetail = {
  id: string;
  device: DeviceKey | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  messages: Array<ChatMessage & { createdAt: string }>;
};

// ===========================================================================
// User context (long-lived "About me" facts)
// ===========================================================================

export type UserContextKind = "device" | "account" | "other";

export type UserContext = {
  id: string;
  kind: UserContextKind;
  label: string;
  details: string;
  createdAt: string;
  updatedAt: string;
};

export async function listUserContext(): Promise<UserContext[]> {
  const response = await authedFetch(`${API_URL}/v1/user/context`);
  if (!response.ok) {
    throw new Error(`Context list failed: ${response.status}`);
  }
  const body = (await response.json()) as { contexts: UserContext[] };
  return body.contexts;
}

export async function createUserContext(input: {
  kind: UserContextKind;
  label: string;
  details: string;
}): Promise<UserContext> {
  const response = await authedFetch(`${API_URL}/v1/user/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Context create failed: ${response.status}`);
  }
  const body = (await response.json()) as { context: UserContext };
  return body.context;
}

export async function deleteUserContext(id: string): Promise<void> {
  const response = await authedFetch(`${API_URL}/v1/user/context/${id}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Context delete failed: ${response.status}`);
  }
}

export async function getSession(id: string): Promise<SessionDetail> {
  const response = await authedFetch(`${API_URL}/v1/sessions/${id}`);
  if (!response.ok) {
    throw new Error(`Session fetch failed: ${response.status}`);
  }
  const body = (await response.json()) as { session: SessionDetail };
  return body.session;
}

/**
 * Update a session's lifecycle state. The senior triggers this from the
 * "Done" button in chat; we (later) trigger ESCALATED from human handoff.
 */
export async function updateSessionStatus(
  id: string,
  status: SessionStatus
): Promise<void> {
  const response = await authedFetch(`${API_URL}/v1/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(`Status update failed: ${response.status}`);
  }
}

// ===========================================================================
// Bug reports
// ===========================================================================

export type BugReportScreen = "home" | "chat" | "other";

export type BugReportInput = {
  description: string;
  /** Optional screenshot, same shape as the chat image input. */
  image?: ImageInput;
  screen: BugReportScreen;
  /** Soft pointer to the chat session if reporting from /chat. */
  sessionId?: string;
  platform?: string;
  appVersion?: string;
  locale?: string;
};

/**
 * Submit a bug report. Stored on the backend and forwarded to Sentry as
 * a low-severity event so it shows up in the same dashboard as crashes.
 */
export async function submitBugReport(
  input: BugReportInput
): Promise<{ id: string }> {
  const response = await authedFetch(`${API_URL}/v1/bug-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Bug report failed (${response.status}): ${body || "no body"}`
    );
  }
  return (await response.json()) as { id: string };
}

// ===========================================================================
// Family invites (senior-side only)
// ===========================================================================

export type FamilyInvite = {
  id: string;
  code: string;
  /** ISO timestamp when this invite stops working. */
  expiresAt: string;
};

/**
 * One row in the senior-side "linked family members" list.
 */
export type SeniorFamilyLink = {
  id: string;
  familyUserId: string;
  familyName: string;
  /** Family-side nickname for the senior — only meaningful to the family. */
  label: string | null;
  /** ISO timestamp of when this link was created. */
  createdAt: string;
};

/**
 * List the family members currently linked to the authed senior.
 * Used in mobile Settings to show + manage active links.
 */
export async function listMyFamilyLinks(): Promise<SeniorFamilyLink[]> {
  const response = await authedFetch(`${API_URL}/v1/family/links`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Family links list failed (${response.status}): ${body || "no body"}`
    );
  }
  const data = (await response.json()) as { links: SeniorFamilyLink[] };
  return data.links;
}

/**
 * Revoke a single family member's access. Senior-only. The family User
 * row stays — they keep links to other seniors if they have any.
 */
export async function revokeFamilyLink(linkId: string): Promise<void> {
  const response = await authedFetch(
    `${API_URL}/v1/family/links/${encodeURIComponent(linkId)}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 204) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Family link revoke failed (${response.status}): ${body || "no body"}`
    );
  }
}

/**
 * Generate a fresh family invite code. Authed as the senior.
 * Backend mints a 6-digit code with a 7-day TTL.
 *
 * NOTE: we send an empty `{}` body even though the route doesn't need any
 * input — Fastify rejects POSTs with `Content-Type: application/json` but
 * no body (FST_ERR_CTP_EMPTY_JSON_BODY). Either drop the header or send
 * an empty object; we send the object so the request shape stays uniform
 * with every other authed POST in this file.
 */
export async function createFamilyInvite(): Promise<FamilyInvite> {
  const response = await authedFetch(`${API_URL}/v1/family/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Family invite create failed (${response.status}): ${body || "no body"}`
    );
  }
  const data = (await response.json()) as { invite: FamilyInvite };
  return data.invite;
}

export { API_URL };
