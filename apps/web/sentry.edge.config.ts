// Sentry initialization for the Edge runtime (used by Next middleware
// and any future Edge route handlers). We don't have any edge code
// today but Next.js loads this file unconditionally — leaving it as
// a no-op-friendly init so we're covered the moment we add middleware
// (e.g. when auth migration lands).

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  sendDefaultPii: false,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  debug: false,
});
