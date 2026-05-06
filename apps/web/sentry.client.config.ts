// Sentry browser-side initialization. Loaded by Next.js automatically
// before the first React render in the client bundle. Must be at the
// project root (NOT under src/) for @sentry/nextjs to find it.
//
// What lands in Sentry from this:
//   - Unhandled errors and promise rejections in the browser
//   - Manual `Sentry.captureException(...)` / `Sentry.captureMessage(...)`
//   - Performance traces for page navigations and fetches (sampled)
//
// Privacy: same posture as the mobile app — sendDefaultPii is false so
// IP addresses, cookies, and user identifiers are NOT auto-attached.
// Anything we want Sentry to know we attach explicitly via tags / extras.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 100% of errors but only 10% of transactions while volume is
  // tiny — generous enough to debug, cheap enough to stay in free tier
  // for now. Tune down as the family portal grows.
  tracesSampleRate: 0.1,

  // Privacy-first defaults. See sentry.server.config.ts for the same
  // posture on the server side.
  sendDefaultPii: false,

  // Skip Sentry entirely when the DSN env var isn't set — keeps local
  // dev quiet without forcing every contributor to set it up.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  // Don't ship debug logs to Sentry's console in production builds.
  debug: false,
});
