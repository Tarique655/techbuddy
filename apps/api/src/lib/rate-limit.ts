import { env } from "./env.js";

/**
 * Per-key rate limit buckets, kept in process memory.
 *
 * For TechBuddy's scale (single-digit users, beta) and hosting model (Render
 * free tier, sleeps after 15 min idle), in-memory is appropriate:
 *
 *   - No DB writes on the hot path
 *   - The cold-start "reset" coincides with Render's idle reset, so users
 *     never notice a hard cliff
 *   - Maps stay tiny (one entry per active key); we don't bother with
 *     active eviction
 *
 * If we ever scale beyond a single dyno or need multi-hour persistence,
 * swap to a Postgres-backed implementation reading from the messages table.
 *
 * Bucket maps are kept SCOPED — chat by userId, invite-accept by IP, etc.
 * Sharing one map across scopes would mean a noisy IP burning a senior's
 * chat budget or vice versa.
 */

type Bucket = {
  count: number;
  /** Epoch ms at which this window resets to zero. */
  resetAt: number;
};

type WindowedBuckets = {
  minute: Bucket;
  hour: Bucket;
};

const MIN_MS = 60_000;
const HOUR_MS = 60 * 60_000;

function freshBucket(windowMs: number): Bucket {
  return { count: 0, resetAt: Date.now() + windowMs };
}

function freshWindowedBuckets(): WindowedBuckets {
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
 * Generic windowed-bucket checker. Increments the key's counters as a
 * side effect when allowed. Pure no-op when both limits are 0.
 *
 * Internal — exposed via the named wrappers below so call sites read
 * naturally (`checkChatRateLimit(userId)` rather than juggling a map).
 */
function checkBucket(
  bucketsForScope: Map<string, WindowedBuckets>,
  key: string,
  perMinute: number,
  perHour: number
): RateLimitDecision {
  if (perMinute <= 0 && perHour <= 0) return { allowed: true };

  const now = Date.now();
  let entry = bucketsForScope.get(key);
  if (!entry) {
    entry = freshWindowedBuckets();
    bucketsForScope.set(key, entry);
  }

  // Roll over expired windows.
  if (now >= entry.minute.resetAt) entry.minute = freshBucket(MIN_MS);
  if (now >= entry.hour.resetAt) entry.hour = freshBucket(HOUR_MS);

  if (perMinute > 0 && entry.minute.count >= perMinute) {
    return {
      allowed: false,
      reason: "minute",
      retryAfterSec: Math.max(
        1,
        Math.ceil((entry.minute.resetAt - now) / 1000)
      ),
    };
  }
  if (perHour > 0 && entry.hour.count >= perHour) {
    return {
      allowed: false,
      reason: "hour",
      retryAfterSec: Math.max(
        1,
        Math.ceil((entry.hour.resetAt - now) / 1000)
      ),
    };
  }

  entry.minute.count += 1;
  entry.hour.count += 1;
  return { allowed: true };
}

// =============================================================================
// Per-user chat rate limit (env-tunable).
// =============================================================================

const chatBuckets = new Map<string, WindowedBuckets>();

/**
 * Check whether `userId` is allowed to send another chat request right now.
 * Increments the bucket counters as a side effect when allowed.
 *
 * Pure no-op when limits are 0 (env knob to disable in tests / dev).
 */
export function checkChatRateLimit(userId: string): RateLimitDecision {
  return checkBucket(
    chatBuckets,
    userId,
    env.RATE_LIMIT_PER_MINUTE,
    env.RATE_LIMIT_PER_HOUR
  );
}

// =============================================================================
// Per-IP rate limits for unauth-or-near-unauth endpoints.
//
// Both invite acceptance and user creation are points where a malicious
// caller without an account could try to brute-force codes / spam new
// users. Tight per-IP limits make brute-forcing the 6-digit invite
// keyspace impractical (~5 attempts/minute → >2000 hours from one IP).
// Limits are intentionally hardcoded here rather than env-tunable —
// they're security defaults, not user-facing knobs.
// =============================================================================

const inviteAcceptBuckets = new Map<string, WindowedBuckets>();
const userCreateBuckets = new Map<string, WindowedBuckets>();
const authExchangeBuckets = new Map<string, WindowedBuckets>();

const INVITE_ACCEPT_PER_MINUTE = 5;
const INVITE_ACCEPT_PER_HOUR = 20;
const USER_CREATE_PER_MINUTE = 5;
const USER_CREATE_PER_HOUR = 20;
// /v1/auth/exchange takes a known userId and mints a JWT. An attacker
// who knows a userId can mint a token for that user; cuids are
// unguessable, but the per-IP cap keeps anyone from enumerating the
// userId namespace from a single source.
const AUTH_EXCHANGE_PER_MINUTE = 5;
const AUTH_EXCHANGE_PER_HOUR = 30;

/** Rate-limit invite-code acceptance attempts per source IP. */
export function checkInviteAcceptRateLimit(ip: string): RateLimitDecision {
  return checkBucket(
    inviteAcceptBuckets,
    ip,
    INVITE_ACCEPT_PER_MINUTE,
    INVITE_ACCEPT_PER_HOUR
  );
}

/** Rate-limit new-user creation per source IP. */
export function checkUserCreateRateLimit(ip: string): RateLimitDecision {
  return checkBucket(
    userCreateBuckets,
    ip,
    USER_CREATE_PER_MINUTE,
    USER_CREATE_PER_HOUR
  );
}

/** Rate-limit auth-exchange attempts per source IP. */
export function checkAuthExchangeRateLimit(ip: string): RateLimitDecision {
  return checkBucket(
    authExchangeBuckets,
    ip,
    AUTH_EXCHANGE_PER_MINUTE,
    AUTH_EXCHANGE_PER_HOUR
  );
}
