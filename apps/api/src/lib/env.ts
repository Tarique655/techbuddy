import "dotenv/config";
import { z } from "zod";

/**
 * Validate required environment at boot. If anything's missing or malformed,
 * we crash loudly here rather than failing on the first request.
 */

// Dev-only fallback for JWT_SECRET. Long enough to satisfy the 32-char
// minimum. NEVER used in production — the .superRefine below blocks
// boot if NODE_ENV=production and JWT_SECRET wasn't supplied.
const DEV_JWT_SECRET = "dev-only-jwt-secret-do-not-ship-this-string-anywhere";

const EnvSchema = z
  .object({
    ANTHROPIC_API_KEY: z.string().min(20, "ANTHROPIC_API_KEY missing"),
    ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
    DATABASE_URL: z.string().url(),
    // Used by Prisma migrations to bypass any connection pooler. In dev,
    // safe to set equal to DATABASE_URL.
    DIRECT_URL: z.string().url().optional(),
    PORT: z.coerce.number().int().positive().default(4000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    // HMAC secret for signing/verifying our own auth JWTs. In production
    // this MUST be set (see superRefine below); in dev/test we fall back
    // to DEV_JWT_SECRET so contributors don't have to provision a secret
    // just to boot the API. Generate a real prod value via:
    //   openssl rand -base64 48
    JWT_SECRET: z.string().min(32).optional(),
    // Token issuer and audience claims. iss is global; aud is set per
    // surface (mobile / web) at sign time, not from env.
    JWT_ISSUER: z.string().default("techbuddy-api"),
    // Stage A feature flag. When false, the auth pre-handler ignores
    // Authorization: Bearer headers and only accepts the legacy
    // X-User-Id path. Flipping this is the zero-downtime rollback for
    // Stage A — see JWT_MIGRATION_PLAN.md §6.
    AUTH_ACCEPT_BEARER: z
      .enum(["true", "false"])
      .default("true")
      .transform((s) => s === "true"),
    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://localhost:19006,http://localhost:8081")
      .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
    // Per-user chat rate limits. Set to 0 to disable a window.
    // Defaults are tuned for single-user beta — bump in Render dashboard
    // before opening up to more users.
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().nonnegative().default(20),
    RATE_LIMIT_PER_HOUR: z.coerce.number().int().nonnegative().default(100),
    // Optional. Set in production via Render dashboard so backend errors
    // bubble up to Sentry. Local dev leaves it unset and Sentry no-ops.
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    // Production must supply a real JWT_SECRET. Dev/test get the fallback.
    if (data.NODE_ENV === "production" && !data.JWT_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message:
          "JWT_SECRET is required in production. Generate via `openssl rand -base64 48` and set in Render dashboard.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    // Resolve the effective secret here so callers don't have to repeat
    // the dev-fallback logic. Production has already passed the check
    // above; dev/test that didn't supply one fall through to the dev
    // string. The effective secret is what lib/jwt.ts reads.
    JWT_SECRET_EFFECTIVE: data.JWT_SECRET ?? DEV_JWT_SECRET,
  }));

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
