/**
 * App-level loading UI shown by Next while a route segment is being
 * fetched. Replaces the per-page "Loading…" cards. Tiny skeleton —
 * the family portal pages are quick to render once data arrives.
 */
export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-muted text-sm" role="status" aria-live="polite">
        Loading…
      </div>
    </div>
  );
}
