// Sentry initialization for the Node runtime — used by Next.js server
// components, API routes (we don't have any), and middleware. Loaded
// from instrumentation.ts when the server boots.
//
// We don't have any server-side code that calls our API today (all
// fetches are client-side), but the runtime catches errors thrown in
// server components and during page rendering. Worth wiring up so
// SSR-time issues land somewhere visible.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  // Same privacy posture as the client.
  sendDefaultPii: false,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  debug: false,
});
