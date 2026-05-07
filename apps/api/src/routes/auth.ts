import type { FastifyInstance } from "fastify";

import { db } from "../lib/db.js";
import { signAuthToken, type AuthAudience, type AuthRole } from "../lib/jwt.js";

/**
 * Auth-specific endpoints.
 *
 *   POST /v1/auth/exchange — REMOVED post-Stage-E. Returns 410 Gone.
 *     This endpoint was the legacy-id → JWT migration helper during
 *     Stages A–D. With legacy header support gone, the migration is
 *     complete and there's no scenario where a client should be calling
 *     it. Kept as a 410 (rather than deleted) so any tester on a
 *     wildly stale build sees a useful error message instead of 404.
 *
 *   POST /v1/auth/refresh — Bearer-authed. Mints a new JWT regardless of
 *     remaining TTL. Mobile uses this on a 401 it thought was valid; web
 *     uses it during long sessions. Sliding renewal in the pre-handler
 *     covers the common case — /refresh is the explicit fallback.
 */

export async function authRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/auth/exchange — gone post-Stage-E.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/exchange", async (_request, reply) => {
    return reply.code(410).send({
      error: "exchange_removed",
      message:
        "The legacy-id exchange endpoint is no longer available. Please reopen the app to sign in again.",
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
