/**
 * Password hashing — bcryptjs, deliberately NOT `bcrypt` or `argon2`.
 *
 * Both of those compile a native addon per-platform. We already have a
 * live scar from exactly that class of bug: TECH_DEBT.md's Sentry
 * source-map saga, where a Windows-generated lockfile didn't lock the
 * Linux variant of `@sentry/cli` and broke EAS builds — unresolved after
 * two fix attempts. This API is built on Windows (Tariq's dev machine) and
 * deployed to Render's Linux containers; a native bcrypt binding is the
 * same footgun with a login-blocking blast radius instead of a cosmetic
 * one. `bcryptjs` is pure JS — slower than the native libraries, which is
 * irrelevant at this user count, and the right trade for never debugging
 * a platform-mismatched binary again. See ACCOUNTS_AND_PREMIUM_PLAN.md §2.2.
 */
import bcrypt from "bcryptjs";

// 12 rounds is bcrypt's commonly-recommended default in 2026 — a good
// balance of brute-force resistance vs. per-request cost on Render's free
// tier. Revisit upward only if login p95 latency becomes a problem (it
// won't, at this scale — hashing runs once per login, not per request).
const SALT_ROUNDS = 12;

/** Hash a plaintext password for storage in `User.passwordHash`. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash. Returns false (never
 * throws) on any mismatch or malformed hash — callers should treat that
 * identically to "wrong password" for the response they send.
 */
export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * Minimum password policy. Kept intentionally light — length over
 * complexity rules, which are a well-documented usability trap (forcing
 * symbols/numbers pushes people toward predictable substitutions, not
 * stronger passwords) and especially hostile to the senior demographic.
 * A senior-friendly password hint in the UI should say "8 or more
 * characters" and nothing else.
 */
export function isPasswordAcceptable(plain: string): boolean {
  return typeof plain === "string" && plain.length >= 8 && plain.length <= 128;
}
