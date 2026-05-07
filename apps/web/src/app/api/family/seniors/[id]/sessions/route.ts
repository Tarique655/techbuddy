import { NextResponse, type NextRequest } from "next/server";

import { API_URL, getSessionToken, setSessionCookie } from "@/lib/auth-proxy";

/**
 * GET /api/family/seniors/[id]/sessions
 *
 * Proxy to GET /v1/family/seniors/:id/sessions on the Fastify API.
 * The path param is forwarded URL-encoded; the API does the
 * authorization check (this family member must be linked to this
 * senior) and returns 404 on cross-account attempts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = getSessionToken(request);
  if (!token) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id.length === 0) {
    return NextResponse.json(
      { error: "invalid_request", message: "senior id required" },
      { status: 400 }
    );
  }

  const upstream = await fetch(
    `${API_URL}/v1/family/seniors/${encodeURIComponent(id)}/sessions`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

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
