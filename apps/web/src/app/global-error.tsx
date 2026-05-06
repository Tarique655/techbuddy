"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Top-most error boundary for the family portal. Triggered when an error
 * happens inside the root layout itself or anywhere `error.tsx` can't
 * catch (errors above the route segment that owns the per-route boundary).
 *
 * Required by Next.js App Router for full Sentry coverage — the build
 * warning that pushed us to add this said:
 *   "It seems like you don't have a global error handler set up. It is
 *    recommended that you add a global-error.js file with Sentry
 *    instrumentation so that React rendering errors are reported to
 *    Sentry."
 *
 * Renders its own <html>/<body> because at this level Next has nothing
 * else mounted — error.tsx can rely on the root layout's HTML scaffold,
 * but global-error cannot.
 */
type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: "global", surface: "family-portal" },
      extra: error.digest ? { nextDigest: error.digest } : undefined,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f7f8fc",
          color: "#1a1f2c",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 480, textAlign: "center" }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 2,
              color: "#2A6CF6",
              marginBottom: 8,
              textTransform: "uppercase",
            }}
          >
            TechBuddy
          </p>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#1a1f2c",
              marginBottom: 8,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              color: "#5a6173",
              lineHeight: 1.6,
              marginBottom: 24,
            }}
          >
            Sorry — the page hit an error loading. You can try again, or
            come back in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2A6CF6",
              color: "#FFFFFF",
              fontWeight: 600,
              padding: "12px 24px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
