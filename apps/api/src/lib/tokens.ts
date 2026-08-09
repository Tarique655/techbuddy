/**
 * Random tokens for email verification + password reset links.
 *
 * The RAW token is what goes in the email link and is shown to the user
 * exactly once. We only ever persist its SHA-256 hash (see
 * EmailVerificationToken / PasswordResetToken in schema.prisma) — same
 * reasoning as never storing a plaintext password: a DB leak alone
 * shouldn't hand out working reset links.
 */
import { randomBytes, createHash } from "node:crypto";

/** Generate a fresh, URL-safe random token. 32 bytes → 43-char base64url. */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministic hash of a raw token, for storage/lookup. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Email verification links are valid for 24 hours. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Password reset links are valid for 1 hour — shorter than verification
 * because a live reset link is a stronger credential (it directly grants
 * account takeover, not just "confirms you own this inbox").
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
