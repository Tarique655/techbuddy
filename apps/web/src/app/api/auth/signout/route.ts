import { NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth-proxy";

/**
 * POST /api/auth/signout
 *
 * Clear the `tb_session` cookie. We don't bump the user's tokenVersion
 * server-side (that would be sign-out-EVERYWHERE, which we may want to
 * add later as an explicit option but isn't the default for "sign out
 * of this browser"). The JWT remains technically valid until its exp;
 * clearing the cookie is enough to log this device out.
 *
 * Trade-off worth knowing: a copy of the JWT exfiltrated before signout
 * would still work for the rest of its TTL. The HttpOnly + Secure +
 * SameSite cookie attributes make exfiltration extremely hard from a
 * browser context, but if it happened, true revocation requires
 * tokenVersion bumps. For "sign out everywhere" specifically, we'd add
 * a separate UI + endpoint that bumps tokenVersion via the API. Out of
 * scope for Stage C.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
