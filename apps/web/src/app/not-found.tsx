import Link from "next/link";

/**
 * App-level 404 page. Triggered when a route doesn't match anything,
 * or when a server component calls `notFound()` (e.g. seniors/[id] for
 * an id that doesn't exist).
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-bold tracking-widest text-brand mb-2">
          TECHBUDDY
        </p>
        <h1 className="text-2xl font-bold text-ink mb-2">
          We couldn't find that page
        </h1>
        <p className="text-muted leading-relaxed mb-6">
          The link you followed may have moved, or the page no longer
          exists. From here, head back to your dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block bg-brand hover:bg-brand-dark text-white font-semibold py-3 px-6 rounded-xl"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
