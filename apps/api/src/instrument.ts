/**
 * Sentry initialization. MUST be imported first in server.ts — before
 * Fastify or anything else — so Sentry's auto-instrumentation can hook
 * Node's HTTP layer before the framework loads.
 *
 * Reads SENTRY_DSN from process.env. If unset (e.g. local dev), Sentry
 * silently no-ops; nothing else in the app cares.
 */

// Anthropic SDK requires its Node shims to be registered before *anything*
// else from @anthropic-ai/sdk loads. Normally the SDK's main entry registers
// them automatically via side-effect — but Sentry's `--import` runs early
// auto-instrumentation that hooks module loading and can pull SDK internals
// (core.mjs) out of order, triggering "you must import shims/node" errors.
//
// Importing shims here, before Sentry, guarantees they're registered first.
import "@anthropic-ai/sdk/shims/node";

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
  // Print to stdout so Render logs confirm Sentry actually initialized.
  // We only print the trailing project-id chunk so we don't leak the
  // public key portion (DSNs are technically not secrets but no reason
  // to splash them in logs).
  // eslint-disable-next-line no-console
  console.log(
    `[sentry] initialized — env=${process.env.NODE_ENV ?? "development"}, dsn ends in ...${dsn.slice(-16)}`
  );
} else {
  // eslint-disable-next-line no-console
  console.log("[sentry] SENTRY_DSN not set — skipping init (events will not be sent)");
}
