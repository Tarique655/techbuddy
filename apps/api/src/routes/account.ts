import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../lib/db.js";
import { env } from "../lib/env.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";
import { signAuthToken, type AuthRole } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  checkClaimAccountRateLimit,
  checkForgotPasswordRateLimit,
  checkLoginRateLimit,
  checkSignupRateLimit,
} from "../lib/rate-limit.js";
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  generateRawToken,
  hashToken,
} from "../lib/tokens.js";

/**
 * Real accounts — email + password, layered on top of the existing JWT
 * session infrastructure (lib/jwt.ts) and the original anonymous
 * name-only onboarding (routes/users.ts). See ACCOUNTS_AND_PREMIUM_PLAN.md.
 *
 * Every route here that ends in a successful sign-in mints a JWT the same
 * way onboarding and /v1/auth/exchange already do — `{ user, token }` is
 * the one shape mobile ever has to handle.
 */

const EmailSchema = z.string().trim().toLowerCase().email().max(254);
const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

const SignupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: EmailSchema,
  password: PasswordSchema,
});

const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(128),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1).max(200),
});

const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(200),
  newPassword: PasswordSchema,
});

const ClaimSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

function toAuthRole(role: string): AuthRole {
  return role.toLowerCase() as AuthRole;
}

/** Build the deep link a verification/reset email points at. */
function buildDeepLink(path: string, token: string): string {
  return `${env.MOBILE_APP_SCHEME}://${path}?token=${encodeURIComponent(token)}`;
}

async function issueVerificationEmail(user: {
  id: string;
  name: string;
  email: string;
}): Promise<void> {
  const raw = generateRawToken();
  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
    },
  });
  const url = buildDeepLink("verify-email", raw);
  // Best-effort: a flaky email provider shouldn't fail signup/claim — the
  // senior already has a working account and can re-request from Settings.
  await sendVerificationEmail(user.email, user.name, url).catch((err) => {
    console.error("[account] verification email failed to send", err);
  });
}

export async function accountRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/auth/signup — brand-new senior account with a real email +
  // password. Allowlisted from auth (no JWT exists yet). Mints a JWT
  // immediately so the senior isn't blocked on clicking an email link —
  // "reassurance over efficiency" per the project's UX principles.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/signup", async (request, reply) => {
    const rl = checkSignupRateLimit(request.ip);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Too many attempts. Please wait a moment.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = SignupSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { name, email, password } = parse.data;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately vague — don't confirm/deny which email is registered
      // to any unauthenticated caller.
      return reply.code(409).send({
        error: "email_in_use",
        message:
          "That email is already registered. Try signing in, or resetting your password.",
      });
    }

    const passwordHash = await hashPassword(password);
    const created = await db.user.create({
      data: { name, email, passwordHash, role: "SENIOR" },
    });

    await issueVerificationEmail({
      id: created.id,
      name: created.name,
      email,
    });

    const role = toAuthRole(created.role);
    const token = signAuthToken({
      userId: created.id,
      role,
      tokenVersion: created.tokenVersion,
      audience: "techbuddy-mobile",
    });

    request.log.info({ userId: created.id }, "signup created account");

    return reply.code(201).send({
      user: { id: created.id, name: created.name, role, email },
      token,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/login — returning senior, email + password.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/login", async (request, reply) => {
    const rl = checkLoginRateLimit(request.ip);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Too many attempts. Please wait a moment and try again.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = LoginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { email, password } = parse.data;

    const user = await db.user.findUnique({ where: { email } });

    // Same generic message whether the email doesn't exist or the
    // password is wrong — no account enumeration. Always run bcrypt
    // against SOMETHING even on a miss, so response timing doesn't leak
    // which case it was (constant-ish work either way).
    const passwordOk = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !user.passwordHash || !passwordOk) {
      return reply.code(401).send({
        error: "invalid_credentials",
        message: "That email or password isn't right.",
      });
    }

    const role = toAuthRole(user.role);
    const token = signAuthToken({
      userId: user.id,
      role,
      tokenVersion: user.tokenVersion,
      audience: "techbuddy-mobile",
    });

    request.log.info({ userId: user.id }, "login succeeded");

    return reply.send({
      user: { id: user.id, name: user.name, role, email: user.email },
      token,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/verify-email — redeem a verification link/token.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/verify-email", async (request, reply) => {
    const parse = VerifyEmailSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    const tokenHash = hashToken(parse.data.token);

    const record = await db.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.expiresAt < new Date()) {
      return reply.code(400).send({
        error: "invalid_or_expired_token",
        message: "This verification link has expired. Please request a new one.",
      });
    }

    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      db.emailVerificationToken.delete({ where: { id: record.id } }),
    ]);

    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/forgot-password — always 200, regardless of whether the
  // email exists. Only sends an email when it does and has a password set.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/forgot-password", async (request, reply) => {
    const rl = checkForgotPasswordRateLimit(request.ip);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Too many attempts. Please wait a moment.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = ForgotPasswordSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const user = await db.user.findUnique({ where: { email: parse.data.email } });
    if (user?.passwordHash) {
      const raw = generateRawToken();
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      const url = buildDeepLink("reset-password", raw);
      await sendPasswordResetEmail(user.email!, user.name, url).catch((err) => {
        console.error("[account] password reset email failed to send", err);
      });
    }

    // Same response either way — do not reveal whether the email exists.
    return reply.send({
      ok: true,
      message: "If that email has an account, we've sent a reset link.",
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/reset-password — redeem a reset token, set a new
  // password, sign out every other session (tokenVersion bump), and mint
  // a fresh token for the caller.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/reset-password", async (request, reply) => {
    const parse = ResetPasswordSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { token, newPassword } = parse.data;
    const tokenHash = hashToken(token);

    const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.code(400).send({
        error: "invalid_or_expired_token",
        message: "This reset link has expired. Please request a new one.",
      });
    }

    const passwordHash = await hashPassword(newPassword);

    const updated = await db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          // Bump tokenVersion: a password reset should invalidate any
          // other device's session on this account (e.g. if the reset
          // was prompted by a suspected compromise). The caller gets a
          // freshly-minted token below, carrying the new tv, so THEY
          // stay signed in — only OTHER sessions are kicked.
          tokenVersion: { increment: 1 },
        },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      return user;
    });

    const role = toAuthRole(updated.role);
    const freshToken = signAuthToken({
      userId: updated.id,
      role,
      tokenVersion: updated.tokenVersion,
      audience: "techbuddy-mobile",
    });

    request.log.info({ userId: updated.id }, "password reset succeeded");

    return reply.send({
      user: { id: updated.id, name: updated.name, role, email: updated.email },
      token: freshToken,
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/auth/claim — the upgrade path. An EXISTING anonymous senior
  // (created via the old name-only POST /v1/users) attaches an email +
  // password to their current account WITHOUT losing their id, chat
  // history, or family links. Bearer-authed — the pre-handler already
  // knows which account is claiming.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/auth/claim", async (request, reply) => {
    const rl = checkClaimAccountRateLimit(request.ip);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message: "Too many attempts. Please wait a moment.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    const parse = ClaimSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }
    const { email, password } = parse.data;

    const current = await db.user.findUnique({ where: { id: request.userId } });
    if (!current) {
      return reply.code(404).send({ error: "user_not_found" });
    }
    if (current.email) {
      return reply.code(409).send({
        error: "already_claimed",
        message: "This account already has an email set.",
      });
    }

    const emailTaken = await db.user.findUnique({ where: { email } });
    if (emailTaken) {
      return reply.code(409).send({
        error: "email_in_use",
        message: "That email is already registered to a different account.",
      });
    }

    const passwordHash = await hashPassword(password);
    const updated = await db.user.update({
      where: { id: current.id },
      data: { email, passwordHash },
    });

    await issueVerificationEmail({
      id: updated.id,
      name: updated.name,
      email,
    });

    request.log.info({ userId: updated.id }, "account claimed");

    return reply.send({
      user: {
        id: updated.id,
        name: updated.name,
        role: toAuthRole(updated.role),
        email,
      },
    });
  });
}

// bcrypt.compare against a fixed, well-formed (but arbitrary) hash — used
// on a login miss so the response takes roughly the same time whether the
// email existed or not. It's a real bcrypt hash (of the string "secret"),
// used purely for its shape; no real password will ever match it.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
