import type { FastifyInstance } from "fastify";

/**
 * Debug routes — used to verify external instrumentation (Sentry today,
 * possibly other monitoring later).
 *
 * These are auth-gated by the X-User-Id pre-handler in lib/auth.ts. Anyone
 * with a valid user id can trigger a Sentry event from here, which is fine
 * — the worst-case is a small amount of Sentry noise, and we'd rather have
 * a quick way to verify the pipeline than gate this further.
 *
 * If we ever want a stricter gate (e.g., for prod-only smoke tests), add a
 * `DEBUG_SECRET` env var and require it as a query param.
 */
export async function debugRoutes(fastify: FastifyInstance): Promise<void> {
  // Throws an error that Sentry's Fastify integration will catch and ship
  // to the dashboard. Use for:
  //   curl -H "X-User-Id: <id>" https://techbuddy-api.onrender.com/v1/debug/sentry-test
  fastify.get("/v1/debug/sentry-test", async (request) => {
    throw new Error(
      `TechBuddy backend Sentry test — user ${request.userId} at ${new Date().toISOString()}`
    );
  });
}
