import { env } from "./env.js";

/**
 * Per-user rate limit buckets, kept in process memory.
 *
 * For TechBuddy's scale (single-digit users, beta) and hosting model (Render
 * free tier, sleeps after 15 min idle), in-memory is appropriate:
 *
 *   - No DB writes on the hot path
 *   - The cold-start "reset" coincides with Render's idle reset, so users
 *     never notice a hard cliff
 *   - Map stays tiny (one entry per active user); we don't bother with
 *     active eviction
 *
 * If we ever scale beyond a single dyno or need multi-hour persistence,
 * swap to a Postgres-backed implementation reading from the messages table.
 */

type Bucket = {
  count: number;
  /** Epoch ms at which this window resets to zero. */
  resetAt: number;
};

type UserBuckets = {
  minute: Bucket;
  hour: Bucket;
};

const buckets = new Map<string, UserBuckets>();

const MIN_MS = 60_000;
const HOUR_MS = 60 * 60_000;

function freshBucket(windowMs: number): Bucket {
  return { count: 0, resetAt: Date.now() + windowMs };
}

function freshUserBuckets(): UserBuckets {
  return {
    minute: freshBucket(MIN_MS),
    hour: freshBucket(HOUR_MS),
  };
}

export type RateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** Which window was tripped, for logging / debugging. */
      reason: "minute" | "hour";
      /** Seconds until the senior can try again. Used for Retry-After header. */
      retryAfterSec: number;
    };

/**
 * Check whether `userId` is allowed to send another chat request right now.
 * Increments the bucket counters as a side effect when allowed.
 *
 * Pure no-op when limits are 0 (env knob to disable in tests / dev).
 */
export function checkChatRateLimit(userId: string): RateLimitDecision {
  const perMinute = env.RATE_LIMIT_PER_MINUTE;
  const perHour = env.RATE_LIMIT_PER_HOUR;
  if (perMinute <= 0 && perHour <= 0) return { allowed: true };

  const now = Date.now();
  let user = buckets.get(userId);
  if (!user) {
    user = freshUserBuckets();
    buckets.set(userId, user);
  }

  // Roll over expired windows.
  if (now >= user.minute.resetAt) user.minute = freshBucket(MIN_MS);
  if (now >= user.hour.resetAt) user.hour = freshBucket(HOUR_MS);

  if (perMinute > 0 && user.minute.count >= perMinute) {
    return {
      allowed: false,
      reason: "minute",
      retryAfterSec: Math.max(1, Math.ceil((user.minute.resetAt - now) / 1000)),
    };
  }
  if (perHour > 0 && user.hour.count >= perHour) {
    return {
      allowed: false,
      reason: "hour",
      retryAfterSec: Math.max(1, Math.ceil((user.hour.resetAt - now) / 1000)),
    };
  }

  user.minute.count += 1;
  user.hour.count += 1;
  return { allowed: true };
}
