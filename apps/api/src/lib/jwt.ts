/**
 * JWT minting + verification.
 *
 * Centralizes the claim shape so the rest of the codebase (auth pre-handler,
 * /v1/auth/exchange, /v1/auth/refresh, /v1/users, /v1/family/accept) can't
 * drift on what's inside a token. Treat the JWT as opaque outside this file.
 *
 * Algorithm: HS256 with the env's JWT_SECRET. See JWT_MIGRATION_PLAN.md §1
 * for the design rationale (single signer/verifier, JWT_SECRET already
 * plumbed, jose-compatible for the web Edge middleware later).
 */
import jwt from "jsonwebtoken";

import { env } from "./env.js";

// =============================================================================
// Token shape
// =============================================================================

/** Surfaces a token can be issued for. Encoded as the `aud` claim. */
export type AuthAudience = "techbuddy-mobile" | "techbuddy-web";

/** Roles match the Prisma UserRole enum (lowercased on the wire). */
export type AuthRole = "senior" | "family" | "technician";

/** Per-surface TTLs. Mobile is long because re-onboarding is high friction
 *  for the senior demographic; web is shorter because browsers are more
 *  porous than mobile keychains. Both surfaces use sliding renewal — see
 *  shouldRenew() below. */
const TTL_BY_AUDIENCE: Record<AuthAudience, number> = {
  "techbuddy-mobile": 60 * 24 * 60 * 60, // 60 days, in seconds
  "techbuddy-web": 7 * 24 * 60 * 60, //  7 days, in seconds
};

/** Bumped only when we change the claim shape. Verifier accepts older
 *  versions during a transition; sign always uses the current version. */
const CURRENT_PAYLOAD_VERSION = 1;

/**
 * The decoded JWT payload. `sub` is the user id, `tv` is the per-user
 * tokenVersion (bumped to revoke), `aud` distinguishes mobile from web.
 * `v` is the payload schema version, NOT to be confused with `tv`.
 *
 * `iat` / `exp` are seconds-since-epoch per the JWT spec.
 */
export interface AuthTokenPayload {
  sub: string;
  role: AuthRole;
  tv: number;
  iat: number;
  exp: number;
  iss: string;
  aud: AuthAudience;
  v: number;
}

// =============================================================================
// Mint
// =============================================================================

export interface SignAuthTokenInput {
  userId: string;
  role: AuthRole;
  tokenVersion: number;
  audience: AuthAudience;
}

/**
 * Mint a fresh access token. Caller is responsible for having looked up
 * the user's current tokenVersion before calling — embedding a stale `tv`
 * would defeat the revocation mechanism.
 *
 * Returns the encoded JWT string. The caller decides how to deliver it
 * (response body, cookie, response header).
 */
export function signAuthToken(input: SignAuthTokenInput): string {
  const ttlSec = TTL_BY_AUDIENCE[input.audience];
  return jwt.sign(
    {
      sub: input.userId,
      role: input.role,
      tv: input.tokenVersion,
      v: CURRENT_PAYLOAD_VERSION,
    },
    env.JWT_SECRET_EFFECTIVE,
    {
      algorithm: "HS256",
      issuer: env.JWT_ISSUER,
      audience: input.audience,
      expiresIn: ttlSec,
    }
  );
}

// =============================================================================
// Verify
// =============================================================================

/**
 * Verify a token. Returns the decoded payload on success, null on any
 * failure (bad signature, expired, malformed, unknown issuer/audience).
 *
 * Does NOT check the `tv` claim against the database — that's the
 * pre-handler's job, after this returns. Reason: we want this function
 * to be pure (no DB I/O) so it's trivially safe to call from anywhere.
 */
export function verifyAuthToken(rawJwt: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(rawJwt, env.JWT_SECRET_EFFECTIVE, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
      // Accept either audience here; the route or pre-handler can
      // narrow further if it needs to (e.g. "this endpoint is mobile-only").
      audience: ["techbuddy-mobile", "techbuddy-web"],
    });

    // jsonwebtoken returns `string | JwtPayload` because verify can
    // technically decode signed strings. We always sign objects, so a
    // string here means somebody minted a token with an older format.
    // Reject it.
    if (typeof decoded !== "object" || decoded === null) return null;

    // Narrow to the shape we expect. Defensive — a malformed token that
    // somehow passed signature verification (e.g. shared secret leaked
    // and a third party signed something unexpected) shouldn't crash.
    if (
      typeof decoded.sub !== "string" ||
      typeof decoded.role !== "string" ||
      typeof decoded.tv !== "number" ||
      typeof decoded.iat !== "number" ||
      typeof decoded.exp !== "number" ||
      typeof decoded.iss !== "string" ||
      typeof decoded.aud !== "string" ||
      typeof decoded.v !== "number"
    ) {
      return null;
    }

    if (
      decoded.role !== "senior" &&
      decoded.role !== "family" &&
      decoded.role !== "technician"
    ) {
      return null;
    }

    if (
      decoded.aud !== "techbuddy-mobile" &&
      decoded.aud !== "techbuddy-web"
    ) {
      return null;
    }

    return decoded as AuthTokenPayload;
  } catch {
    // Bad signature, expired, malformed JSON, etc. We don't want
    // detailed error reasons leaking to clients — pre-handler maps
    // null → 401 with a generic message.
    return null;
  }
}

// =============================================================================
// Sliding renewal
// =============================================================================

/**
 * Returns true when the given (still-valid) payload has used more than
 * 50% of its TTL. The pre-handler uses this to decide whether to mint a
 * fresh token and ride it back on the response — keeping active users
 * logged in indefinitely without a separate refresh endpoint.
 *
 * Pure function of the payload's `iat` / `exp`; no clock dependency
 * beyond Date.now(). Returns false on a token that's still in its first
 * half (don't burn cycles re-signing tokens that are already fresh).
 */
export function shouldRenew(payload: AuthTokenPayload): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  const halfwayPoint = issuedAt + Math.floor((expiresAt - issuedAt) / 2);
  return nowSec >= halfwayPoint;
}
