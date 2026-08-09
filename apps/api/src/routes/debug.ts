import type { FastifyInstance } from "fastify";
import * as Sentry from "@sentry/node";

import { requestTestNotification } from "../lib/appstore.js";

/**
 * Debug routes — used to verify external instrumentation (Sentry today,
 * possibly other monitoring later).
 *
 * These are auth-gated by the Bearer JWT pre-handler in lib/auth.ts (not
 * allowlisted, so any authenticated user — including a throwaway one from
 * POST /v1/users — can hit them). That's fine: worst case is a bit of
 * Sentry noise or an extra Apple test-notification call, and we'd rather
 * have a quick way to verify the pipeline than gate this further.
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
  //   curl -H "Authorization: Bearer <jwt>" https://techbuddy-api.onrender.com/v1/debug/sentry-test
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

  // ---------------------------------------------------------------------------
  // GET /v1/debug/appstore-test-notification
  //
  // Smoke test for the Premium subscription plumbing (ACCOUNTS_AND_PREMIUM_PLAN.md
  // §3). Asks Apple to fire a test notification at our webhook — confirms
  // the App Store Server API credentials, the webhook URL configured in
  // App Store Connect, and JWS verification all work, WITHOUT needing a
  // real sandbox purchase. Check Render logs for the
  // "appstore webhook processed" line after calling this.
  //
  // Use for:
  //   curl -H "Authorization: Bearer <jwt>" https://techbuddy-api.onrender.com/v1/debug/appstore-test-notification
  // ---------------------------------------------------------------------------
  fastify.get("/v1/debug/appstore-test-notification", async (request, reply) => {
    try {
      const token = await requestTestNotification();
      request.log.info({ token }, "appstore test notification requested");
      return reply.send({
        ok: true,
        testNotificationToken: token,
        note: "Apple will POST to /v1/webhooks/appstore shortly — check Render logs.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      request.log.error({ err: message }, "appstore test notification failed");
      return reply.code(500).send({ ok: false, error: message });
    }
  });
}
