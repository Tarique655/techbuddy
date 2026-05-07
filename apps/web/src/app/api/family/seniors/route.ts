import { NextResponse, type NextRequest } from "next/server";

import { API_URL, getSessionToken, setSessionCookie } from "@/lib/auth-proxy";

/**
 * GET /api/family/seniors
 *
 * Proxy to GET /v1/family/seniors on the Fastify API. Reads the JWT out
 * of the `tb_session` cookie, forwards as Bearer.
 *
 * No middleware coverage on /api/* (see middleware.ts comment), so
 * this handler must do its own "no cookie → 401" gating.
 */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const upstream = await fetch(`${API_URL}/v1/family/seniors`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const text = await upstream.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return new NextResponse(text, { status: upstream.status });
  }

  const response = NextResponse.json(parsed, { status: upstream.status });
  const renewed = upstream.headers.get("X-Renewed-Token");
  if (renewed && upstream.ok) setSessionCookie(response, renewed);
  return response;
}
