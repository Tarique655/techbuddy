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
     * do, although that follow-up optimization isn't part of the JWT
     * migration itself — see JWT_MIGRATION_PLAN.md §8.
     */
    userRole: AuthRole | "";
    /**
     * Audience the request was authenticated under (mobile / web).
     * Used by the renewal hook to decide where to put the renewed
     * token (response header for mobile, refreshed cookie for web).
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
 * Routes that anyone can hit without auth. Anything else requires a
 * valid Bearer JWT.
 *
 * Add rarely. The vast majority of API surface should be authenticated.
 *
 * History note: pre-Stage-E this list also included POST
 * /v1/auth/exchange (the legacy-id → JWT migration helper). That
 * endpoint now returns 410 Gone unconditionally, so it can stay off
 * the allowlist — verifyAuthToken will return null on the missing
 * header and the 401 will be overwritten by the route's 410.
 */
function isAllowlisted(method: string, url: string): boolean {
  if (url === "/healthz") return true;
  // Onboarding: the senior creates a brand-new user before they have an id.
  if (method === "POST" && url === "/v1/users") return true;
  // Family portal: a family member accepting an invite doesn't yet have a
  // user id. Accept creates the User row + FamilyLink and returns auth.
  if (method === "POST" && url === "/v1/family/accept") return true;
  // The exchange endpoint is gone post-Stage-E (returns 410), but we
  // allowlist it so the 410 reaches the client cleanly instead of the
  // pre-handler short-circuiting with a 401.
  if (method === "POST" && url === "/v1/auth/exchange") return true;
  return false;
}

// =============================================================================
// Bearer auth
// =============================================================================

/**
 * Read and verify a Bearer token. Returns the payload on success, null on
 * any failure (no header, malformed header, invalid signature, expired,
 * tokenVersion mismatch, user deleted).
 */
async function verifyRequestBearer(
  request: FastifyRequest
): Promise<AuthTokenPayload | null> {
  const header = request.headers.authorization;
  if (!header || typeof header !== "string") return null;
  if (!header.startsWith("Bearer ")) return null;

  const raw = header.slice("Bearer ".length).trim();
  if (raw.length === 0) return null;

  const payload = verifyAuthToken(raw);
  if (!payload) return null;

  // Verify the token's `tv` claim still matches the user's current
  // tokenVersion. A bumped tokenVersion (sign-out-everywhere, breach
  // response) immediately invalidates every token holding the old value.
  // Also confirms the user still exists at all.
  const user = await db.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, tokenVersion: true },
  });
  if (!user) return null;
  if (user.tokenVersion !== payload.tv) return null;

  return payload;
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
 * Stage E semantics: Bearer JWT only. Legacy X-User-Id is no longer
 * accepted (history: it was the v1 beta credential and the multi-mode
 * Stage A pre-handler accepted both during the migration).
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("userRole", "");
  fastify.decorateRequest("authAudience", "");
  fastify.decorateRequest("pendingRenewedToken", null);

  fastify.addHook("preHandler", async (request, reply) => {
    if (isAllowlisted(request.method, request.url)) return;

    const payload = await verifyRequestBearer(request);
    if (!payload) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Your session has expired. Please reopen the app.",
      });
    }

    request.userId = payload.sub;
    request.userRole = payload.role;
    request.authAudience = payload.aud;

    if (shouldRenew(payload)) {
      // Stash the data needed to mint a fresh token; the actual mint
      // happens in the onSend hook so we don't burn cycles on requests
      // that 4xx out before reaching the handler.
      request.pendingRenewedToken = {
        role: payload.role,
        tokenVersion: payload.tv,
        audience: payload.aud,
      };
    }
  });

  // onSend runs for every response, including ones the route handler
  // itself short-circuited. Cheap when there's no pending token.
  fastify.addHook("onSend", async (request, reply, payload) => {
    attachRenewedToken(request, reply);
    return payload;
  });
}
