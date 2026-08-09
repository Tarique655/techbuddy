/**
 * StoreKit 2 / App Store Server API integration — backend plumbing for
 * Premium subscriptions. See ACCOUNTS_AND_PREMIUM_PLAN.md §3.
 *
 * Uses Apple's official Node SDK, `@apple/app-store-server-library`, for
 * two things:
 *   1. JWS verification (`SignedDataVerifier`) — proving a signed
 *      transaction or notification payload genuinely came from Apple
 *      (signature chains up to Apple's published root CAs). Only needs
 *      the public root certs, not the private key.
 *   2. Calling the App Store Server API itself (`AppStoreServerAPIClient`)
 *      — needs the private key. Used today for `requestTestNotification()`,
 *      a smoke test that confirms credentials + webhook URL + JWS
 *      verification all work without a real purchase. See routes/debug.ts.
 *
 * Both fail closed (return null / throw a clear error) rather than crash
 * the process if the App Store Connect checklist isn't fully done yet —
 * see ACCOUNTS_AND_PREMIUM_PLAN.md §3.5 and APP_STORE_CONNECT_CHECKLIST.md.
 * As of 2026-08-09 all of it IS configured (Render env vars +
 * apps/api/certs/AppleRootCA-G3.cer), pending redeploy picking it up.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type JWSRenewalInfoDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";

import { db } from "./db.js";
import { env } from "./env.js";
import { SubscriptionStatus } from "@prisma/client";

// =============================================================================
// Configuration + lazy verifier
// =============================================================================

const CERTS_DIR = join(process.cwd(), "certs");

/**
 * Apple's root CA certs, downloaded manually from
 * https://www.apple.com/certificateauthority/ and placed in
 * apps/api/certs/*.cer per the plan doc's App Store Connect checklist.
 * Returns an empty array (verifier construction below then no-ops) if the
 * directory doesn't exist yet — keeps local dev from crashing on boot
 * before anyone's done that setup step.
 */
function loadAppleRootCAs(): Buffer[] {
  try {
    return readdirSync(CERTS_DIR)
      .filter((f) => f.endsWith(".cer"))
      .map((f) => readFileSync(join(CERTS_DIR, f)));
  } catch {
    return [];
  }
}

function appleEnvironment(): Environment {
  return env.APP_STORE_ENVIRONMENT === "Production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;
}

let _verifier: SignedDataVerifier | null | undefined;

/**
 * Lazily build the verifier. Returns null (not throws) if App Store
 * Connect config is incomplete — callers treat that as "feature not
 * configured yet" and reject with a clear 501, not a crash.
 */
function getVerifier(): SignedDataVerifier | null {
  if (_verifier !== undefined) return _verifier;

  const bundleId = env.APP_STORE_BUNDLE_ID;
  const roots = loadAppleRootCAs();
  if (!bundleId || roots.length === 0) {
    _verifier = null;
    return _verifier;
  }

  const environment = appleEnvironment();
  // appAppleId is REQUIRED for Production per Apple's docs; optional for
  // Sandbox. We pass it through either way if it's set.
  const appAppleId = env.APP_STORE_APPLE_ID
    ? Number(env.APP_STORE_APPLE_ID)
    : undefined;

  if (environment === Environment.PRODUCTION && !appAppleId) {
    console.warn(
      "[appstore] APP_STORE_APPLE_ID is required for Production verification — verifier disabled"
    );
    _verifier = null;
    return _verifier;
  }

  _verifier = new SignedDataVerifier(
    roots,
    /* enableOnlineChecks */ true,
    environment,
    bundleId,
    appAppleId
  );
  return _verifier;
}

// =============================================================================
// App Store Server API client
// =============================================================================
// Needs the private key (Key ID + Issuer ID + .p8 contents), unlike the
// verifier above which only needs the public root certs. Used for calling
// Apple directly — e.g. requestTestNotification() below, or a future
// getTransactionHistory() for reconciliation. Wired up 2026-08-09 once
// Tariq finished the App Store Connect checklist.

let _apiClient: AppStoreServerAPIClient | null | undefined;

/**
 * Lazily build the App Store Server API client. Returns null if any of
 * the four required credentials is missing — same fail-closed pattern as
 * getVerifier() above.
 */
function getApiClient(): AppStoreServerAPIClient | null {
  if (_apiClient !== undefined) return _apiClient;

  const { APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APP_STORE_BUNDLE_ID } = env;
  const privateKey = env.APP_STORE_PRIVATE_KEY_EFFECTIVE;

  if (!APP_STORE_KEY_ID || !APP_STORE_ISSUER_ID || !APP_STORE_BUNDLE_ID || !privateKey) {
    _apiClient = null;
    return _apiClient;
  }

  _apiClient = new AppStoreServerAPIClient(
    privateKey,
    APP_STORE_KEY_ID,
    APP_STORE_ISSUER_ID,
    APP_STORE_BUNDLE_ID,
    appleEnvironment()
  );
  return _apiClient;
}

/**
 * Ask Apple to fire a test App Store Server Notification at our webhook
 * (POST /v1/webhooks/appstore). Doesn't require a real purchase — this is
 * the fastest way to confirm the whole chain (credentials → Apple →
 * webhook URL → JWS verification → route handler) works end to end
 * before trying a real sandbox purchase. See routes/debug.ts.
 *
 * Returns Apple's test notification token on success, or throws if the
 * client isn't configured or the request fails.
 */
export async function requestTestNotification(): Promise<string> {
  const client = getApiClient();
  if (!client) {
    throw new Error(
      "App Store Server API client not configured — check APP_STORE_KEY_ID/ISSUER_ID/BUNDLE_ID and the private key (env var or Render Secret File)."
    );
  }
  const response = await client.requestTestNotification();
  if (!response.testNotificationToken) {
    throw new Error(
      "Apple accepted the request but didn't return a testNotificationToken — unexpected response shape."
    );
  }
  return response.testNotificationToken;
}

// =============================================================================
// Verification entry points
// =============================================================================

/**
 * Verify + decode an App Store Server Notification V2 payload (the
 * `signedPayload` field of the webhook's JSON body). Returns null on any
 * failure (bad signature, verifier not configured, malformed payload) —
 * callers should respond 200 anyway per Apple's webhook contract (so
 * Apple doesn't retry-storm us) but log loudly.
 */
export async function verifyNotification(
  signedPayload: string
): Promise<ResponseBodyV2DecodedPayload | null> {
  const verifier = getVerifier();
  if (!verifier) {
    console.error(
      "[appstore] verifyNotification called but verifier isn't configured"
    );
    return null;
  }
  try {
    return await verifier.verifyAndDecodeNotification(signedPayload);
  } catch (err) {
    console.error("[appstore] notification verification failed", err);
    return null;
  }
}

/**
 * Verify + decode a signed transaction string — used both for
 * client-submitted post-purchase verification and for the
 * `signedTransactionInfo` embedded inside a decoded notification.
 */
export async function verifyTransaction(
  signedTransactionInfo: string
): Promise<JWSTransactionDecodedPayload | null> {
  const verifier = getVerifier();
  if (!verifier) return null;
  try {
    return await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
  } catch (err) {
    console.error("[appstore] transaction verification failed", err);
    return null;
  }
}

/** Same idea, for the `signedRenewalInfo` half of a notification. */
export async function verifyRenewalInfo(
  signedRenewalInfo: string
): Promise<JWSRenewalInfoDecodedPayload | null> {
  const verifier = getVerifier();
  if (!verifier) return null;
  try {
    return await verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo);
  } catch (err) {
    console.error("[appstore] renewal info verification failed", err);
    return null;
  }
}

// =============================================================================
// appAccountToken — the join key between "an Apple transaction" and "one
// of our User rows". StoreKit requires this to be a UUID, so it can't be
// our cuid `User.id` directly. See schema.prisma's doc comment on
// User.appAccountToken.
// =============================================================================

/**
 * Ensure the given user has an appAccountToken, minting one if needed.
 * Idempotent. The mobile app calls (via a route, not this function
 * directly) before starting a StoreKit purchase, and embeds the returned
 * token in the purchase request so Apple echoes it back on every future
 * transaction/notification for that subscription.
 */
export async function ensureAppAccountToken(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { appAccountToken: true },
  });
  if (user.appAccountToken) return user.appAccountToken;

  const token = randomUUID();
  await db.user.update({
    where: { id: userId },
    data: { appAccountToken: token },
  });
  return token;
}

// =============================================================================
// Applying a verified transaction to our Subscription table
// =============================================================================

function deriveStatus(
  transaction: JWSTransactionDecodedPayload,
  renewalInfo: JWSRenewalInfoDecodedPayload | null
): SubscriptionStatus {
  if (transaction.revocationDate) return SubscriptionStatus.REVOKED;

  const now = Date.now();
  const expiresAt = transaction.expiresDate ?? 0;
  if (expiresAt > now) return SubscriptionStatus.ACTIVE;

  const graceExpiresAt = renewalInfo?.gracePeriodExpiresDate ?? 0;
  if (graceExpiresAt > now) return SubscriptionStatus.GRACE_PERIOD;

  return SubscriptionStatus.EXPIRED;
}

/**
 * Upsert the Subscription row for whichever user owns this transaction's
 * appAccountToken. Returns false (and logs) if the transaction doesn't
 * carry a recognizable appAccountToken — this can legitimately happen for
 * transactions that predate appAccountToken being set (shouldn't occur in
 * our flow, since we always mint one before purchase, but Apple's sandbox
 * has produced surprises before).
 *
 * Shared by both the client-verify path and the notification-webhook
 * path so they can't drift on how they interpret Apple's payload shape.
 */
export async function applyVerifiedTransaction(
  transaction: JWSTransactionDecodedPayload,
  renewalInfo: JWSRenewalInfoDecodedPayload | null
): Promise<boolean> {
  const appAccountToken = transaction.appAccountToken;
  const originalTransactionId = transaction.originalTransactionId;
  const productId = transaction.productId;
  const expiresDate = transaction.expiresDate;

  if (!appAccountToken || !originalTransactionId || !productId || !expiresDate) {
    console.error(
      "[appstore] transaction missing required fields, cannot apply",
      { appAccountToken, originalTransactionId, productId, expiresDate }
    );
    return false;
  }

  const user = await db.user.findUnique({ where: { appAccountToken } });
  if (!user) {
    console.error(
      "[appstore] no user found for appAccountToken from Apple transaction",
      { appAccountToken, originalTransactionId }
    );
    return false;
  }

  const status = deriveStatus(transaction, renewalInfo);

  await db.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      originalTransactionId,
      productId,
      status,
      autoRenewStatus: renewalInfo?.autoRenewStatus === 1,
      expiresAt: new Date(expiresDate),
      environment: transaction.environment ?? env.APP_STORE_ENVIRONMENT,
      lastVerifiedAt: new Date(),
    },
    update: {
      originalTransactionId,
      productId,
      status,
      autoRenewStatus: renewalInfo?.autoRenewStatus === 1,
      expiresAt: new Date(expiresDate),
      environment: transaction.environment ?? env.APP_STORE_ENVIRONMENT,
      lastVerifiedAt: new Date(),
    },
  });

  return true;
}
