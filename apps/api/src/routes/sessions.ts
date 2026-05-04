import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SessionStatus } from "@prisma/client";

import { db } from "../lib/db.js";
import { serializeSummary, summarizeAndSave } from "../lib/summarize.js";

const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Mark any of this user's ACTIVE sessions as ABANDONED if no message
 * has been added in the last 24 hours. Cheap, runs once per Home view.
 *
 * "No message in N hours" — including sessions that have zero messages
 * at all but were created more than N hours ago — covers both the
 * normal "walked away mid-conversation" case and the "tapped Get Help
 * Now and never typed" case.
 */
async function sweepAbandoned(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  await db.session.updateMany({
    where: {
      userId,
      status: SessionStatus.ACTIVE,
      startedAt: { lt: cutoff },
      NOT: { messages: { some: { createdAt: { gte: cutoff } } } },
    },
    data: {
      status: SessionStatus.ABANDONED,
      endedAt: new Date(),
    },
  });
}

/**
 * Sessions list + detail endpoints.
 *
 * Used by the Home screen (list) and the chat screen on resume (detail).
 */
export async function sessionsRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /v1/sessions — list of recent sessions for the current user.
  // ---------------------------------------------------------------------------
  fastify.get("/v1/sessions", async (request, reply) => {
    const userId = request.userId;
    // Run the abandoned sweep before returning the list so the user
    // always sees up-to-date statuses on Home.
    await sweepAbandoned(userId);

    const sessions = await db.session.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: {
        // Include just the first user message as a preview of what the
        // session was about. Cheap and good enough for the home list.
        messages: {
          where: { role: "USER" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { content: true },
        },
        _count: {
          select: { messages: true },
        },
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
        // 100 chars is enough for the home-screen card preview.
        preview: s.messages[0]?.content.slice(0, 100) ?? null,
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/sessions/:id — full session including all messages, used on resume.
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    "/v1/sessions/:id",
    async (request, reply) => {
      const userId = request.userId;
      const { id } = request.params;

      const session = await db.session.findFirst({
        where: { id, userId },
        include: {
          messages: {
            // ASSISTANT and USER turns only — never expose internal SYSTEM
            // messages to the client, even though we don't write any today.
            where: { role: { in: ["USER", "ASSISTANT"] } },
            orderBy: { createdAt: "asc" },
            select: { role: true, content: true, createdAt: true },
          },
          summary: true,
        },
      });

      if (!session) {
        return reply.code(404).send({
          error: "session_not_found",
          message: "That session doesn't exist or doesn't belong to you.",
        });
      }

      return reply.send({
        session: {
          id: session.id,
          device: session.device ? session.device.toLowerCase() : null,
          status: session.status.toLowerCase(),
          startedAt: session.startedAt.toISOString(),
          endedAt: session.endedAt ? session.endedAt.toISOString() : null,
          messages: session.messages.map((m) => ({
            role: m.role.toLowerCase() as "user" | "assistant",
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
          summary: session.summary ? serializeSummary(session.summary) : null,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /v1/sessions/:id/summarize — generate or refresh the issue summary.
  //
  // Manual trigger. The chat handler also auto-fires this in the background
  // once a session has 6+ messages, but this endpoint lets the family portal
  // (and devs) regenerate on demand.
  // ---------------------------------------------------------------------------
  fastify.post<{ Params: { id: string } }>(
    "/v1/sessions/:id/summarize",
    async (request, reply) => {
      const userId = request.userId;
      const { id } = request.params;

      // Authorize: session must belong to this user.
      const session = await db.session.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!session) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      try {
        const saved = await summarizeAndSave(id);
        if (!saved) {
          return reply.code(400).send({
            error: "not_enough_conversation",
            message:
              "There aren't enough messages to summarize yet. Have a few more turns first.",
          });
        }
        return reply.send({ summary: serializeSummary(saved) });
      } catch (err) {
        request.log.error({ err, sessionId: id }, "summarize failed");
        return reply.code(502).send({
          error: "summarize_failed",
          message: "Couldn't generate the summary right now. Please try again.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PATCH /v1/sessions/:id — update status (resolved / escalated / abandoned).
  //
  // Senior-driven via the "Done" button in chat. The mobile app passes
  // status: "resolved_ai" when the senior says they're all set.
  // ---------------------------------------------------------------------------
  const StatusUpdateSchema = z.object({
    status: z.enum(["resolved_ai", "escalated", "abandoned", "active"]),
  });

  fastify.patch<{ Params: { id: string } }>(
    "/v1/sessions/:id",
    async (request, reply) => {
      const parse = StatusUpdateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({
          error: "invalid_request",
          details: parse.error.issues,
        });
      }

      const userId = request.userId;
      const { id } = request.params;

      const owned = await db.session.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!owned) {
        return reply.code(404).send({ error: "session_not_found" });
      }

      const newStatus = parse.data.status.toUpperCase() as SessionStatus;
      const isClosing = newStatus !== SessionStatus.ACTIVE;

      const updated = await db.session.update({
        where: { id },
        data: {
          status: newStatus,
          endedAt: isClosing ? new Date() : null,
        },
      });

      return reply.send({
        session: {
          id: updated.id,
          status: updated.status.toLowerCase(),
          endedAt: updated.endedAt ? updated.endedAt.toISOString() : null,
        },
      });
    }
  );
}
