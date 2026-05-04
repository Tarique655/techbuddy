import "dotenv/config";
import { z } from "zod";

/**
 * Validate required environment at boot. If anything's missing or malformed,
 * we crash loudly here rather than failing on the first request.
 */
const EnvSchema = z.object({
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
  JWT_SECRET: z.string().min(32).optional(),
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
