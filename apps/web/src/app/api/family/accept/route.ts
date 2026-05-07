import { NextResponse, type NextRequest } from "next/server";

import { API_URL, setSessionCookie } from "@/lib/auth-proxy";

/**
 * POST /api/family/accept
 *
 * Forwards the invite-acceptance flow to the Fastify API. The API mints
 * a JWT and ALSO sets its own cookie on the Render origin, but that
 * cookie is cross-site from the browser's perspective and would never
 * get sent back. We ignore the API's Set-Cookie, take the `token` from
 * the JSON response, and set OUR cookie on the Vercel origin instead.
 * The browser sees a first-party cookie; the JWT is server-side only.
 *
 * The client (apps/web/src/app/page.tsx) calls this with `{ code, name,
 * label? }`. We return `{ user, link }` (no token) — the client never
 * sees the JWT.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const upstream = await fetch(`${API_URL}/v1/family/accept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Carry the Origin through so the API can decide whether to set
      // its own (Render-origin) cookie. We ignore that cookie ourselves,
      // but the API's logic depends on the header to choose audience
      // (web vs mobile) for the minted token.
      Origin: request.headers.get("origin") ?? "",
    },
    body: JSON.stringify(body),
  });

  // Pass through whatever the API decided (200/201/4xx/etc).
  const upstreamText = await upstream.text();
  let parsed: { token?: string; user?: unknown; link?: unknown } | null = null;
  try {
    parsed = upstreamText ? JSON.parse(upstreamText) : null;
  } catch {
    // Non-JSON body — pass through verbatim with the API's status.
    return new NextResponse(upstreamText, {
      status: upstream.status,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (!upstream.ok || !parsed) {
    return NextResponse.json(parsed ?? { error: "upstream_error" }, {
      status: upstream.status,
    });
  }

  const { token, user, link } = parsed;
  if (!token || typeof token !== "string") {
    // Shouldn't happen — Stage A's family.ts always returns a token.
    // Defensive: fail closed rather than logging the user in via cookie
    // we can't set.
    return NextResponse.json(
      { error: "missing_token" },
      { status: 502 }
    );
  }

  const response = NextResponse.json(
    { user, link },
    { status: upstream.status }
  );
  setSessionCookie(response, token);
  return response;
}
