/**
 * Server-side helpers shared by the Next.js route handlers under
 * `app/api/*`. Only used in route handlers and middleware — never
 * imported into client components.
 *
 * Path A architecture (see JWT_MIGRATION_PLAN.md §3.3):
 *   - The browser talks to /api/* on the Vercel origin.
 *   - Those route handlers extract the JWT from the first-party
 *     `tb_session` cookie and forward it as `Authorization: Bearer` to
 *     the Fastify API on Render.
 *   - The cookie never leaves the Vercel origin; the JWT itself is
 *     unsealed only on the server. Browser JS can't read either.
 *
 * The Fastify URL still comes from `NEXT_PUBLIC_API_URL` for backwards
 * compatibility with the existing Vercel env config — even though it's
 * read server-side now and could be a private var, leaving it
 * NEXT_PUBLIC_ avoids a Vercel-side migration concurrent with this code
 * change. We can rename it later.
 */
import type { NextRequest, NextResponse } from "next/server";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const SESSION_COOKIE = "tb_session";

/** Apply the `tb_session` cookie to a NextResponse. */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Matches the API's web-aud TTL (lib/jwt.ts:TTL_BY_AUDIENCE).
    // If the two ever drift, the cookie outlives the JWT and the user
    // sees auth failures while the cookie still appears valid in the
    // browser — easy to debug, cheap to fix, but worth noting.
    maxAge: 7 * 24 * 60 * 60,
  });
}

/** Clear the `tb_session` cookie on the response (for sign-out). */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Read the `tb_session` cookie's value, or null if absent. */
export function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}
