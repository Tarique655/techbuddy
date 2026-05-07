/**
 * Edge middleware: gate authenticated routes behind a valid `tb_session`
 * cookie. Anything matched by `config.matcher` below runs through here
 * before the page or route handler resolves.
 *
 * Behavior:
 *   - Cookie missing OR signature invalid OR expired → 302 to `/`.
 *   - Cookie valid → request flows through to the page/route handler.
 *
 * What this does NOT do:
 *   - Validate the token's `tv` claim against the database. Edge can't
 *     reach Prisma; that's the Fastify pre-handler's job (route handlers
 *     in app/api/ forward the JWT as Bearer, so revocation enforcement
 *     happens server-side at the actual data fetch).
 *   - Check role. We don't have role-segmented routes today — every
 *     authenticated route is equally accessible to family/senior/tech
 *     accounts. Add role checks here when that changes.
 *
 * The matcher deliberately EXCLUDES /api/* — the route handlers under
 * app/api/ have their own cookie-reading logic (some of them, like
 * /api/family/accept and /api/auth/migrate, are unauthenticated by
 * design). Letting middleware gate them would block the migration path.
 */
import { NextResponse, type NextRequest } from "next/server";

import { verifyTbSession } from "./lib/jwt-verify";

export async function middleware(request: NextRequest) {
  const cookie = request.cookies.get("tb_session")?.value;
  if (!cookie) {
    return redirectToLanding(request);
  }

  const payload = await verifyTbSession(cookie);
  if (!payload) {
    return redirectToLanding(request);
  }

  return NextResponse.next();
}

function redirectToLanding(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = ""; // strip query so we don't echo eg. ?next=...
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/seniors/:path*",
  ],
};
