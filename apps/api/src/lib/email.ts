/**
 * Transactional email — verification links, password resets.
 *
 * Provider: Resend. This was already the intended provider per
 * FAMILY_PORTAL.md's v2 backlog ("real auth (magic links via Resend, or
 * password)"). See ACCOUNTS_AND_PREMIUM_PLAN.md §2.4.
 *
 * Dev fallback: if RESEND_API_KEY isn't set (local dev, CI), we log the
 * email to the console instead of sending — so `pnpm dev:api` works
 * without provisioning a Resend account. Production requires the key
 * (enforced by env.ts's superRefine, same pattern as JWT_SECRET).
 */
import { Resend } from "resend";

import { env } from "./env.js";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Some senior-facing email clients render this by
   *  default; always provide it rather than relying on HTML-only. */
  text: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  if (!resend) {
    // Dev-mode no-op. Loud enough in the console to actually notice.
    console.log(
      `\n📧 [dev email — RESEND_API_KEY not set, not actually sent]\n` +
        `   To: ${input.to}\n` +
        `   Subject: ${input.subject}\n` +
        `   ---\n${input.text}\n   ---\n`
    );
    return;
  }

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  if (result.error) {
    // Surface as a real error so the caller's route handler can decide
    // how to respond (e.g. signup should still succeed even if the
    // verification email fails to send — don't block account creation
    // on an email provider hiccup).
    throw new Error(`Resend send failed: ${result.error.message}`);
  }
}

// =============================================================================
// Specific email templates
// =============================================================================
// Kept deliberately plain — large, simple, one clear link. Same "no jargon,
// one thing per screen" spirit as the in-app senior UX, applied to email.

export async function sendVerificationEmail(
  to: string,
  name: string,
  verifyUrl: string
): Promise<void> {
  await sendEmail({
    to,
    subject: "Confirm your TechBuddy email",
    text: `Hi ${name},\n\nPlease confirm your email address for TechBuddy by opening this link:\n\n${verifyUrl}\n\nThis link works for 24 hours. If you didn't create a TechBuddy account, you can ignore this email.\n`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Please confirm your email address for TechBuddy by clicking the button below.</p><p><a href="${verifyUrl}" style="display:inline-block;padding:14px 24px;background:#2A6CF6;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Confirm my email</a></p><p>This link works for 24 hours. If you didn't create a TechBuddy account, you can ignore this email.</p>`,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string
): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your TechBuddy password",
    text: `Hi ${name},\n\nWe got a request to reset your TechBuddy password. Open this link to choose a new one:\n\n${resetUrl}\n\nThis link works for 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.\n`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>We got a request to reset your TechBuddy password.</p><p><a href="${resetUrl}" style="display:inline-block;padding:14px 24px;background:#2A6CF6;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">Choose a new password</a></p><p>This link works for 1 hour. If you didn't ask for this, you can ignore this email — your password won't change.</p>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
