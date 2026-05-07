import { NextResponse, type NextRequest } from "next/server";

import { API_URL, getSessionToken, setSessionCookie } from "@/lib/auth-proxy";

/**
 * GET /api/auth/me
 *
 * Return the current user, or 401 if not signed in. Used by the auth
 * context's hydration effect — replaces the old localStorage read.
 *
 * Forwards `Authorization: Bearer <jwt>` to the Fastify API's
 * /v1/users/me. The API's pre-handler does the full validation
 * (signature + tokenVersion + user existence). We mirror its 401
 * back so the client can route to / when the cookie's been revoked.
 *
 * If the upstream response carries `X-Renewed-Token` (sliding renewal
 * fired), refresh the cookie before returning. Same pattern as the
 * mobile renewal handling in apps/mobile/lib/api.ts.
 */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return NextResponse.json(
      { error: "no_session" },
      { status: 401 }
    );
  }

  const upstream = await fetch(`${API_URL}/v1/users/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return new NextResponse(text, { status: upstream.status });
  }

  const response = NextResponse.json(parsed, { status: upstream.status });

  // If the API renewed the token, write the new one to the cookie. Same
  // semantics as on mobile: silent rotation keeps active users signed
  // in indefinitely without a separate refresh flow.
  const renewed = upstream.headers.get("X-Renewed-Token");
  if (renewed && upstream.ok) {
    setSessionCookie(response, renewed);
  }

  return response;
}
