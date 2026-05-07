"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { acceptFamilyInvite } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatApiError } from "@/lib/format-api-error";

/**
 * Landing page: a family member arrives here with a 6-digit invite code
 * the senior gave them. They type the code, their own name, and an
 * optional label for the senior ("Mom", "Grandpa Joe"). On submit we
 * POST to /api/family/accept (Next route handler) which proxies to the
 * Fastify API, sets the `tb_session` HttpOnly cookie on the Vercel
 * origin, and returns the user JSON. We sync that to in-memory state
 * and redirect to the dashboard.
 *
 * If the family member is already signed in (cookie valid), the auth
 * context's hydration pass sets `user` after /api/auth/me resolves and
 * we redirect to the dashboard automatically.
 */
export default function LandingPage() {
  const router = useRouter();
  const { user, setUser, ready } = useAuth();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already-authed family members shouldn't land here. Redirect after
  // hydration so we don't briefly show the form on every dashboard refresh.
  useEffect(() => {
    if (ready && user) {
      router.replace("/dashboard");
    }
  }, [ready, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmedCode = code.replace(/\D/g, "");
    const trimmedName = name.trim();
    const trimmedLabel = label.trim();

    if (trimmedCode.length !== 6) {
      setError("That code should be 6 digits.");
      return;
    }
    if (trimmedName.length === 0) {
      setError("Please enter your name.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await acceptFamilyInvite({
        code: trimmedCode,
        name: trimmedName,
        label: trimmedLabel || undefined,
      });
      setUser(res.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(formatApiError(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="text-sm font-bold tracking-widest text-brand mb-2">
            TECHBUDDY
          </p>
          <h1 className="text-3xl font-bold text-ink mb-3">
            Family Portal
          </h1>
          <p className="text-muted leading-relaxed">
            See how Buddy is helping the senior in your life. Enter the
            6-digit code they shared with you to get started.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-sm border border-line p-6 space-y-5"
        >
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Invite code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              maxLength={6}
              className="w-full px-4 py-3 text-2xl tracking-widest text-center font-bold text-ink bg-brand-tint border-2 border-transparent focus:border-brand focus:outline-none rounded-xl"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              Your name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah"
              className="w-full px-4 py-2.5 text-base text-ink bg-brand-tint border-2 border-transparent focus:border-brand focus:outline-none rounded-xl"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label
              htmlFor="label"
              className="block text-sm font-semibold text-ink mb-1.5"
            >
              What do you call them?{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Mom, Dad, Grandpa Joe"
              className="w-full px-4 py-2.5 text-base text-ink bg-brand-tint border-2 border-transparent focus:border-brand focus:outline-none rounded-xl"
              disabled={submitting}
            />
            <p className="text-xs text-muted mt-1.5">
              Only you see this. The senior won't.
            </p>
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-brand hover:bg-brand-dark disabled:bg-brand/40 transition-colors text-white font-semibold py-3 rounded-xl"
          >
            {submitting ? "Connecting…" : "Continue"}
          </button>
        </form>

        <p className="text-center text-sm text-muted mt-6">
          Don't have a code? Ask the senior to open TechBuddy on their phone,
          go to <span className="font-semibold">Settings → Invite a family member</span>.
        </p>
      </div>
    </main>
  );
}
