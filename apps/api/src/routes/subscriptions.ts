import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { db } from "../lib/db.js";
import {
  applyVerifiedTransaction,
  ensureAppAccountToken,
  verifyNotification,
  verifyRenewalInfo,
  verifyTransaction,
} from "../lib/appstore.js";

/**
 * Premium subscription routes — StoreKit 2 plumbing. See
 * ACCOUNTS_AND_PREMIUM_PLAN.md §3. No feature in the app gates on this
 * yet; it's the infrastructure a future paywall will call.
 */

const VerifyPurchaseSchema = z.object({
  /** The signed transaction JWS StoreKit hands the client after a
   *  successful purchase (`transaction.jwsRepresentation` in StoreKit 2). */
  signedTransactionInfo: z.string().min(1),
});

export async function subscriptionRoutes(fastify: FastifyInstance) {
  // ---------------------------------------------------------------------------
  // POST /v1/subscription/prepare-purchase — Bearer-authed. Mints (or
  // returns the existing) appAccountToken for this user. The mobile app
  // calls this immediately before starting a StoreKit purchase and passes
  // the token as StoreKit's `appAccountToken` purchase option — that's
  // what lets us join an Apple transaction back to a User row later.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/subscription/prepare-purchase", async (request, reply) => {
    const appAccountToken = await ensureAppAccountToken(request.userId);
    return reply.send({ appAccountToken });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/subscription/verify — Bearer-authed. Client calls this right
  // after StoreKit reports a successful purchase, handing us the signed
  // transaction so we can verify it's genuinely from Apple and record the
  // entitlement immediately (don't make the senior wait for the async
  // webhook to catch up).
  // ---------------------------------------------------------------------------
  fastify.post("/v1/subscription/verify", async (request, reply) => {
    const parse = VerifyPurchaseSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const transaction = await verifyTransaction(parse.data.signedTransactionInfo);
    if (!transaction) {
      return reply.code(501).send({
        error: "not_configured_or_invalid",
        message:
          "Subscription verification isn't available yet, or this transaction couldn't be verified.",
      });
    }

    // Defense in depth: the transaction's appAccountToken must match the
    // CALLER's own token, not just resolve to *some* user. Otherwise a
    // malicious client could submit someone else's transaction JWS (which
    // they could observe, e.g. via a compromised device) and have it
    // silently applied to their own account — applyVerifiedTransaction
    // looks the user up BY that token, so this check ensures the caller
    // is who they claim to be relative to the token they're presenting.
    const caller = await db.user.findUnique({
      where: { id: request.userId },
      select: { appAccountToken: true },
    });
    if (!caller?.appAccountToken || caller.appAccountToken !== transaction.appAccountToken) {
      request.log.warn(
        { userId: request.userId },
        "subscription verify: appAccountToken mismatch"
      );
      return reply.code(403).send({ error: "token_mismatch" });
    }

    const applied = await applyVerifiedTransaction(transaction, null);
    if (!applied) {
      return reply.code(422).send({ error: "could_not_apply_transaction" });
    }

    return reply.send({ ok: true });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/subscription/status — Bearer-authed. Any future feature gate
  // calls this (or a pre-handler-attached equivalent once there's an
  // actual feature to gate — see plan doc §3.4).
  // ---------------------------------------------------------------------------
  fastify.get("/v1/subscription/status", async (request, reply) => {
    const sub = await db.subscription.findUnique({
      where: { userId: request.userId },
    });
    if (!sub) {
      return reply.send({ active: false, status: null, expiresAt: null });
    }
    const active = sub.status === "ACTIVE" || sub.status === "GRACE_PERIOD";
    return reply.send({
      active,
      status: sub.status,
      expiresAt: sub.expiresAt.toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // POST /v1/webhooks/appstore — Apple's App Store Server Notifications V2
  // endpoint. Allowlisted from Bearer auth in lib/auth.ts — authenticity
  // comes from JWS signature verification here, not a session token.
  //
  // Always respond 200 once the body is well-formed JSON, even if the
  // payload fails verification or we can't resolve a user — per Apple's
  // docs, a non-2xx response makes Apple retry-storm the endpoint. Verify
  // failures are logged, not surfaced as HTTP errors.
  // ---------------------------------------------------------------------------
  fastify.post("/v1/webhooks/appstore", async (request, reply) => {
    const body = request.body as { signedPayload?: string } | undefined;
    if (!body?.signedPayload) {
      // Malformed request from something that isn't actually Apple —
      // fine to 400 this one, nothing to retry-storm.
      return reply.code(400).send({ error: "invalid_request" });
    }

    const notification = await verifyNotification(body.signedPayload);
    if (!notification) {
      request.log.warn("appstore webhook: notification failed verification");
      return reply.code(200).send({ received: true });
    }

    const signedTransactionInfo = notification.data?.signedTransactionInfo;
    const signedRenewalInfo = notification.data?.signedRenewalInfo;

    if (!signedTransactionInfo) {
      // Some notification types (e.g. CONSUMPTION_REQUEST) don't carry
      // transaction info. Nothing to apply; ack and move on.
      request.log.info(
        { type: notification.notificationType },
        "appstore webhook: no transaction info on this notification type"
      );
      return reply.code(200).send({ received: true });
    }

    const transaction = await verifyTransaction(signedTransactionInfo);
    const renewalInfo = signedRenewalInfo
      ? await verifyRenewalInfo(signedRenewalInfo)
      : null;

    if (!transaction) {
      request.log.warn("appstore webhook: embedded transaction failed verification");
      return reply.code(200).send({ received: true });
    }

    const applied = await applyVerifiedTransaction(transaction, renewalInfo);
    request.log.info(
      { type: notification.notificationType, applied },
      "appstore webhook processed"
    );

    return reply.code(200).send({ received: true });
  });
}
