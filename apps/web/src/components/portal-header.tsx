"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth-context";

/**
 * Shared header for all authenticated portal pages. Brand on the left,
 * sign-out (which just wipes localStorage) on the right.
 *
 * No nav menu yet — there's only one screen worth navigating to. Add a
 * proper nav once the portal grows past dashboard + senior detail.
 */
export function PortalHeader() {
  const router = useRouter();
  const { user, clearUser } = useAuth();

  function handleSignOut() {
    clearUser();
    router.replace("/");
  }

  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/dashboard" className="block">
          <p className="text-xs font-bold tracking-widest text-brand">
            TECHBUDDY
          </p>
          <p className="text-sm text-muted -mt-0.5">Family Portal</p>
        </Link>

        {user ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Sign out
          </button>
        ) : null}
      </div>
    </header>
  );
}
