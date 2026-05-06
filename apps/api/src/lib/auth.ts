import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { db } from "./db.js";
import { env } from "./env.js";
import {
  signAuthToken,
  verifyAuthToken,
  shouldRenew,
  type AuthAudience,
  type AuthRole,
  type AuthTokenPayload,
} from "./jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Authenticated user id, set by the auth pre-handler. Unauthenticated
     * paths (allowlisted below) MUST not read this — it'll be the empty
     * string default from `decorateRequest`.
     */
    userId: string;
    /**
     * Authenticated user's role, set by the auth pre-handler. Empty
     * string on allowlisted paths. Routes can use this to short-circuit
     * the `db.user.findUnique({ select: { role: ... } })` they currently
     * do, although that follow-up optimization isn't part of Stage A —
     * see JWT_MIGRATION_PLAN.md §8.
     */
    userRole: AuthRole | "";
    /**
     * Audience the request was authenticated under (mobile / web / "" if
     * legacy header). Used by the renewal hook to decide where to put
     * the renewed token (response header vs cookie).
     */
    authAudience: AuthAudience | "";
    /**
     * If non-null, the pre-handler decided this request's token has
     * crossed the 50% TTL mark and should be renewed. The onSend hook
     * mints a fresh token using these claims and rides it back on the
     * response. We compute the new payload here (rather than at onSend
     * time) so the user-row lookup in the pre-handler is the only DB
     * hit per request.
     */
    pendingRenewedToken: {
      role: AuthRole;
      tokenVersion: number;
      audience: AuthAudience;
    } | null;
  }
}

/**
 * Routes that anyone can hit without auth. Anything else requires either
 * a valid Bearer JWT or, while AUTH_ACCEPT_BEARER is on, a legacy
 * X-User-Id header that matches a user row.
 *
 * Add rarely. The vast majority of API surface should be authenticated.
 */
function isAllowlisted(method: string, url: string): boolean {
  if (url === "/healthz") return true;
  // Onboarding: the senior creates a brand-new user before they have an id.
  if (method === "POST" && url === "/v1/users") return true;
  // Family portal: a family member accepting an invite doesn't yet have a
  // user id. Accept creates the User row + FamilyLink and returns auth.
  if (method === "POST" && url === "/v1/family/accept") return true;
  // Stage A migration helper: legacy-id holders hit this once to upgrade
  // their X-User-Id session into a JWT. The body carries the userId
  // (which is what the legacy header carried already), so this endpoint
  // doesn't need a Bearer either. Rate-limited per IP in the route itself.
  if (method === "POST" && url === "/v1/auth/exchange") return true;
  return false;
}

// =============================================================================
// Bearer path
// =============================================================================

/**
 * Read and verify a Bearer token. Returns:
 *   - payload on success
 *   - "missing" if no Authorization header present (caller falls back to legacy)
 *   - "invalid" if the header was present but the token failed verify or `tv` mismatch
 */
async function tryBearerAuth(
  request: FastifyRequest
): Promise<AuthTokenPayload | "missing" | "invalid"> {
  const header = request.headers.authorization;
  if (!header || typeof header !== "string") return "missing";
  if (!header.startsWith("Bearer ")) return "missing";

  const raw = header.slice("Bearer ".length).trim();
  if (raw.length === 0) return "missing";

  const payload = verifyAuthToken(raw);
  if (!payload) return "invalid";

  // Verify the token's `tv` claim still matches the user's current
  // tokenVersion. A bumped tokenVersion (sign-out-everywhere, breach
  // response) immediately invalidates every token holding the old value.
  // Also confirms the user still exists at all.
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, tokenVersion: true },
  });
  if (!user) return "invalid";
  if (user.tokenVersion !== payload.tv) return "invalid";

  return payload;
}

// =============================================================================
// Legacy X-User-Id path
// =============================================================================

interface LegacyAuthSuccess {
  ok: true;
  userId: string;
  role: AuthRole;
  tokenVersion: number;
}
interface LegacyAuthFailure {
  ok: false;
  error: "missing" | "user_not_found";
}
type LegacyAuthResult = LegacyAuthSuccess | LegacyAuthFailure;

async function tryLegacyAuth(request: FastifyRequest): Promise<LegacyAuthResult> {
  const headerVal = request.headers["x-user-id"];
  const userId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
  if (!userId || typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "missing" };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, tokenVersion: true },
  });
  if (!user) return { ok: false, error: "user_not_found" };

  // Tag for Sentry/log dashboards so we can watch legacy-header usage
  // drop to zero before flipping Stage E. Keep it cheap — request.log
  // already routes through pino + Sentry breadcrumbs.
  request.log.warn(
    { userId: user.id, route: `${request.method} ${request.url}`, authMode: "legacy" },
    "auth.legacy"
  );

  return {
    ok: true,
    userId: user.id,
    role: user.role.toLowerCase() as AuthRole,
    tokenVersion: user.tokenVersion,
  };
}

// =============================================================================
// Renewal hook
// =============================================================================

/**
 * Mint a new token for the request's authenticated user and place it on
 * the response — header for mobile, refreshed cookie for web. Called from
 * the onSend hook only when `request.pendingRenewedToken` was set by the
 * pre-handler.
 *
 * Skipped on error responses (4xx/5xx) so we don't reissue tokens to a
 * client that's about to retry — wasted work and noisy.
 */
function attachRenewedToken(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const pending = request.pendingRenewedToken;
  if (!pending) return;
  if (reply.statusCode >= 400) return;

  const fresh = signAuthToken({
    userId: request.userId,
    role: pending.role,
    tokenVersion: pending.tokenVersion,
    audience: pending.audience,
  });

  if (pending.audience === "techbuddy-mobile") {
    // Mobile fetch wrapper reads this header and persists the new token
    // to SecureStore. Exposed via CORS in server.ts so JS-fetch can read it.
    reply.header("X-Renewed-Token", fresh);
  } else {
    // Web: refresh the HttpOnly cookie. Same attributes as the original
    // set in /v1/family/accept — Path=/, HttpOnly, Secure in prod,
    // SameSite=Lax (Path A: cookie is first-party to the Next host).
    reply.setCookie("tb_session", fresh, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // matches web TTL in lib/jwt.ts
    });
  }
}

// =============================================================================
// Pre-handler registration
// =============================================================================

/**
 * Register the auth flow. Call once in server.ts before any route
 * registration so the pre-handler covers everything.
 *
 * Stage A semantics: prefer Bearer JWT. If absent OR present-but-invalid,
 * fall back to the legacy X-User-Id path while AUTH_ACCEPT_BEARER is on.
 * Once Stage E ships, the legacy path is removed entirely (this whole
 * function shrinks back to ~15 lines).
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("userRole", "");
  fastify.decorateRequest("authAudience", "");
  fastify.decorateRequest("pendingRenewedToken", null);

  fastify.addHook("preHandler", async (request, reply) => {
    if (isAllowlisted(request.method, request.url)) return;

    // -----------------------------------------------------------------
    // Bearer path (preferred)
    // -----------------------------------------------------------------
    if (env.AUTH_ACCEPT_BEARER) {
      const bearer = await tryBearerAuth(request);
      if (bearer !== "missing") {
        if (bearer === "invalid") {
          return reply.code(401).send({
            error: "invalid_token",
            message: "Your session has expired. Please reopen the app.",
          });
        }
        // Successful Bearer auth.
        request.userId = bearer.sub;
        request.userRole = bearer.role;
        request.authAudience = bearer.aud;
        if (shouldRenew(bearer)) {
          // Stash the data needed to mint a fresh token; the actual
          // mint happens in the onSend hook so we don't burn cycles
          // on requests that 4xx out before reaching the handler.
          // We need the user's CURRENT tokenVersion (already verified
          // matches the token's tv above) — we already loaded the user
          // row in tryBearerAuth, but didn't keep it. Re-look-up is
          // wasteful; the typical case is no renewal, so optimize the
          // happy path and accept this small extra read on the
          // "halfway through TTL" edge.
          request.pendingRenewedToken = {
            role: bearer.role,
            tokenVersion: bearer.tv,
            audience: bearer.aud,
          };
        }
        return;
      }
      // Bearer "missing" → fall through to legacy path.
    }

    // -----------------------------------------------------------------
    // Legacy X-User-Id path
    // -----------------------------------------------------------------
    const legacy = await tryLegacyAuth(request);
    if (!legacy.ok) {
      if (legacy.error === "missing") {
        return reply.code(401).send({
          error: "user_id_required",
          message: "Missing authentication. Please reopen the app.",
        });
      }
      return reply.code(401).send({
        error: "user_not_found",
        message: "Your session is invalid. Please reopen the app.",
      });
    }

    request.userId = legacy.userId;
    request.userRole = legacy.role;
    request.authAudience = ""; // unknown — no JWT was used
    // No renewal on the legacy path; legacy clients have no place to
    // store a JWT that arrives in a header until they upgrade through
    // /v1/auth/exchange.
  });

  // onSend runs for every response, including ones the route handler
  // itself short-circuited. Cheap when there's no pending token.
  fastify.addHook("onSend", async (request, reply, payload) => {
    attachRenewedToken(request, reply);
    return payload;
  });
}
