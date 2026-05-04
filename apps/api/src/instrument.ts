/**
 * Sentry initialization. MUST be imported first in server.ts — before
 * Fastify or anything else — so Sentry's auto-instrumentation can hook
 * Node's HTTP layer before the framework loads.
 *
 * Reads SENTRY_DSN from process.env. If unset (e.g. local dev), Sentry
 * silently no-ops; nothing else in the app cares.
 */

import "dotenv/config";
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn && dsn.length > 0) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // 10% transaction sampling — keeps free-tier quota healthy while
    // still giving useful performance signals.
    tracesSampleRate: 0.1,
    // Don't send personally-identifying default fields. We'll attach
    // userId via Sentry.setUser per-request inside the chat route if
    // we want to correlate later.
    sendDefaultPii: false,
  });
}
