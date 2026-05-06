"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * App-level error boundary for the family portal. Triggered when a
 * server component throws OR when a client component throws above the
 * route segment. Renders a calm "something broke" with a Try Again
 * button (Next provides `reset`).
 *
 * Deliberately NOT showing the raw error message to the user — could
 * leak API URLs or stack frames. The error goes to Sentry (along with
 * Next's `digest` correlation id) so we can debug from the dashboard.
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "app-root", surface: "family-portal" },
      // The digest is a Next-generated id we can grep for in server
      // logs to correlate with the same render that produced this
      // client-side error fallback.
      extra: error.digest ? { nextDigest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold text-ink mb-2">
          Something went wrong
        </h1>
        <p className="text-muted leading-relaxed mb-6">
          Sorry — the page hit an error loading. You can try again, or
          come back in a moment.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-brand hover:bg-brand-dark text-white font-semibold py-3 px-6 rounded-xl"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
