import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Prisma, UserRole } from "@prisma/client";

import { db } from "../lib/db.js";
import { serializeSummary } from "../lib/summarize.js";

/**
 * Family portal routes.
 *
 * Auth model:
 *   - Senior generates an invite from the mobile app (POST /v1/family/invites,
 *     authed as the senior).
 *   - Family member opens the web portal, types the code + their name, gets
 *     a freshly created User row with role=FAMILY plus a FamilyLink to the
 *     senior. Returns the family user's id so the web app can store it in
 *     localStorage and use it as the X-User-Id header on subsequent calls.
 *   - Going forward, family-side calls are authed by X-User-Id like everything
 *     else; we additionally check that the user has role=FAMILY before letting
 *     them touch family routes.
 *
 * Privacy note: family sees session metadata + AI summaries only. We
 * intentionally don't expose chat transcripts in v1 — that requires a
 * senior-side opt-in we haven't built yet.
 */

// Codes are 6 numeric digits. Stored as a string so leading zeros survive.
const INVITE_CODE_LENGTH = 6;
const INVITE_TTL_DAYS = 7;
const INVITE_GENERATION_MAX_ATTEMPTS = 5;

function generateInviteCode(): string {
  // Math.random is fine here — codes are short-lived, single-use, and only
  // grant a follow-up step (account creation). If we ever raise the privacy
  // stakes (e.g. transcript access), upgrade to crypto.randomInt.
  const n = Math.floor(Math.random() * 10 ** INVITE_CODE_LENGTH);
  return n.toString().padStart(INVITE_CODE_LENGTH, "0");
}

const AcceptSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d+$/u, "Code must be all digits.")
    .length(INVITE_CODE_LENGTH, `Code must be ${INVITE_CODE_LENGTH} digits.`),
  /** Family member's display name. */
  name: z.string().trim().min(1).max(80),
  /** Optional label the family wants to use for this senior, e.g. "Mom". */
  label: z.string().trim().max(80).optional(),
});

export async function familyRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/family/invites — senior generates a fresh invite code.
  //
  // Returns the code (and TTL) so the mobile app can display it. We don't
  // mint a long URL here — the family portal URL is configured client-side.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/family/invites", async (request, reply) => {
    const userId = request.userId;

    // Only seniors can invite. Family/technician roles shouldn't have this
    // surface in the first place but defense-in-depth.
    const me = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!me) return reply.code(401).send({ error: "user_not_found" });
    if (me.role !== UserRole.SENIOR) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Only seniors can invite family members.",
      });
    }

    // Tiny retry loop in case we hit a code collision. With a 6-digit
    // namespace and short TTL we'd need many thousands of live invites
    // before this matters; the loop is just paranoid.
    let created;
    for (let attempt = 0; attempt < INVITE_GENERATION_MAX_ATTEMPTS; attempt++) {
      const code = generateInviteCode();
      const expiresAt = new Date(
        Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
      );
      try {
        created = await db.familyInvite.create({
          data: { code, createdByUserId: userId, expiresAt },
          select: { id: true, code: true, expiresAt: true },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          // Unique violation on `code` — try again with a new one.
          continue;
        }
        throw err;
      }
    }
    if (!created) {
      request.log.error({ userId }, "failed to mint unique invite code");
      return reply.code(500).send({
        error: "invite_generation_failed",
        message: "Couldn't create an invite code. Please try again.",
      });
    }

    request.log.info(
      { inviteId: created.id, userId },
      "family invite created"
    );

    return reply.code(201).send({
      invite: {
        id: created.id,
        code: created.code,
        expiresAt: created.expiresAt.toISOString(),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/family/accept — family enters a code + their name.
  //
  // Allowlisted from auth (no X-User-Id required) — the family member doesn't
  // have an account yet. We create the family User + FamilyLink atomically,
  // mark the invite accepted, and return the new user id so the web app can
  // store it for future calls.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/family/accept", async (request, reply) => {
    const parse = AcceptSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { code, name, label } = parse.data;

    const invite = await db.familyInvite.findUnique({
      where: { code },
      select: {
        id: true,
        createdByUserId: true,
        expiresAt: true,
        acceptedAt: true,
      },
    });
    if (!invite) {
      return reply.code(404).send({
        error: "invite_not_found",
        message: "That code wasn't recognized. Please double-check it.",
      });
    }
    if (invite.acceptedAt) {
      return reply.code(409).send({
        error: "invite_already_used",
        message: "That code has already been used.",
      });
    }
    if (invite.expiresAt < new Date()) {
      return reply.code(410).send({
        error: "invite_expired",
        message: "That code has expired. Ask for a new one.",
      });
    }

    // Atomic: create family user, link them, mark invite accepted.
    const result = await db.$transaction(async (tx) => {
      const family = await tx.user.create({
        data: { name, role: UserRole.FAMILY },
        select: { id: true, name: true, role: true },
      });
      const link = await tx.familyLink.create({
        data: {
          familyUserId: family.id,
          seniorUserId: invite.createdByUserId,
          label: label ?? null,
        },
        select: { id: true },
      });
      await tx.familyInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date(), acceptedByUserId: family.id },
      });
      return { family, link };
    });

    request.log.info(
      {
        familyUserId: result.family.id,
        seniorUserId: invite.createdByUserId,
        inviteId: invite.id,
      },
      "family invite accepted"
    );

    return reply.code(201).send({
      user: {
        id: result.family.id,
        name: result.family.name,
        role: result.family.role.toLowerCase(),
      },
      link: { id: result.link.id, seniorUserId: invite.createdByUserId },
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/family/seniors — list seniors the authed family user can observe.
  //
  // Returns name, link label, last-session metadata for each. Used as the
  // dashboard landing-page list.
  // ---------------------------------------------------------------------------
  fastify.get("/v1/family/seniors", async (request, reply) => {
    const userId = request.userId;

    const me = await db.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!me) return reply.code(401).send({ error: "user_not_found" });
    if (me.role !== UserRole.FAMILY) {
      return reply.code(403).send({
        error: "forbidden",
        message: "Only family accounts can view linked seniors.",
      });
    }

    const links = await db.familyLink.findMany({
      where: { familyUserId: userId },
      orderBy: { createdAt: "asc" },
      include: {
        senior: {
          select: {
            id: true,
            name: true,
            sessions: {
              orderBy: { startedAt: "desc" },
              take: 1,
              select: {
                id: true,
                device: true,
                status: true,
                startedAt: true,
              },
            },
          },
        },
      },
    });

    return reply.send({
      seniors: links.map((l) => ({
        seniorUserId: l.senior.id,
        name: l.senior.name,
        label: l.label,
        linkedAt: l.createdAt.toISOString(),
        lastSession: l.senior.sessions[0]
          ? {
              id: l.senior.sessions[0].id,
              device: l.senior.sessions[0].device
                ? l.senior.sessions[0].device.toLowerCase()
                : null,
              status: l.senior.sessions[0].status.toLowerCase(),
              startedAt: l.senior.sessions[0].startedAt.toISOString(),
            }
          : null,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/family/seniors/:id/sessions — session list for a linked senior.
  //
  // Each session includes the AI-generated summary (when available) so the
  // dashboard can render "what was wrong + how urgent" without a second
  // round-trip per row. Hard cap at 50 most recent — pagination is a TODO.
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/v1/family/seniors/:id/sessions",
    async (request, reply) => {
      const userId = request.userId;
      const seniorUserId = request.params.id;

      const me = await db.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!me) return reply.code(401).send({ error: "user_not_found" });
      if (me.role !== UserRole.FAMILY) {
        return reply.code(403).send({
          error: "forbidden",
          message: "Only family accounts can view sessions.",
        });
      }

      // Authorization: this family member must be linked to this senior.
      // 404 (not 403) on missing link to avoid leaking the existence of
      // unrelated senior accounts.
      const link = await db.familyLink.findUnique({
        where: {
          familyUserId_seniorUserId: { familyUserId: userId, seniorUserId },
        },
        select: { id: true },
      });
      if (!link) {
        return reply.code(404).send({
          error: "senior_not_found",
          message: "We couldn't find that senior in your linked accounts.",
        });
      }

      const sessions = await db.session.findMany({
        where: { userId: seniorUserId },
        orderBy: { startedAt: "desc" },
        take: 50,
        include: {
          summary: true,
          _count: { select: { messages: true } },
        },
      });

      return reply.send({
        sessions: sessions.map((s) => ({
          id: s.id,
          device: s.device ? s.device.toLowerCase() : null,
          status: s.status.toLowerCase(),
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt ? s.endedAt.toISOString() : null,
          messageCount: s._count.messages,
          summary: s.summary ? serializeSummary(s.summary) : null,
        })),
      });
    }
  );
}
