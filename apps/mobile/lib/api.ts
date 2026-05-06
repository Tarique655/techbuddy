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
 */
import type {
  DeviceKey,
  ImageInput,
  MessageRole,
  SessionStatus,
} from "@techbuddy/shared";

export type { DeviceKey, ImageInput, MessageRole, SessionStatus };

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

// =============================================================================
// Auth header plumbing
// =============================================================================
//
// AuthProvider calls setApiUserId() whenever the senior's user id changes
// (hydration, onboarding completion, sign-out). We stash it module-locally
// and inject it into every fetch via the X-User-Id header. The backend
// pre-handler validates it against the users table.

let _currentUserId: string | null = null;

export function setApiUserId(id: string | null): void {
  _currentUserId = id;
}

function authHeaders(): Record<string, string> {
  return _currentUserId ? { "X-User-Id": _currentUserId } : {};
}

// =============================================================================
// User account
// =============================================================================

export type AuthenticatedUser = {
  id: string;
  name: string;
  role: "senior" | "family" | "technician";
};

/**
 * Create a brand-new user during onboarding. This is the ONE call that
 * doesn't need an X-User-Id header — that's whitelisted in the backend.
 */
export async function createUser(input: {
  name: string;
}): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`User create failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { user: AuthenticatedUser };
  return data.user;
}

/**
 * Verify the stored user id is still valid. Used at app start to detect a
 * deleted user (e.g. someone wiped the dev DB).
 */
export async function getCurrentUser(): Promise<AuthenticatedUser> {
  const response = await fetch(`${API_URL}/v1/users/me`, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
export async function sendChatMessage(params: {
  messages: ChatMessage[];
  seniorName?: string;
  device?: DeviceKey;
  sessionId?: string;
  image?: ImageInput;
  language?: "en" | "fr" | "es";
}): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
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
  const response = await fetch(`${API_URL}/v1/sessions`, {
    headers: authHeaders(),
  });
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
  const response = await fetch(`${API_URL}/v1/user/context`, {
    headers: authHeaders(),
  });
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
  const response = await fetch(`${API_URL}/v1/user/context`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Context create failed: ${response.status}`);
  }
  const body = (await response.json()) as { context: UserContext };
  return body.context;
}

export async function deleteUserContext(id: string): Promise<void> {
  const response = await fetch(`${API_URL}/v1/user/context/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Context delete failed: ${response.status}`);
  }
}

export async function getSession(id: string): Promise<SessionDetail> {
  const response = await fetch(`${API_URL}/v1/sessions/${id}`, {
    headers: authHeaders(),
  });
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
  const response = await fetch(`${API_URL}/v1/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
  const response = await fetch(`${API_URL}/v1/bug-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
  const response = await fetch(`${API_URL}/v1/family/links`, {
    headers: authHeaders(),
  });
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
  const response = await fetch(
    `${API_URL}/v1/family/links/${encodeURIComponent(linkId)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    }
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
  const response = await fetch(`${API_URL}/v1/family/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
