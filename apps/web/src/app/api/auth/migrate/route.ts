import { NextResponse, type NextRequest } from "next/server";

import { API_URL, setSessionCookie } from "@/lib/auth-proxy";

/**
 * POST /api/auth/migrate
 *
 * One-time migration handler for family-portal users who hold a legacy
 * userId in localStorage from before Stage C shipped. Their auth
 * context calls this on first load, posting `{ userId }`. We exchange
 * it for a JWT via the API's /v1/auth/exchange (allowlisted, web
 * audience), set the cookie, and return the user JSON.
 *
 * On failure (network, API 5xx, user genuinely doesn't exist), we
 * return the upstream status so the client can decide to clear local
 * state and route back to the landing page.
 *
 * After Stage E flips, /v1/auth/exchange returns 410 Gone and this
 * route stops working. The client falls back to "user not signed in"
 * and routes to /, which forces a fresh invite-acceptance flow. That's
 * the correct UX — anyone still on a stale localStorage id at that
 * point hasn't used the portal in 30+ days.
 */
export async function POST(request: NextRequest) {
  let body: { userId?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 }
    );
  }

  if (!body || typeof body.userId !== "string" || body.userId.length === 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "userId required" },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${API_URL}/v1/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: body.userId,
      audience: "techbuddy-web",
    }),
  });

  const upstreamText = await upstream.text();
  let parsed: { token?: string; user?: unknown } | null = null;
  try {
    parsed = upstreamText ? JSON.parse(upstreamText) : null;
  } catch {
    return new NextResponse(upstreamText, { status: upstream.status });
  }

  if (!upstream.ok || !parsed?.token || typeof parsed.token !== "string") {
    return NextResponse.json(parsed ?? { error: "exchange_failed" }, {
      status: upstream.status,
    });
  }

  const response = NextResponse.json(
    { user: parsed.user },
    { status: 200 }
  );
  setSessionCookie(response, parsed.token);
  return response;
}
