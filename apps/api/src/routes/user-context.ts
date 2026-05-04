import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { UserContextKind } from "@prisma/client";

import { db } from "../lib/db.js";

/**
 * User context: long-lived facts about the senior's setup that Buddy
 * references across sessions. Devices they own, accounts they use,
 * anything else worth remembering.
 *
 * v1: manually entered through the About Me mobile screen. The chat
 * route reads these and injects them into Buddy's system prompt so the
 * model knows what hardware/services it's working with.
 */

const KIND_VALUES = ["device", "account", "other"] as const;

function kindToEnum(k: (typeof KIND_VALUES)[number]): UserContextKind {
  return k.toUpperCase() as UserContextKind;
}

function kindFromEnum(k: UserContextKind): (typeof KIND_VALUES)[number] {
  return k.toLowerCase() as (typeof KIND_VALUES)[number];
}

const ContextCreateSchema = z.object({
  kind: z.enum(KIND_VALUES),
  label: z.string().min(1).max(80),
  details: z.string().min(1).max(500),
});

const ContextUpdateSchema = ContextCreateSchema.partial();

export async function userContextRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // GET /v1/user/context — list all facts for the current user.
  // ---------------------------------------------------------------------------
  fastify.get("/v1/user/context", async (request, reply) => {
    const userId = request.userId;
    const rows = await db.userContext.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    return reply.send({
      contexts: rows.map((r) => ({
        id: r.id,
        kind: kindFromEnum(r.kind),
        label: r.label,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/user/context — add a new fact.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/user/context", async (request, reply) => {
    const parse = ContextCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply
        .code(400)
        .send({ error: "invalid_request", details: parse.error.issues });
    }
    const userId = request.userId;
    const created = await db.userContext.create({
      data: {
        userId,
        kind: kindToEnum(parse.data.kind),
        label: parse.data.label,
        details: parse.data.details,
      },
    });
    return reply.code(201).send({
      context: {
        id: created.id,
        kind: kindFromEnum(created.kind),
        label: created.label,
        details: created.details,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /v1/user/context/:id — edit a fact.
  // ---------------------------------------------------------------------------
  fastify.patch<{ Params: { id: string } }>(
    "/v1/user/context/:id",
    async (request, reply) => {
      const parse = ContextUpdateSchema.safeParse(request.body);
      if (!parse.success) {
        return reply
          .code(400)
          .send({ error: "invalid_request", details: parse.error.issues });
      }
      const userId = request.userId;
      const owned = await db.userContext.findFirst({
        where: { id: request.params.id, userId },
        select: { id: true },
      });
      if (!owned) {
        return reply.code(404).send({ error: "context_not_found" });
      }
      const data: Record<string, unknown> = {};
      if (parse.data.kind) data.kind = kindToEnum(parse.data.kind);
      if (parse.data.label !== undefined) data.label = parse.data.label;
      if (parse.data.details !== undefined) data.details = parse.data.details;

      const updated = await db.userContext.update({
        where: { id: request.params.id },
        data,
      });
      return reply.send({
        context: {
          id: updated.id,
          kind: kindFromEnum(updated.kind),
          label: updated.label,
          details: updated.details,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/user/context/:id — remove a fact.
  // ---------------------------------------------------------------------------
  fastify.delete<{ Params: { id: string } }>(
    "/v1/user/context/:id",
    async (request, reply) => {
      const userId = request.userId;
      const owned = await db.userContext.findFirst({
        where: { id: request.params.id, userId },
        select: { id: true },
      });
      if (!owned) {
        return reply.code(404).send({ error: "context_not_found" });
      }
      await db.userContext.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );
}
