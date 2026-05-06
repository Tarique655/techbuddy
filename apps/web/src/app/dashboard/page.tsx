"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  listLinkedSeniors,
  type LinkedSenior,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { deviceLabel, statusLabel, statusTone, timeAgo } from "@/lib/formatters";
import { formatApiError } from "@/lib/format-api-error";
import { PortalHeader } from "@/components/portal-header";

/**
 * Dashboard: list of seniors this family member is linked to.
 *
 * Most family accounts will have exactly one senior linked, but the API
 * is shaped for many — this page handles either gracefully. Each row
 * shows the senior's name, optional family-side label, and a one-liner
 * about their most recent help session (when + device + status).
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  const [seniors, setSeniors] = useState<LinkedSenior[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bounce unauthenticated visitors back to the landing page.
  useEffect(() => {
    if (ready && !user) {
      router.replace("/");
    }
  }, [ready, user, router]);

  // Fetch the seniors list once we know we're authed.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listLinkedSeniors()
      .then((rows) => {
        if (!cancelled) setSeniors(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(formatApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!ready || !user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <PortalHeader />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-ink mb-1">
            Hi {user.name},
          </h1>
          <p className="text-muted">
            Here's how things are going for the people you're connected to.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-line p-8 text-center text-muted">
            Loading…
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-danger">
            <p className="font-semibold mb-1">Couldn't load your dashboard</p>
            <p className="text-sm">{error}</p>
          </div>
        ) : seniors && seniors.length > 0 ? (
          <ul className="space-y-3">
            {seniors.map((s) => (
              <li key={s.seniorUserId}>
                <Link
                  href={`/seniors/${encodeURIComponent(s.seniorUserId)}`}
                  className="block bg-white rounded-2xl border border-line hover:border-brand transition-colors p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-ink truncate">
                        {s.label ?? s.name}
                      </p>
                      {s.label ? (
                        <p className="text-sm text-muted truncate">
                          {s.name}
                        </p>
                      ) : null}
                      {s.lastSession ? (
                        <p className="text-sm text-muted mt-2">
                          Last used Buddy{" "}
                          <span className="text-ink font-medium">
                            {timeAgo(s.lastSession.startedAt)}
                          </span>{" "}
                          for{" "}
                          <span className="text-ink font-medium">
                            {deviceLabel(s.lastSession.device).toLowerCase()}
                          </span>{" "}
                          help
                        </p>
                      ) : (
                        <p className="text-sm text-muted mt-2">
                          No help sessions yet.
                        </p>
                      )}
                    </div>
                    {s.lastSession ? (
                      <span
                        className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${statusTone(s.lastSession.status)}`}
                      >
                        {statusLabel(s.lastSession.status)}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-white rounded-2xl border border-line p-8 text-center">
            <p className="text-ink font-semibold mb-1">
              You're not connected to anyone yet.
            </p>
            <p className="text-sm text-muted">
              Ask the senior to open TechBuddy on their phone, go to{" "}
              <span className="font-medium">
                Settings → Invite a family member
              </span>
              , and share the code with you.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
