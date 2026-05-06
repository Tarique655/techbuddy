"use client";

import { useEffect } from "react";

/**
 * App-level error boundary for the family portal. Triggered when a
 * server component throws OR when a client component throws above the
 * route segment. Renders a calm "something broke" with a Try Again
 * button (Next provides `reset`).
 *
 * Deliberately NOT showing the raw error message to the user — could
 * leak API URLs or stack frames. Logged to console for now; when
 * Sentry is wired up on the web side, captureException(error) here.
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    // TODO: when @sentry/nextjs is added, replace with Sentry.captureException(error).
    console.error("[web/error-boundary]", error.message, error.digest);
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
