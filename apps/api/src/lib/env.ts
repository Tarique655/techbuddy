import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
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
    // (Stage A's `AUTH_ACCEPT_BEARER` env knob is gone post-Stage-E.
    //  Bearer is the only auth path now; there's no legacy fallback to
    //  toggle off.) If you set this in Render env, it's harmless — Zod
    //  ignores unknown keys.
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

    // --- Real accounts (ACCOUNTS_AND_PREMIUM_PLAN.md, 2026-08-09) --------
    // Resend API key for verification/password-reset emails. Optional in
    // dev — lib/email.ts logs to the console instead of sending when unset.
    // Required in production (see superRefine below).
    RESEND_API_KEY: z.string().optional(),
    // "From" address for outgoing email. Must be on a domain verified in
    // the Resend dashboard before production email actually delivers.
    EMAIL_FROM: z.string().default("TechBuddy <onboarding@resend.dev>"),
    // Custom URL scheme the verification/reset email links open into.
    // Matches apps/mobile/app.json's "scheme" field. A dev-client build
    // (see plan doc §3.1) may register a different scheme than the
    // TestFlight/production build — override per-environment if so.
    MOBILE_APP_SCHEME: z.string().default("techbuddy"),

    // --- Premium subscriptions — StoreKit 2 (plumbing only this phase) ---
    // All optional for now: nothing reads these until the App Store
    // Connect checklist in ACCOUNTS_AND_PREMIUM_PLAN.md §3.5 is done.
    // App Store Server API credentials (App Store Connect → Users and
    // Access → Integrations).
    APP_STORE_KEY_ID: z.string().optional(),
    APP_STORE_ISSUER_ID: z.string().optional(),
    // Contents of the downloaded .p8 private key file. Two ways this gets
    // set, both supported (see APP_STORE_PRIVATE_KEY_EFFECTIVE below):
    //   1. Pasted whole (including the -----BEGIN/END PRIVATE KEY----- lines)
    //      directly as this env var — simplest for local dev via .env.
    //   2. Render's "Secret Files" feature — mounts the file at
    //      /etc/secrets/APP_STORE_PRIVATE_KEY instead of an env var. This
    //      is the better option for a multi-line private key in prod, and
    //      what we actually used on Render. This raw env var stays
    //      undefined in that case; the transform below reads the file.
    APP_STORE_PRIVATE_KEY: z.string().optional(),
    // App Store Connect → App Information.
    APP_STORE_BUNDLE_ID: z.string().optional(),
    APP_STORE_APPLE_ID: z.string().optional(),
    // "Sandbox" | "Production" — which Apple environment to verify
    // against. Defaults to Sandbox so a misconfigured prod env fails
    // closed (rejects real receipts) rather than open.
    APP_STORE_ENVIRONMENT: z
      .enum(["Sandbox", "Production"])
      .default("Sandbox"),
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
    // Production must be able to actually send email — otherwise signup/
    // forgot-password silently no-op into the server console, which
    // nobody's watching in prod.
    if (data.NODE_ENV === "production" && !data.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["RESEND_API_KEY"],
        message:
          "RESEND_API_KEY is required in production so verification/reset emails actually send.",
      });
    }
  })
  .transform((data) => {
    // Render mounts "Secret Files" at /etc/secrets/<filename>. We named
    // the file APP_STORE_PRIVATE_KEY in the Render dashboard (matching
    // the env var name for consistency), so that's the path to check.
    // Falls back to the raw env var for local dev (paste into apps/api/.env).
    const RENDER_SECRET_FILE_PATH = "/etc/secrets/APP_STORE_PRIVATE_KEY";
    let appStorePrivateKey = data.APP_STORE_PRIVATE_KEY;
    if (!appStorePrivateKey && existsSync(RENDER_SECRET_FILE_PATH)) {
      try {
        appStorePrivateKey = readFileSync(RENDER_SECRET_FILE_PATH, "utf-8").trim();
      } catch (err) {
        console.error(
          "⚠️  Found /etc/secrets/APP_STORE_PRIVATE_KEY but couldn't read it:",
          err
        );
      }
    }

    return {
      ...data,
      // Resolve the effective secret here so callers don't have to repeat
      // the dev-fallback logic. Production has already passed the check
      // above; dev/test that didn't supply one fall through to the dev
      // string. The effective secret is what lib/jwt.ts reads.
      JWT_SECRET_EFFECTIVE: data.JWT_SECRET ?? DEV_JWT_SECRET,
      // What lib/appstore.ts reads — never the raw APP_STORE_PRIVATE_KEY,
      // so call sites don't need to know which of the two delivery
      // mechanisms above was used.
      APP_STORE_PRIVATE_KEY_EFFECTIVE: appStorePrivateKey,
    };
  });

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
