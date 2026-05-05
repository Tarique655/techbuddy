"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import {
  listLinkedSeniors,
  listSeniorSessions,
  type LinkedSenior,
  type SeniorSession,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  deviceLabel,
  routeLabel,
  statusLabel,
  statusTone,
  timeAgo,
  urgencyLabel,
  urgencyTone,
} from "@/lib/formatters";
import { PortalHeader } from "@/components/portal-header";

/**
 * Per-senior page: chronological list of help sessions with the AI-
 * generated summary inline for each. The summary tells the family
 * what was wrong, how urgent it was, and where the system thought it
 * should go (AI / human / both). No raw transcripts — that's a
 * deliberate v1 privacy choice.
 *
 * Resolves the senior's display name by also calling listLinkedSeniors
 * on this page; small extra request, keeps the URL link-shareable
 * without additional state plumbing from the dashboard.
 */
export default function SeniorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const seniorUserId = params?.id ?? "";
  const { user, ready } = useAuth();

  const [sessions, setSessions] = useState<SeniorSession[] | null>(null);
  const [seniors, setSeniors] = useState<LinkedSenior[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bounce unauthed visitors.
  useEffect(() => {
    if (ready && !user) {
      router.replace("/");
    }
  }, [ready, user, router]);

  // Parallel fetch: sessions (the main payload) + linked seniors (just to
  // resolve the display name for the header). Both are cheap.
  useEffect(() => {
    if (!user || !seniorUserId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listSeniorSessions(seniorUserId),
      listLinkedSeniors(),
    ])
      .then(([sessionRows, seniorRows]) => {
        if (cancelled) return;
        setSessions(sessionRows);
        setSeniors(seniorRows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Couldn't load.";
        setError(msg.replace(/^Request failed \(\d+\):\s*/, ""));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, seniorUserId]);

  const senior = useMemo(
    () => seniors?.find((s) => s.seniorUserId === seniorUserId) ?? null,
    [seniors, seniorUserId]
  );

  if (!ready || !user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <PortalHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-brand hover:text-brand-dark inline-flex items-center mb-4"
        >
          ← Back to dashboard
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">
            {senior?.label ?? senior?.name ?? "Senior"}
          </h1>
          {senior?.label && senior.name !== senior.label ? (
            <p className="text-muted">{senior.name}</p>
          ) : null}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-line p-8 text-center text-muted">
            Loading sessions…
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-danger">
            <p className="font-semibold mb-1">Couldn't load sessions</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : sessions && sessions.length > 0 ? (
          <ul className="space-y-4">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="bg-white rounded-2xl border border-line p-5"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-base font-semibold text-ink">
                      {deviceLabel(s.device)} help
                    </p>
                    <p className="text-sm text-muted">
                      {timeAgo(s.startedAt)} ·{" "}
                      {s.messageCount} message
                      {s.messageCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${statusTone(s.status)}`}
                  >
                    {statusLabel(s.status)}
                  </span>
                </div>

                {s.summary ? (
                  <div className="border-t border-line pt-4 space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                        What was happening
                      </p>
                      <p className="text-ink leading-relaxed">
                        {s.summary.problem}
                      </p>
                    </div>

                    {s.summary.goal ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                          What they wanted
                        </p>
                        <p className="text-ink leading-relaxed">
                          {s.summary.goal}
                        </p>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${urgencyTone(s.summary.urgency)}`}
                      >
                        {urgencyLabel(s.summary.urgency)}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-tint text-brand">
                        {routeLabel(s.summary.recommendRoute)}
                      </span>
                      {s.summary.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-line pt-4">
                    <p className="text-sm text-muted italic">
                      Buddy hasn't generated a summary for this session yet —
                      it usually appears after a few back-and-forths.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-white rounded-2xl border border-line p-8 text-center">
            <p className="text-ink font-semibold mb-1">
              No help sessions yet.
            </p>
            <p className="text-sm text-muted">
              When they ask Buddy for help, sessions will appear here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
