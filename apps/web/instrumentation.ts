// Next.js instrumentation hook — runs once when the server starts.
// Used here to load the right Sentry config for the active runtime.
//
// Required for @sentry/nextjs in the App Router; without this, server
// components and middleware that throw don't reach Sentry.
//
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Catch errors thrown during a request and forward them to Sentry.
// Without this hook, Next swallows some classes of server-side errors
// rather than bubbling them to our error boundary.
import * as Sentry from "@sentry/nextjs";
export const onRequestError = Sentry.captureRequestError;
