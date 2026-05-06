import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../lib/db.js";
import { checkUserCreateRateLimit } from "../lib/rate-limit.js";

const CreateUserSchema = z.object({
  /** Senior-friendly display name. Used in greetings and Buddy's prompt. */
  name: z.string().trim().min(1).max(80),
});

export async function userRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/users — create a brand-new user (called from onboarding).
  // Allowlisted from auth in lib/auth.ts; this is how a fresh device gets
  // an id in the first place.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/users", async (request, reply) => {
    // Rate-limit BEFORE Zod parse so a script spamming this endpoint
    // pays the 429 cost without us doing schema work or DB writes.
    // Onboarding is a once-per-device action; 5/minute, 20/hour from a
    // single IP is generous for legit households on a shared NAT and
    // tight enough to neutralize spam.
    const rl = checkUserCreateRateLimit(request.ip);
    if (!rl.allowed) {
      request.log.warn(
        { ip: request.ip, reason: rl.reason, retryAfterSec: rl.retryAfterSec },
        "user-create rate limit exceeded"
      );
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message:
          "Too many account creations from this network. Please wait a moment and try again.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = CreateUserSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }

    const created = await db.user.create({
      data: { name: parse.data.name, role: "SENIOR" },
    });
    request.log.info({ userId: created.id }, "created user");

    return reply.code(201).send({
      user: {
        id: created.id,
        name: created.name,
        role: created.role.toLowerCase(),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/users/me — fetch the authenticated user. Useful for the mobile
  // app to validate a stored user id at app start.
  // ---------------------------------------------------------------------------
  fastify.get("/v1/users/me", async (request, reply) => {
    const user = await db.user.findUnique({
      where: { id: request.userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      return reply.code(404).send({ error: "user_not_found" });
    }
    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        role: user.role.toLowerCase(),
      },
    });
  });
}
