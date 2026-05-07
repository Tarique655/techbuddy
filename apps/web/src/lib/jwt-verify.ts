/**
 * Edge-compatible JWT verifier for the `tb_session` cookie.
 *
 * Used by:
 *   - middleware.ts to gate /dashboard and /seniors/* at the edge
 *   - server route handlers under app/api/* to read the user out of
 *     the cookie before forwarding to the Fastify API
 *
 * `jose` is the only JWT library that works inside Next's Edge runtime;
 * `jsonwebtoken` (which the API uses) relies on Node crypto. The two
 * libraries produce/verify HS256 tokens compatibly — same secret, same
 * algorithm — so the API's token format is interchangeable here.
 *
 * Threat model: this verifier confirms the cookie was signed by us and
 * hasn't expired. It does NOT check tokenVersion against the database
 * (Edge can't reach Prisma). Full revocation enforcement happens on the
 * Fastify side — the route handlers forward the JWT as Bearer, and the
 * API's pre-handler does the tokenVersion check there. So a stale
 * tokenVersion would pass middleware but fail at the actual data fetch.
 * That's acceptable: middleware's job is only "is this user remotely
 * plausibly authenticated"; the API enforces the real policy.
 */
import { jwtVerify, type JWTPayload } from "jose";

// Dev fallback MUST match the API's `DEV_JWT_SECRET` in apps/api/src/lib/env.ts.
// In production, both ends read the same JWT_SECRET env var; in dev the
// fallback lets contributors run the stack without provisioning a secret.
const DEV_JWT_SECRET = "dev-only-jwt-secret-do-not-ship-this-string-anywhere";

const SECRET_BYTES = new TextEncoder().encode(
  process.env.JWT_SECRET ?? DEV_JWT_SECRET
);

const ISSUER = process.env.JWT_ISSUER ?? "techbuddy-api";

export type AuthRole = "senior" | "family" | "technician";

/** Subset of the API's AuthTokenPayload that the web side actually uses. */
export interface TbSessionPayload {
  sub: string;
  role: AuthRole;
  tv: number;
  aud: "techbuddy-web";
  exp: number;
  iat: number;
}

/**
 * Verify a `tb_session` cookie value. Returns the decoded payload on
 * success, null on any failure (bad signature, expired, wrong audience,
 * malformed). Pure — no side effects, no DB hits.
 *
 * Always rejects mobile-aud tokens here — those should never end up in
 * a web cookie. The API only sets `tb_session` on web origins anyway,
 * so this is belt-and-suspenders.
 */
export async function verifyTbSession(
  raw: string
): Promise<TbSessionPayload | null> {
  if (!raw || raw.length === 0) return null;
  try {
    const { payload } = await jwtVerify(raw, SECRET_BYTES, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: "techbuddy-web",
    });

    if (!isTbSessionPayload(payload)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isTbSessionPayload(p: JWTPayload): p is TbSessionPayload & JWTPayload {
  if (typeof p.sub !== "string") return false;
  if (typeof p.tv !== "number") return false;
  if (typeof p.exp !== "number") return false;
  if (typeof p.iat !== "number") return false;
  if (p.role !== "senior" && p.role !== "family" && p.role !== "technician") {
    return false;
  }
  if (p.aud !== "techbuddy-web") return false;
  return true;
}
