import type { FastifyInstance } from "fastify";

import { db } from "./db.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * Authenticated user id, set by the auth pre-handler. Unauthenticated
     * paths (allowlisted below) MUST not read this — it'll be the empty
     * string default from `decorateRequest`.
     */
    userId: string;
  }
}

/**
 * Routes that anyone can hit without an X-User-Id header. Anything else
 * requires a valid header that matches a user row.
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
  return false;
}

/**
 * Register the X-User-Id auth flow. Call once in server.ts before any
 * route registration so the pre-handler covers everything.
 *
 * Security note: this is "device-bound auth" — the mobile client picks a
 * user id (from POST /v1/users) and attaches it to every request. There's
 * no signature, so a malicious client could enumerate ids. UUIDs are
 * unguessable enough for v1 beta; we'll layer a signed JWT on top before
 * any public launch.
 */
export async function registerAuth(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest("userId", "");

  fastify.addHook("preHandler", async (request, reply) => {
    if (isAllowlisted(request.method, request.url)) return;

    const headerVal = request.headers["x-user-id"];
    const userId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (!userId || typeof userId !== "string" || userId.length === 0) {
      return reply.code(401).send({
        error: "user_id_required",
        message: "Missing X-User-Id header.",
      });
    }

    const exists = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) {
      return reply.code(401).send({
        error: "user_not_found",
        message: "Your session is invalid. Please reopen the app.",
      });
    }

    request.userId = userId;
  });
}
