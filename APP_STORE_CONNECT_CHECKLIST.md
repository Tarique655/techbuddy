# App Store Connect Checklist — Premium Subscription

Do this at appstoreconnect.apple.com, signed in with the Apple Developer
account TechBuddy is published under. Nobody else can do this step — it
needs your account. Everything here feeds the backend plumbing already
shipped in `ACCOUNTS_AND_PREMIUM_PLAN.md` §3.

Your app's Bundle ID is **`com.tariq.techbuddy`** (from `apps/mobile/app.json`)
— you'll need this in a couple of places below.

Apple's exact screen labels shift between App Store Connect releases; if
something's named slightly differently than below, look for the nearest
match — the underlying steps haven't changed.

---

## 1. Create the subscription group and product

1. In App Store Connect, open your app.
2. In the left sidebar, click **Subscriptions** (sometimes under a
   "Monetization" or "Features" heading depending on your ASC version).
3. Create a **Subscription Group** — e.g. "TechBuddy Premium". A group is
   just a container; you can add more tiers to it later without
   disrupting existing subscribers.
4. Inside the group, create the subscription product itself:
   - **Reference Name** — internal only, e.g. "Premium Monthly".
   - **Product ID** — this is the important one. Something like
     `com.tariq.techbuddy.premium.monthly`. **Write this down** — you'll
     paste it into `eas.json` and tell me so I can wire it in.
   - **Duration** — 1 month, 1 year, whatever you've decided.
   - **Price** — set it here. Nothing in the code hardcodes a price;
     the app reads whatever you configure.
   - **Localizations** — at minimum, an English display name and
     description (shown in the OS purchase sheet).
5. Save. First-time subscription setup also asks for a review
   screenshot — a rough mockup of what the paywall will look like is fine
   for now; Apple reviews the actual screen at submission time, not now.

## 2. Generate the App Store Server API key

1. **Users and Access** (left sidebar) → **Integrations** tab.
2. Look for **Team Keys** (or "In-App Purchase" key section on older ASC
   versions) → **Generate API Key** (or the **+** button if you already
   have one for something else).
3. Name it something like "TechBuddy subscriptions backend".
4. Pick a role — **App Manager** is enough for what we need
   (subscription status lookups + notification verification).
5. Click **Download API Key** — a file named `AuthKey_XXXXXXXXXX.p8`.
   **This is the only time you can download it.** Save it somewhere safe.
6. From the same screen, note:
   - **Key ID** — the `XXXXXXXXXX` in the filename, also shown in the list.
   - **Issuer ID** — shown at the top of the Integrations page.

## 3. Note your App Apple ID

1. Your app's page → **App Information**.
2. Find **Apple ID** — a numeric id (different from the Bundle ID). Write
   it down; it's required for verifying Production (not Sandbox) purchases.

## 4. Point Apple's notifications at your backend

1. Same **App Information** page → **App Store Server Notifications**.
2. Set **Version 2**.
3. **Production Server URL:** `https://techbuddy-api.onrender.com/v1/webhooks/appstore`
4. **Sandbox Server URL:** same URL — the backend reads the environment
   from the payload itself, so one endpoint handles both.

## 5. Create a Sandbox Tester

1. **Users and Access** → **Sandbox** → **Testers** → add one.
2. Use a real, working email you don't already use for your main Apple
   ID (a `+alias` on your existing Gmail works fine, e.g.
   `you+tbsandbox@gmail.com`).
3. You'll sign into this account (not your real Apple ID) on the test
   device's **Settings → App Store → Sandbox Account** to make test
   purchases without real money.

## 6. Download Apple's root certificates

1. Go to https://www.apple.com/certificateauthority/
2. Download the root certificate(s) under "Apple Root Certificates" (at
   minimum, the one currently used for App Store — look for "Apple Root
   CA - G3" unless Apple's page indicates a newer one).
3. In the repo, create the folder `apps/api/certs/` and put the
   downloaded `.cer` file(s) there. These are public certificates, not
   secrets — safe to commit.

## 7. What to send back to me

Once you've done the above, give me:

- The **Product ID** from step 1 (e.g. `com.tariq.techbuddy.premium.monthly`)
- Confirmation the `.p8` file, **Key ID**, and **Issuer ID** from step 2 are
  in hand (don't paste the `.p8` contents into chat — we'll put it
  straight into Render's env vars)
- The **App Apple ID** from step 3
- Confirmation the `.cer` file(s) from step 6 are in `apps/api/certs/`

I'll then fill in:
- `EXPO_PUBLIC_PREMIUM_PRODUCT_ID` in `apps/mobile/eas.json` (all three profiles)
- `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, `APP_STORE_BUNDLE_ID`,
  `APP_STORE_APPLE_ID` — you'll set these plus `APP_STORE_PRIVATE_KEY`
  (the `.p8` contents) directly in Render's environment variables
  dashboard, not in a file, since it's a secret.

After that, we're ready for the EAS development build + a real sandbox
purchase test.
