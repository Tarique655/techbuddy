import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../lib/db.js";
import { signAuthToken, type AuthAudience, type AuthRole } from "../lib/jwt.js";
import { checkAuthExchangeRateLimit } from "../lib/rate-limit.js";

/**
 * Auth-specific endpoints.
 *
 *   POST /v1/auth/exchange — Stage E originally turned this into a 410
 *     Gone tombstone (the migration was "done"). That broke the
 *     401-recovery path on mobile clients that had a userId in memory
 *     but no valid token in SecureStore (we hit one such case post-ship
 *     2026-05-06: an iPhone whose Keychain JWT had silently failed to
 *     persist; with exchange gone, the phone had no way back). We
 *     restored exchange to keep recovery working. The "removal of legacy
 *     X-User-Id from the pre-handler" half of Stage E stays in place —
 *     the pre-handler is still Bearer-only — but exchange remains
 *     available as the recovery escape hatch. See TECH_DEBT.md note on
 *     "iOS Keychain may have silently failed to persist the Stage B JWT."
 *
 *   POST /v1/auth/refresh — Bearer-authed. Mints a new JWT regardless of
 *     remaining TTL. Mobile uses this on a 401 it thought was valid; web
 *     uses it during long sessions. Sliding renewal in the pre-handler
 *     covers the common case — /refresh is the explicit fallback.
 */

const ExchangeSchema = z.object({
  userId: z.string().trim().min(1).max(64),
  /** Which surface this token is being minted for. Mobile vs web get
   *  different TTLs and the audience claim feeds into renewal-target
   *  selection (header vs cookie) downstream. Mobile is the default
   *  because the mobile client is the primary caller of this endpoint. */
  audience: z
    .enum(["techbuddy-mobile", "techbuddy-web"])
    .default("techbuddy-mobile"),
});

export async function authRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/auth/exchange — userId → JWT.
  //
  // Allowlisted from the pre-handler in lib/auth.ts (caller has no JWT
  // yet by definition). Threat model: an attacker who knows a userId
  // can mint a token for that user. cuids are unguessable for v1; if
  // we ever need stronger guarantees, this endpoint is the place to
  // add a per-user secondary factor.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/exchange", async (request, reply) => {
    const rl = checkAuthExchangeRateLimit(request.ip);
    if (!rl.allowed) {
      request.log.warn(
        { ip: request.ip, reason: rl.reason, retryAfterSec: rl.retryAfterSec },
        "auth-exchange rate limit exceeded"
      );
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Too many attempts. Please wait a moment.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = ExchangeSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { userId, audience } = parse.data;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, tokenVersion: true },
    });
    if (!user) {
      return reply.code(401).send({
        error: "user_not_found",
        message: "Your session is invalid. Please reopen the app.",
      });
    }

    const role = user.role.toLowerCase() as AuthRole;
    const token = signAuthToken({
      userId: user.id,
      role,
      tokenVersion: user.tokenVersion,
      audience,
    });

    request.log.info(
      { userId: user.id, audience },
      "auth.exchange minted token"
    );

    return reply.send({
      token,
      user: { id: user.id, name: user.name, role },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/refresh — Bearer-authed; mint a fresh token.
  //
  // The sliding-renewal hook in lib/auth.ts covers the common case of
  // "active user, half their TTL gone, give them a fresh token quietly."
  // /refresh exists for the explicit case: a client that thinks its token
  // might be stale, or wants to roll forward proactively (e.g. before a
  // long offline period).
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/refresh", async (request, reply) => {
    // Pre-handler has already verified the Bearer; we have userId + role.
    // The audience comes from the request — we mirror whatever the
    // existing token said (mobile clients refresh as mobile, etc.).
    const audience: AuthAudience =
      request.authAudience === "techbuddy-web"
        ? "techbuddy-web"
        : "techbuddy-mobile";

    // Re-read tokenVersion — it might have been bumped while this
    // particular token was still in the wallet (e.g. a different device
    // signed out everywhere). The pre-handler already validated tv
    // matched at request time, so this read is for the FRESH mint, not
    // the verify path.
    const user = await db.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, role: true, tokenVersion: true },
    });
    if (!user) {
      // Pre-handler would have caught this, but defense in depth.
      return reply.code(401).send({ error: "user_not_found" });
    }

    const role = user.role.toLowerCase() as AuthRole;
    const token = signAuthToken({
      userId: user.id,
      role,
      tokenVersion: user.tokenVersion,
      audience,
    });

    return reply.send({
      token,
      user: { id: user.id, name: user.name, role },
    });
  });
}
