import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";

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
  // Captures explicitly + flushes before throwing. We don't rely solely on
  // Sentry.setupFastifyErrorHandler here because:
  //   1. We want to confirm the manual capture path works.
  //   2. flush() guarantees the event ships before the response goes out
  //      — useful in environments where the process might be paused/
  //      slept right after the response (Render free tier in particular).
  //
  // Use for:
  //   curl -H "X-User-Id: <id>" https://techbuddy-api.onrender.com/v1/debug/sentry-test
  fastify.get("/v1/debug/sentry-test", async (request, reply) => {
    const message = `TechBuddy backend Sentry test — user ${request.userId} at ${new Date().toISOString()}`;
    const err = new Error(message);

    const eventId = Sentry.captureException(err, {
      tags: { kind: "backend-diagnostic" },
      extra: { userId: request.userId },
    });

    // 2-second flush window. If this returns false, Sentry didn't manage
    // to send the event — useful diagnostic info.
    const flushed = await Sentry.flush(2000);

    // Don't throw — we want to return the diagnostic state to the caller
    // so we can see at-a-glance whether capture+flush succeeded.
    return reply.code(500).send({
      statusCode: 500,
      error: "Internal Server Error",
      message,
      sentry: {
        captured: Boolean(eventId),
        eventId: eventId ?? null,
        flushed,
      },
    });
  });
}
