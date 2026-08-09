# Real Accounts + Premium Plans — Design & Rollout Plan

Status: **IN PROGRESS.** Started 2026-08-09.

Last updated: 2026-08-09.

---

## 0. Why this exists

TechBuddy has been in TestFlight beta with the v1 auth model: a senior opens
the app, types their first name, and `POST /v1/users` mints them an
anonymous account — no email, no password, no way to recover the account on
a new device. `JWT_MIGRATION_PLAN.md` (shipped 2026-05-06) gave us a real
signed-JWT session layer on top of that identity, but the *identity itself*
is still just "whoever's holding this phone."

Two things now need a real account under them:

1. **Recoverable identity.** A senior who upgrades phones, or a family
   member setting things up on their behalf, needs a way to sign back into
   the same account rather than starting over.
2. **Premium plans.** Billing has to attach to something durable. You can't
   sell a subscription to an anonymous device-bound row that evaporates on
   reinstall.

This doc covers both: email+password accounts for seniors, and the plumbing
for an Apple In-App-Purchase-based Premium subscription. Decisions below
were confirmed with Tariq on 2026-08-09.

## 1. Scope decisions (confirmed 2026-08-09)

- **Who gets email+password:** seniors only. The family portal keeps its
  6-digit invite-code flow (`FAMILY_PORTAL.md`) — not in scope here.
- **What Premium gates:** not decided yet. This phase builds the
  subscription/entitlement *plumbing* (purchase → verify → store →
  check-status) without hard-gating any feature. Feature gates get added
  once the product decision is made — the entitlement check
  (`GET /v1/subscription/status`) is the hook any future gate calls.
- **Pricing/tiers:** single Premium SKU. Tariq sets the actual price in App
  Store Connect; the code treats the product id as config, not a hardcoded
  price.
- **Payment platform:** raw StoreKit 2 + Apple's App Store Server API — no
  RevenueCat or other third-party subscription platform. More code to own,
  no vendor cut, full control. This is the harder path; see §4 for what
  that entails.

## 2. Part 1 — Email + password accounts

### 2.1 Schema changes

Additive, nullable-safe — same posture as the JWT migration's `tokenVersion`
column. Existing anonymous rows keep working; nothing is dropped.

```prisma
model User {
  // ...existing fields...
  email           String?   @unique
  passwordHash    String?
  emailVerifiedAt DateTime?
}

model EmailVerificationToken {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique   // sha256(raw token) — raw token only ever lives in the email link
  expiresAt DateTime
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Why hash the token before storing it: a DB leak (backup, misconfigured
access, whatever) shouldn't hand out working password-reset links. Same
reasoning as never storing the password itself in plaintext.

### 2.2 Password hashing: bcryptjs, not bcrypt/argon2

Picked `bcryptjs` (pure JS, no native bindings) over `bcrypt` or `argon2`
(both compile native addons per-platform). We already have a live scar from
cross-platform native-binary pain — `TECH_DEBT.md`'s Sentry source-map
saga, where a Windows-generated lockfile didn't lock the Linux variant of
`@sentry/cli` and broke EAS builds, unresolved after two fix attempts. The
API is built on Windows and deployed to Render's Linux containers; a
native bcrypt binding is the same footgun with a login-blocking blast
radius instead of a cosmetic one. `bcryptjs` is slower (~pure-JS hashing
vs. native), which is irrelevant at this user count and is the correct
trade for never debugging a platform-mismatched binary again.

### 2.3 New routes — `apps/api/src/routes/account.ts`

All under `/v1/auth/*` to sit alongside the existing exchange/refresh
endpoints in `routes/auth.ts`, but kept in a separate file since the
concerns (password credentials vs. JWT exchange) are different enough to
warrant it.

| Route | Auth | Purpose |
| --- | --- | --- |
| `POST /v1/auth/signup` | none (allowlisted) | `{name, email, password}` → creates a `SENIOR` user with a password, mints a JWT immediately (don't block app access on email click — matches the "reassurance over efficiency" senior UX principle), fires a verification email async. |
| `POST /v1/auth/login` | none (allowlisted) | `{email, password}` → verify hash, mint JWT. Generic error message on both "no such email" and "wrong password" (no account enumeration). |
| `POST /v1/auth/verify-email` | none (allowlisted) | `{token}` → marks `emailVerifiedAt`. |
| `POST /v1/auth/forgot-password` | none (allowlisted) | `{email}` → always 200 regardless of whether the email exists; only sends an email if a matching, password-having user is found. |
| `POST /v1/auth/reset-password` | none (allowlisted) | `{token, newPassword}` → verifies token hash + expiry + unused, sets new password, bumps `tokenVersion` (signs out every other session on the account), mints a fresh JWT for the caller. |
| `POST /v1/auth/claim` | **Bearer required** | `{email, password}` → the critical upgrade path. Lets an *existing* anonymous senior (created via the old name-only `/v1/users` onboarding) attach an email+password to their current account without losing their id, chat history, or family links. |

`claim` is the one that matters most for Tariq's own beta account and any
other TestFlight tester — without it, "add real accounts" would silently
mean "everyone's beta history gets orphaned." Settings gets a new "Add
email & password" row that's the entry point (task: mobile claim flow).

### 2.4 Email delivery: Resend

`FAMILY_PORTAL.md`'s v2 backlog already flagged Resend as the intended
provider for "real auth (magic links via Resend, or password)." Using it
here. `lib/email.ts` wraps `resend`'s API with a dev-mode fallback: if
`RESEND_API_KEY` isn't set (local dev), log the email subject + body +
link to the console instead of sending — so local development doesn't
require a Resend account to exercise the flows.

### 2.5 What does NOT change

- Anonymous onboarding (`POST /v1/users`, name-only) stays working. Not
  every senior needs to set up email/password on day one — it's offered,
  not forced, in Settings. (Revisit before a public, non-beta launch: a
  purchasing customer needs recoverable identity, so Premium purchase
  should nudge — not block — toward claiming the account first.)
- The JWT layer (`lib/jwt.ts`, `lib/auth.ts`) is untouched. Signup/login
  just become two more ways to end up with a `{user, token}` pair, same
  shape as onboarding and `/v1/auth/exchange` already produce.

---

## 3. Part 2 — Premium via StoreKit 2 (backend plumbing this phase)

### 3.1 What ships now vs. later

This phase ships the **server-side half**: schema, receipt/notification
verification, and an entitlement-status endpoint. It deliberately does
**not** ship the mobile purchase UI (paywall screen, `react-native-iap` or
`expo-storekit` wiring, restore-purchases button). Reasons:

- In-app purchases require a **native module** — Expo Go can't run it. The
  mobile app needs an EAS **development build** (custom dev client)
  installed on Tariq's phone before this can be tested at all. That's a
  bigger workflow change than one session should fold into "also add a
  backend feature" — worth its own pass once the App Store Connect side is
  configured (see checklist below).
- App Store Connect configuration (subscription group, product id,
  App Store Server API key) has to happen in Tariq's Apple Developer
  account — nobody else can do that step.

So: backend is real and testable via curl/synthetic payloads today; mobile
purchase flow is the next follow-up once the App Store Connect setup below
is done.

### 3.2 Schema

```prisma
enum SubscriptionStatus {
  ACTIVE
  GRACE_PERIOD
  EXPIRED
  REVOKED
}

model Subscription {
  id                    String             @id @default(cuid())
  userId                String             @unique
  originalTransactionId String             @unique   // Apple's stable per-subscription identity — survives renewals
  productId             String                        // App Store Connect subscription product id
  status                SubscriptionStatus @default(ACTIVE)
  autoRenewStatus       Boolean            @default(true)
  expiresAt             DateTime
  environment           String                        // "Sandbox" | "Production"
  lastVerifiedAt         DateTime          @default(now())
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

One `Subscription` row per user for v1 (single SKU). `originalTransactionId`
is the durable key Apple uses across renewals — `productId` can even change
(e.g. if we ever add tiers) but `originalTransactionId` doesn't.

### 3.3 Two ways entitlement state gets updated

1. **Client-initiated verify.** After `react-native-iap` (or StoreKit
   directly) completes a purchase, the mobile app gets a signed transaction
   from Apple and POSTs it to the backend. The backend verifies the JWS
   signature against Apple's public keys (via the `app-store-server-library`
   npm package — Apple's official SDK for exactly this), extracts the
   claims, and upserts the `Subscription` row.
2. **Server-to-server: App Store Server Notifications V2.** Apple calls our
   webhook (`POST /v1/webhooks/appstore`) on every subscription lifecycle
   event — renewal, cancellation, refund, billing-retry, grace period. This
   is the source of truth for state changes the client doesn't cause
   directly (e.g. someone cancels via iOS Settings, not the app). Same JWS
   verification path as (1).

Both paths funnel through one `applyAppStoreNotification(payload)` /
`applyVerifiedTransaction(payload)` helper in `lib/appstore.ts` so the
upsert logic isn't duplicated.

### 3.4 Entitlement check

`GET /v1/subscription/status` (Bearer-authed) returns
`{ active: boolean, expiresAt: string | null, status: SubscriptionStatus | null }`.
Any future feature gate (unlimited chat, human technician access, whatever
gets decided) calls this — or better, the pre-handler attaches
`request.entitlement` the same way it attaches `request.userRole` today, so
routes don't each re-fetch it. That wiring is a follow-up once there's an
actual feature to gate.

### 3.5 App Store Connect checklist (Tariq — manual, can't be automated)

Before the mobile purchase flow can be built or tested, even in sandbox:

1. App Store Connect → your app → **Subscriptions** → create a Subscription
   Group (e.g. "TechBuddy Premium").
2. Create the subscription product inside that group. Note the **Product
   ID** (e.g. `com.techbuddy.premium.monthly`) — this becomes `productId`
   in the schema above and an env var the mobile app reads.
3. Set the price. (This is the "you set it in App Store Connect" from the
   scope decision above — nothing in code hardcodes a price.)
4. App Store Connect → **Users and Access** → **Integrations** → **In-App
   Purchase** (or **App Store Server API**, naming varies by ASC version)
   → generate a **App Store Server API key** (.p8 file + Key ID + Issuer
   ID). These become `APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, and the
   `.p8` contents as `APP_STORE_PRIVATE_KEY` in Render env.
5. App Store Connect → **App Information** → note your app's **Bundle ID**
   and **Apple App Apple ID** (numeric) — both needed for JWS audience
   verification.
6. Configure **App Store Server Notifications V2** URL to point at
   `https://techbuddy-api.onrender.com/v1/webhooks/appstore` (production)
   and a Render preview URL for sandbox testing.
7. Create a **Sandbox Tester** Apple ID for testing purchases without real
   money.
8. Once (1)-(7) are done, the mobile follow-up (EAS dev-client build +
   `react-native-iap` + paywall screen) can start.

---

## 4. Files touched this phase

### API — `apps/api`
- `prisma/schema.prisma` — User fields, `EmailVerificationToken`,
  `PasswordResetToken`, `Subscription`, `SubscriptionStatus`.
- `src/lib/password.ts` — new. bcryptjs hash/verify wrappers.
- `src/lib/tokens.ts` — new. Random token generation + sha256 hashing for
  verification/reset tokens.
- `src/lib/email.ts` — new. Resend wrapper with dev-console fallback.
- `src/lib/appstore.ts` — new. JWS verification + notification/transaction
  → `Subscription` upsert logic.
- `src/routes/account.ts` — new. Signup/login/verify/forgot/reset/claim.
- `src/routes/subscriptions.ts` — new. Status + webhook endpoints.
- `src/lib/auth.ts` — allowlist additions for the new unauthenticated routes.
- `src/lib/rate-limit.ts` — signup/login/forgot-password buckets.
- `src/lib/env.ts` — `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`,
  `APP_STORE_*` vars.
- `src/server.ts` — register the two new route files.
- `package.json` — `+ bcryptjs`, `+ @types/bcryptjs`, `+ resend`,
  `+ app-store-server-library`.

### Mobile — `apps/mobile`
- `app/onboarding.tsx` — gains email + password fields alongside name.
- `app/login.tsx` — new. Email + password sign-in for a returning senior /
  reinstall.
- `app/forgot-password.tsx`, `app/reset-password.tsx` — new.
- `app/settings.tsx` — new "Account" section: shows email if claimed, or an
  "Add email & password" prompt if the account is still anonymous.
- `lib/api.ts` — `signup`, `login`, `forgotPassword`, `resetPassword`,
  `claimAccount`, `verifyEmail` client functions.
- `lib/iap.ts` (new, 2026-08-09) — `usePremiumPurchase()` hook wrapping
  `expo-iap` (the current recommended library for the raw-StoreKit path;
  supersedes the now-secondary `react-native-iap`). Wires
  `prepare-purchase` → `requestPurchase` → `verify` end to end. No paywall
  screen calls it yet — infrastructure only, ready for whenever the
  product decision on what Premium unlocks is made.
- `app.json` gained the `expo-iap` config plugin; `eas.json` gained
  `EXPO_PUBLIC_PREMIUM_PRODUCT_ID` (empty placeholder in all three build
  profiles until the App Store Connect product exists).

---

## 5. Out of scope for this phase

- Feature gating (deciding what Premium actually unlocks) — product
  decision, deferred per §1.
- Mobile purchase flow / paywall screen / EAS dev-client build.
- Family portal email+password (family keeps invite codes).
- Deleting/merging the old anonymous-onboarding path — it stays as the
  low-friction default; claim is additive.
- Rate-limiting login by email (only by IP for now) — revisit if
  credential-stuffing becomes a real threat at this user count.
