/**
 * Premium subscription purchase flow — wraps `expo-iap` (raw StoreKit 2,
 * not RevenueCat/IAPKit — Tariq's explicit choice, see
 * ACCOUNTS_AND_PREMIUM_PLAN.md). This is the client half of the backend
 * plumbing in `routes/subscriptions.ts` / `lib/appstore.ts`.
 *
 * STATUS: infrastructure only. No paywall screen calls this yet — what
 * Premium unlocks hasn't been decided (plan doc §1). This hook exists so
 * that decision only requires UI work, not re-deriving the purchase flow.
 *
 * Requires a custom EAS dev-client build — `expo-iap` ships native code
 * and does not run in Expo Go. See `eas.json`'s `development` profile.
 *
 * Product id comes from `EXPO_PUBLIC_PREMIUM_PRODUCT_ID`, set once the
 * App Store Connect subscription product exists (plan doc §3.5 checklist).
 * Empty string until then — `usePremiumPurchase` no-ops rather than
 * crashing if it's unset, so the app boots fine before that's configured.
 */
import { useCallback, useEffect, useState } from "react";
import { useIAP } from "expo-iap";

import {
  getSubscriptionStatus,
  prepareSubscriptionPurchase,
  verifySubscriptionPurchase,
  type SubscriptionStatusResponse,
} from "./api";
import { safeErrorMessage } from "./safe-error";

const PREMIUM_PRODUCT_ID = process.env.EXPO_PUBLIC_PREMIUM_PRODUCT_ID ?? "";

export type PurchaseState =
  | { kind: "idle" }
  | { kind: "purchasing" }
  | { kind: "verifying" }
  | { kind: "error"; message: string };

export function usePremiumPurchase() {
  const [purchaseState, setPurchaseState] = useState<PurchaseState>({ kind: "idle" });
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);

  const {
    connected,
    products,
    fetchProducts,
    requestPurchase,
    finishTransaction,
  } = useIAP({
    // No explicit param types here — expo-iap re-exports `PurchaseError`
    // from two different internal modules (`./types` and
    // `./utils/errorMapping`) whose shapes don't quite match, and
    // `useIAP`'s own option types specifically want the errorMapping one.
    // Contextual inference from `UseIAPOptions` gets the right type
    // without us hand-tracking expo-iap's internal re-export aliases.
    onPurchaseSuccess: async (purchase) => {
      setPurchaseState({ kind: "verifying" });
      try {
        // On iOS, `purchaseToken` carries the signed transaction JWS
        // (StoreKit 2), despite the generic cross-platform field name.
        if (!purchase.purchaseToken) {
          throw new Error("Purchase completed but carried no transaction token");
        }
        await verifySubscriptionPurchase(purchase.purchaseToken);
        await finishTransaction({ purchase, isConsumable: false });
        setPurchaseState({ kind: "idle" });
        void refreshStatus();
      } catch (err) {
        console.error("[iap] verify-after-purchase failed", safeErrorMessage(err));
        setPurchaseState({
          kind: "error",
          message: "We couldn't confirm your purchase. Please try again, or contact support if you were charged.",
        });
      }
    },
    onPurchaseError: (error) => {
      console.error("[iap] purchase error", safeErrorMessage(error));
      setPurchaseState({
        kind: "error",
        message: "Something went wrong with the purchase. Please try again.",
      });
    },
  });

  useEffect(() => {
    if (connected && PREMIUM_PRODUCT_ID) {
      fetchProducts({ skus: [PREMIUM_PRODUCT_ID], type: "subs" });
    }
  }, [connected, fetchProducts]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getSubscriptionStatus());
    } catch (err) {
      console.error("[iap] status refresh failed", safeErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const purchase = useCallback(async () => {
    if (!PREMIUM_PRODUCT_ID) {
      setPurchaseState({
        kind: "error",
        message: "Premium isn't set up yet — check back soon.",
      });
      return;
    }
    setPurchaseState({ kind: "purchasing" });
    try {
      // Mint the join key BEFORE starting the purchase — Apple echoes it
      // back on every future transaction/notification for this
      // subscription, which is how the backend resolves it to a User row.
      const appAccountToken = await prepareSubscriptionPurchase();
      await requestPurchase({
        request: {
          apple: { sku: PREMIUM_PRODUCT_ID, appAccountToken },
        },
        type: "subs",
      });
      // Resolution happens in onPurchaseSuccess/onPurchaseError above —
      // expo-iap's purchase flow is event-driven, not promise-based.
    } catch (err) {
      console.error("[iap] requestPurchase threw", safeErrorMessage(err));
      setPurchaseState({
        kind: "error",
        message: "Something went wrong starting the purchase. Please try again.",
      });
    }
  }, [requestPurchase]);

  return {
    connected,
    products,
    productId: PREMIUM_PRODUCT_ID,
    status,
    refreshStatus,
    purchaseState,
    purchase,
  };
}
