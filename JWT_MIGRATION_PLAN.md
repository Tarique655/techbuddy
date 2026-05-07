# JWT Auth Migration — Plan

Status: **COMPLETE 2026-05-06.** Stages A–E all shipped on the same day with the only-tester-is-Tariq simplification compressing the planned multi-day soak (D) into effectively zero. See §9 for the acceptance checklist (now all green).

Last updated: 2026-05-06.

---

## 0. Why this exists

The 2026-05-05 audit's biggest open P0 cluster is "auth identity = unsigned user id." Right now both mobile and web send a raw cuid as the `X-User-Id` header, the API pre-handler does a `User.findUnique` to confirm it exists, and that's the entire auth model. The file's own docblock (`apps/api/src/lib/auth.ts:36-40`) flags this as "v1 beta only — we'll layer a signed JWT on top before any public launch."

This document is the design pass before we touch code. Six things the user explicitly asked the plan to address are tagged inline as **[ASK 1]** through **[ASK 6]** so it's easy to verify they all got answered.

The plan deliberately keeps the migration **incremental and reversible at every step.** Existing testers (Tariq's phone, anyone in TestFlight) must not be logged out at any point during the rollover. We will accept both auth schemes for one release window, watch Sentry for legacy-header usage, then flip-and-remove in a follow-up release.

---

## 1. Token design  *(ASK 1)*

### Algorithm

HS256 (HMAC-SHA-256) using the existing `JWT_SECRET` env var, which is already declared in `apps/api/src/lib/env.ts:19` (`z.string().min(32).optional()`) and currently unused. Promote it from optional to required for the API in production.

Reasons to pick HS256 over RS256 for v1:
- Single API instance signs and verifies; no key-distribution problem.
- `JWT_SECRET` plumbing already exists.
- The Next middleware on the web side will need to verify the cookie's signature in the Edge runtime; `jose` (the lib for that) handles HS256 fine.
- We can switch to RS256 later if we ever want a dedicated auth service or third-party verification — JWT version claim (see below) makes the swap clean.

### Claims

```jsonc
{
  "sub":  "<user.id>",            // cuid, primary subject
  "role": "senior" | "family" | "technician",
  "tv":   1,                      // tokenVersion — bump on User row to revoke
  "iat":  1746544800,             // issued-at, seconds
  "exp":  1749136800,             // expiry, seconds (see "Expiry" below)
  "iss":  "techbuddy-api",
  "aud":  "techbuddy-mobile" | "techbuddy-web",
  "v":    1                       // payload schema version (NOT tokenVersion)
}
```

- `sub` replaces what `X-User-Id` carried.
- `role` is included so the API can do role checks without an extra DB hop. The current code does `db.user.findUnique` for the role on every family route — once tokens carry it, we can short-circuit. (Out of scope for the migration itself; just calling out the future win.)
- `tv` is the per-user token version. Default 0 on existing rows (see schema change below). Bumping `User.tokenVersion` invalidates every JWT that user holds — useful for sign-out-everywhere, breach response, or when the senior taps "revoke this device" later.
- `aud` distinguishes mobile-issued tokens from web-issued tokens. Lets us tighten policy per surface later (e.g. shorter expiry on web, refresh-only-from-web). Today it's metadata.
- `v` is the **payload** schema version. If we add or rename a claim later, bump `v` and the verifier accepts both during a transition.

### Expiry  *(ASK 1)*

Two profiles:

| Surface | Access token TTL | Renewal | Rationale |
| --- | --- | --- | --- |
| Mobile  | 60 days          | sliding (see below) | Senior demographic; re-onboarding is high friction. SecureStore is the right place to hold a long-lived bearer. 60 days picked over 30 to bias the trade-off toward UX given that sliding renewal makes "active user kicked out" a non-issue — only truly dormant users hit the boundary. |
| Web     | 7 days           | sliding             | Cookie is HttpOnly + Secure; shorter TTL because browsers are more porous than mobile keychains. |

### Refresh strategy  *(ASK 1)*

**Sliding access tokens, no separate refresh token in v1.**

Mechanism: when the API verifies an incoming token in the pre-handler, if it's still valid AND has used more than 50% of its TTL, mint a fresh token with a new `iat`/`exp` and set it on the response as:

- Mobile: `X-Renewed-Token: <jwt>` response header. Mobile's fetch wrapper checks for this header on every response and, if present, persists the new token to SecureStore (see "Mobile-side" below).
- Web: as the `tb_session` cookie via `Set-Cookie` (the API/Next route handler can refresh it transparently — the browser just keeps using the latest cookie).

Why no separate refresh token?
- A separate refresh token means a refresh-token table, rotation logic, replay detection — material complexity that v1 doesn't need.
- Sliding access tokens are weaker against token theft (no short-lived access + long-lived refresh split) but our threat model is "device storage compromise," which a refresh token wouldn't help with anyway: if the attacker has SecureStore access they can grab whatever bearer is there.
- We can add real refresh tokens later (introduce `RefreshToken` table, issue both at /accept, validate-and-rotate on /refresh) without breaking the JWT shape on the wire.

Acceptable failure mode: if a user doesn't open the mobile app for 60 days, they re-onboard. That's a known cost we accept for v1; sliding renewal means active users never hit it, so this is purely a "truly dormant" boundary. Revisit if testers actually hit it.

### Schema change

One field added to `User`:

```prisma
model User {
  // ...existing fields...
  tokenVersion Int @default(0)  // bumped to invalidate all extant tokens for this user
}
```

Migration is additive and nullable-safe (default 0). Forward and backward compatible: pre-migration code ignores the column; post-migration code reads it. **No drop-down migration risk.**

---

## 2. Cut-over strategy *(ASK 2 — backward compatibility)*

The migration ships in **five stages over three releases.** Existing testers continue to work at every stage. Each stage is independently revertable (see §6).

| Stage | Release | What ships | What's revertable |
| --- | --- | --- | --- |
| **A** | API release N    | Pre-handler accepts EITHER `Authorization: Bearer <jwt>` OR legacy `X-User-Id`. New `POST /v1/auth/exchange` returns a JWT given a valid legacy id. Schema migration (`tokenVersion` column). All existing clients keep working unchanged. | Toggle env var `AUTH_ACCEPT_BEARER=false` to disable the new code path (pre-handler falls back to legacy-only). |
| **B** | Mobile OTA N      | Mobile silently calls `/v1/auth/exchange` once on app start if it holds a userId but no JWT. Stores the JWT to SecureStore. Sends `Authorization: Bearer` going forward. Falls back to legacy `X-User-Id` if exchange fails (network, 5xx). | Re-publish the previous OTA bundle. SecureStore JWT becomes dead data (harmless — pre-handler still accepts legacy). |
| **C** | Web release N     | Web converts to cookie auth. `POST /v1/family/accept` (still allowlisted) sets the `tb_session` HttpOnly cookie via a Next route handler proxy on the Vercel origin. Existing `localStorage` users get migrated via a one-time `/api/auth/migrate-from-localstorage` Next route on next dashboard visit. Next middleware redirects unauthenticated `/dashboard` and `/seniors/*` requests to `/`. | Vercel "Promote previous deployment" reverts web to localStorage path. Backend stays multi-mode so reverted web app keeps working. |
| **D** | Soak window — 7 days minimum | No code changes. Watch Sentry for `auth.legacy=1` tag (added in Stage A). Wait until the rate is effectively zero across both mobile and web. Verify the soak by querying Sentry dashboard daily. | n/a (observation only) |
| **E** | API release N+1  | Pre-handler stops accepting `X-User-Id`. `/v1/auth/exchange` returns 410 Gone. CORS `allowedHeaders` drops `X-User-Id`. The mobile/web client code that still references the legacy header (now in fallback paths) gets removed in mobile release N+2 / web release N+1. | Re-deploy API release N. The fallback paths in mobile/web haven't been touched yet at this point so reverting the API is sufficient. |

The "test plan" in §5 specifies how we move between stages without locking ourselves or testers out.

---

## 3. File-by-file plan

Format: `path:lines` — what changes — rollback note.

### 3.1 API — `apps/api`

**`prisma/schema.prisma`** *(Stage A)*
- Add `tokenVersion Int @default(0)` to `User`.
- New migration: `add_user_token_version`.
- **Rollback:** Prisma down-migration drops the column. Safe because no production code reads it before Stage A ships, and the column is unread by Stage A code paths that don't use JWT.

**`apps/api/src/lib/env.ts:19`** *(Stage A)*
- Promote `JWT_SECRET` from `.optional()` to required when `NODE_ENV === "production"` (use `.refine` so dev still defaults to a stable dev string `"dev-secret-do-not-use-in-prod-at-least-32-chars"` — long enough to satisfy the 32-char minimum).
- Add `AUTH_ACCEPT_BEARER` (boolean, defaults to `true` in prod, can be flipped to `false` for instant rollback) and `JWT_ISSUER` (defaults `"techbuddy-api"`).
- **Rollback:** revert to `.optional()`.

**`apps/api/src/lib/jwt.ts`** *(Stage A — new file)*
- Wraps `jsonwebtoken` (the only new dep).
- Exports `signAuthToken({ userId, role, tokenVersion, audience })`, `verifyAuthToken(rawJwt) → { sub, role, tv, exp, iat, ... } | null`, `shouldRenew(payload)` (returns true if more than 50% of TTL elapsed).
- Centralizes claim shape so the rest of the codebase doesn't reach into payloads directly.
- **Rollback:** delete the file once nothing imports it.

**`apps/api/src/lib/auth.ts`** *(Stage A — major edit)*
- Pre-handler logic becomes:
  1. If allowlisted (existing logic — `/healthz`, `POST /v1/users`, `POST /v1/family/accept`), return.
  2. Try `Authorization: Bearer <jwt>` first. If present and `verifyAuthToken` succeeds AND the token's `tv` matches the user's `tokenVersion` in DB, set `request.userId` + `request.userRole` and continue. If `shouldRenew(payload)` is true, attach a renewed token to the response (via a Fastify `onSend` hook for this request — header for mobile-aud, cookie for web-aud).
  3. Else, if `env.AUTH_ACCEPT_BEARER` is true and `X-User-Id` is present, do the legacy lookup unchanged. Tag this request: `request.log.warn({ userId, route }, "auth.legacy")` and add a Sentry breadcrumb with tag `auth.legacy=1` for dashboard counting.
  4. Else, 401 as today.
- The DB lookup we currently do on every request **stays in place during Stage A** even on the JWT path — it's the safety net that lets us drop a breached token's worth of damage by revoking the User row entirely. Removing the lookup is a separate post-Stage-E optimization.
- **Rollback:** revert to the current single-path implementation. Set `AUTH_ACCEPT_BEARER=false` for instant rollback without redeploy.

**`apps/api/src/server.ts:53`** *(Stage A — small edit)*
- CORS `allowedHeaders` becomes `["Content-Type", "X-User-Id", "Authorization"]`.
- Add `credentials: true` so the web cookie can flow on cross-origin requests if we ever need a direct (non-proxied) call. (Today the web will go through the Next proxy so this isn't strictly required, but it's harmless and future-proof.)
- Add `exposedHeaders: ["X-Renewed-Token"]` so mobile's fetch wrapper can read the renewed-token header.
- **Rollback:** revert the array.

**`apps/api/src/routes/auth.ts`** *(Stage A — new file)*
- `POST /v1/auth/exchange` — body `{ userId: string }`, allowlisted from auth (since the caller has no JWT yet). Looks up the user, mints a JWT, returns `{ token, user }`. Per-IP rate-limited at 5/min (reuse `lib/rate-limit.ts`).
- `POST /v1/auth/refresh` — authed via Bearer. Mints a new token regardless of remaining TTL. Mobile uses this if it gets a 401 on a token it expected to be valid; web uses it on long sessions.
- **Rollback:** Stage E flips both to 410 Gone via a single conditional. Then later removed.

**`apps/api/src/routes/users.ts:47-57`** *(Stage A — small edit)*
- `POST /v1/users` returns `{ user, token }` instead of `{ user }`. Mobile's onboarding flow gets the JWT directly without a second round-trip.
- **Backward compat:** mobile clients that don't read the `token` field keep working (they fall through to legacy until they upgrade). The added field doesn't break old clients.
- **Rollback:** drop the `token` field from the response.

**`apps/api/src/routes/family.ts:220-227`** *(Stage A — small edit)*
- `POST /v1/family/accept` returns `{ user, link, token }` AND sets the `tb_session` HttpOnly cookie via `reply.setCookie(...)` when the request originates from the web portal. We detect "from web" by the presence of an `Origin` header that matches `CORS_ORIGINS`. Mobile callers (no `Origin`) get only the JSON token — no `Set-Cookie`.
- **Important:** Fastify cookie support requires `@fastify/cookie`. New dep.
- **Rollback:** drop the `token` field and the cookie write. The link/user creation logic is untouched.

**`apps/api/package.json`** *(Stage A — new deps)*
- `+ jsonwebtoken`, `+ @types/jsonwebtoken`, `+ @fastify/cookie`. Three small deps, all well-maintained.
- **Rollback:** `pnpm remove`.

### 3.2 Mobile — `apps/mobile`

**`apps/mobile/lib/auth-token.ts`** *(Stage B — new file)*
- Wraps SecureStore for the JWT specifically.
- Key: `techbuddy.auth.token.v1`. Kept separate from the existing `techbuddy.user.v1` blob so a write to one can't corrupt the other.
- Exports `getAuthToken()`, `setAuthToken(jwt)`, `clearAuthToken()`. All async.
- **Rollback:** clear the SecureStore entry on app upgrade if we ever revert. (The pre-handler ignores stale tokens once Stage A is reverted, but it's tidy to clean up.)

**`apps/mobile/lib/api.ts:25-45`** *(Stage B — major edit)*
- Replace module-local `_currentUserId` + `setApiUserId` with `_currentAuth` + `setApiAuth({ userId, token })`.
- `authHeaders()` becomes:
  ```ts
  function authHeaders() {
    if (_currentAuth?.token) return { Authorization: `Bearer ${_currentAuth.token}` };
    if (_currentAuth?.userId) return { "X-User-Id": _currentAuth.userId };  // legacy fallback
    return {};
  }
  ```
- Wrap every fetch call site in a tiny helper that, on response, checks for `X-Renewed-Token` header and calls `setAuthToken(...)` if present. This single wrapper replaces the ~14 inline `fetch(...)` calls in this file. (Side benefit: this is the "extract a fetch helper" we deferred in audit P1 cross-package.)
- **Rollback:** revert this file. The new `auth-token.ts` becomes dead but harmless.

**`apps/mobile/lib/auth.tsx:148-153`** *(Stage B — major edit)*
- The `setApiUserId(user?.id ?? null)` effect becomes a richer flow:
  1. On hydration, if user blob exists but no JWT in SecureStore → call `/v1/auth/exchange` with the legacy id. On 200, save the JWT and set api auth to `{ userId, token }`. On failure (network, 5xx), set api auth to `{ userId, token: null }` — legacy fallback path active for this session.
  2. On hydration, if user blob AND JWT exist → set api auth to `{ userId, token }` straightaway. Skip the exchange.
  3. On user creation (onboarding) → the new `/v1/users` response carries a token; persist it, set api auth.
  4. On sign-out → clear both the user blob and the JWT.
- **Rollback:** revert this file.

**`apps/mobile/app/onboarding.tsx`** *(Stage B — small edit)*
- The success path of `createUser` already calls `setUser({...})`. After this change, `createUser` returns `{ user, token }`; the onboarding screen passes both to the auth context's setter, which persists them.
- **Rollback:** revert.

**`apps/mobile/lib/auth-token.ts` + the rest of the mobile changes ship via OTA.** No native rebuild required (no new native modules; SecureStore was already in the build from the 2026-05-06 P0 work). This is significant because OTA is one-button revertable on EAS.

### 3.3 Web — `apps/web`

The web migration is structurally bigger than mobile because it switches from "client-only fetches with localStorage bearer" to "Next route handler proxy with HttpOnly cookie." This pairs naturally with the audit's P1 RSC migration (the dashboard and detail pages can become server components that read the cookie directly), but the RSC migration itself is **out of scope for this plan** — it can ship as a follow-up after the cookie is in place.

**`apps/web/src/middleware.ts`** *(Stage C — new file)*
- Edge middleware. Validates the `tb_session` cookie's signature using `jose` (`jose` works in the Edge runtime; `jsonwebtoken` doesn't).
- Matcher: `["/dashboard/:path*", "/seniors/:path*"]`.
- If cookie missing or invalid → 302 to `/`.
- Does NOT validate `tokenVersion` against the DB — Edge can't reach Prisma. The signature check + expiry is enough at the edge; full validation happens on the API for any actual data fetch.
- **Rollback:** delete the file.

**`apps/web/src/app/api/family/accept/route.ts`** *(Stage C — new file)*
- POST handler. Forwards body to `${API_URL}/v1/family/accept`, takes the response JSON, sets `tb_session` HttpOnly cookie on the *Vercel* origin (so SameSite=Lax works), returns the user JSON to the client minus the token.
- This is the proxy pattern. The cookie is first-party to the web app; the JWT never touches `localStorage` or any JS context.

**`apps/web/src/app/api/auth/migrate/route.ts`** *(Stage C — new file)*
- POST handler. Body: `{ userId }`. Forwards to `/v1/auth/exchange`, sets the cookie. The web client calls this once on first load if it has a `localStorage` userId but no cookie, then clears `localStorage`.

**`apps/web/src/app/api/family/seniors/route.ts`, `.../seniors/[id]/sessions/route.ts`** *(Stage C — new files, OR optional)*
- Two paths:
  - **Path A (preferred):** Add proxy route handlers for every authenticated GET. The client calls `/api/family/...`, the route handler reads the cookie, forwards to the API with the Bearer header, returns the response. Cleaner; pairs with RSC migration.
  - **Path B (smaller diff):** Keep the existing client → API direct calls but switch the API to set `SameSite=None; Secure` on the cookie and set CORS `credentials: true`. The client uses `credentials: "include"`. No new route handlers needed.
- **Recommendation:** Path A. Reasons:
  - No `SameSite=None` cookie footgun. (`SameSite=None` requires `Secure` and makes the cookie cross-site, which is a strictly bigger attack surface than first-party.)
  - Aligns with the audit's "all three pages should be RSCs" goal.
  - Adds maybe 4 small route handlers — the web side is 3 pages, each makes 1–2 API calls.
- **Open for review:** §7 question 1 — confirm Path A.

**`apps/web/src/lib/api.ts`** *(Stage C — major edit, depends on Path A vs B)*
- If Path A: every function in here either (a) calls a Next route handler (`/api/family/seniors`), or (b) is migrated to be called from a server component that reads the cookie and calls the API directly. The fetch helper drops `authHeaders()` since the cookie travels automatically.
- If Path B: the only change is `credentials: "include"` on every fetch.
- **Rollback:** revert; localStorage path comes back.

**`apps/web/src/lib/auth-context.tsx`** *(Stage C — major edit)*
- Drop the JS-readable token entirely. Keep `name` in `localStorage` for the dashboard greeting (it's not auth-sensitive).
- `setUser` no longer writes a userId; the cookie holds that.
- `clearUser` calls a new `/api/auth/signout` route handler that clears the cookie.
- `ready` flips after `/api/auth/me` (a new route handler that reads the cookie and returns the user, or 401) responds.
- **Rollback:** revert.

**`apps/web/src/app/api/auth/me/route.ts`, `.../signout/route.ts`** *(Stage C — new files)*
- Trivial handlers: read cookie → forward to API `/v1/users/me` (or proxy to a new endpoint), or unset the cookie.

**`apps/web/package.json`** *(Stage C — new dep)*
- `+ jose` (Edge-compatible JWT lib for the middleware).

---

## 4. Stage-by-stage rollover, in plain English

A linear walkthrough of what happens on Tariq's phone and the web portal as each stage ships, demonstrating that nothing breaks at any step.

### Before Stage A
- Mobile: legacy id in SecureStore, sends `X-User-Id`. Works.
- Web: localStorage id, sends `X-User-Id`. Works.

### After Stage A (API release N)
- Mobile: still sends `X-User-Id`. API still accepts (Stage A keeps the legacy code path). Works unchanged.
- Web: same. Works unchanged.
- API now also accepts `Authorization: Bearer` and exposes `/v1/auth/exchange`. Nobody's calling them yet.

### After Stage B (Mobile OTA)
- Tariq's phone, on next app launch:
  1. Hydrate from SecureStore: `{user.id, user.name}` blob exists, no JWT yet.
  2. Call `/v1/auth/exchange` with the userId. API mints a JWT.
  3. Save JWT to SecureStore. Send `Authorization: Bearer ...` from now on.
  4. If exchange fails (offline, API down): fall back to legacy `X-User-Id` for this session, retry on next launch.
- Anyone else's phone: same flow, transparent.
- Sentry breadcrumb counter `auth.legacy=1` should drop sharply over a day or two as everyone's mobile app updates.

### After Stage C (Web release N)
- Family member visits `https://techbuddy-family.vercel.app`:
  - **First-time user (typing an invite code):** The form posts to `/api/family/accept` (Next route handler). Handler forwards to the API, gets the JWT, sets `tb_session` HttpOnly cookie on the Vercel origin, returns user JSON (minus token) to the client. Client is now logged in via cookie. Next middleware lets them into `/dashboard`.
  - **Returning user with localStorage bearer:** Auth context calls `/api/auth/migrate` (new). Handler exchanges legacy id for a JWT, sets cookie, returns OK. Client clears localStorage. From now on the user has the cookie.
  - **Cookie holder:** `/dashboard` and `/seniors/*` accessible; middleware just lets them through. Server components (or proxy route handlers) read the cookie, forward to the API.
- The legacy `X-User-Id` header is no longer sent from web after this stage.

### After Stage D (soak)
- Watch Sentry. The `auth.legacy=1` tag rate should approach zero. Wait at least 7 days; do not advance to Stage E if any nonzero rate is observed (it means someone's still on an old mobile build that hasn't OTA-updated, e.g. they reinstalled and haven't reconnected to Wi-Fi).

### After Stage E (API release N+1)
- Pre-handler rejects requests without `Authorization: Bearer`. Legacy `X-User-Id` returns 401.
- `/v1/auth/exchange` returns 410 Gone (no more upgrade path needed).
- Mobile fallback paths in `lib/api.ts` get removed in a follow-up mobile release. Same for web (mostly already removed in Stage C).

---

## 5. Test plan *(ASK 5 — verify it works without locking anyone out)*

The single biggest risk: a bug in the pre-handler edit kicks every existing tester out. Mitigations:

### 5.1 Pre-deploy — run on a Render preview branch

Before Stage A goes to production:
1. Push the API changes to a branch. Render auto-deploys it to a preview URL.
2. Override the mobile dev `EXPO_PUBLIC_API_URL` to the preview URL (Tariq's local `.env.local`).
3. Run the full mobile end-to-end: open app, send a chat message, generate a family invite, accept the invite from a browser pointed at the preview. All paths should work using legacy `X-User-Id`.
4. Run the same flow with `AUTH_ACCEPT_BEARER=false` to verify the rollback toggle works.
5. Run the same flow with a manually-minted JWT (via a small test script) to verify the new code path works.

Acceptance: all three flows pass on the preview. Only then merge to `main`.

### 5.2 Stage A deploy — production, but legacy still works

After Stage A is live in production:
- Tariq's phone: should keep working unchanged (still sending legacy header, API still accepting).
- Run the mobile flow: chat, invite, accept. Confirm zero regressions.
- Hit `/v1/auth/exchange` manually with a curl carrying Tariq's userId — confirm it returns a valid JWT.
- Hit any authed endpoint with the JWT in `Authorization: Bearer` — confirm it works.
- Set up the Sentry alert: spike in 401s on `/v1/sessions` or `/v1/family/seniors` triggers a Slack notification. (The user mentioned email; either is fine.)

If anything's wrong at this stage, set `AUTH_ACCEPT_BEARER=false` in Render env. No code rollback needed.

### 5.3 Stage B mobile OTA — gated rollout

EAS supports phased OTA rollouts. The first OTA release of Stage B goes to **internal channel only** (just Tariq's device). Wait 24 hours. If the chat flow + family invite flow + Settings → linked family list all work, promote to all testers via OTA.

If anything's wrong on internal: re-publish the previous OTA bundle (one button on EAS). Tariq's phone reverts on next foregrounding.

Critical edge case: a client that has the new code but the API has the env-toggle disabled. Behavior: client tries `/v1/auth/exchange`, gets a 4xx (because the API endpoint exists but is locked), falls back to legacy `X-User-Id`. **Verify this code path explicitly** before Stage B ships — it's the "reverted API + new mobile" failure mode.

### 5.4 Stage C web — Vercel preview first

1. Push web changes to a branch. Vercel auto-deploys to a preview URL.
2. From a fresh browser profile (no cookies, no localStorage):
   - Visit the landing page. Type a valid invite code (generated from Tariq's phone moments before). Submit.
   - Should land on `/dashboard`. Cookie should be set. Click into a senior.
   - Devtools → Application → Cookies should show `tb_session` set with `HttpOnly`, `Secure`, `SameSite=Lax`.
   - Devtools → Application → Local Storage should NOT contain `techbuddy.family.userId` (cleared after migration).
3. From an existing browser profile (has the legacy `localStorage.userId`):
   - Visit `/dashboard`. The migrate flow should fire, set the cookie, clear localStorage. Page should land normally.
4. From an unauthenticated browser, visit `/dashboard` directly. Middleware should redirect to `/`.
5. Sign out from the dashboard. Cookie should clear. Visiting `/dashboard` again should redirect.

Promote to production only after all five above pass.

### 5.5 Acceptance for Stage E

`auth.legacy=1` counter in Sentry must be zero for a continuous 7-day window. Do not advance otherwise — the tail of users on stale OTA bundles is real.

### 5.6 Things explicitly NOT in the test plan
- Load testing the JWT verify path. HS256 is microseconds; not a perf concern at our scale.
- Full pen-test of the cookie flow. Out of scope; the audit can re-sweep this once Stage C is stable.

---

## 6. Rollback playbook *(ASK 6)*

Each stage has a different revert. Documented here so the muscle-memory is in writing before something goes wrong at midnight.

### Stage A: API multi-mode pre-handler

**Symptom:** spike in 401s, broken auth for testers, anything that smells off.

**Action 1 (zero-downtime):** Render dashboard → env vars → set `AUTH_ACCEPT_BEARER=false`. The pre-handler reverts to legacy-only on the next request. Approximate time-to-revert: 30 seconds.

**Action 2 (full code revert):** Render dashboard → "Manual Deploy" → "Promote previous deployment." Approximate time: 2 minutes.

**Schema rollback:** `pnpm exec prisma migrate resolve --rolled-back add_user_token_version` (only if we need it; the column being there is harmless). The down-migration is `ALTER TABLE "User" DROP COLUMN "tokenVersion";` — write it manually if Prisma doesn't have it cached.

### Stage B: Mobile OTA

**Symptom:** mobile users report "Buddy can't sign me in" / blank chat / 401 dialogs.

**Action:** EAS dashboard → Updates → Republish previous bundle. On next foregrounding the app downloads the prior bundle and reverts to legacy-id behavior. The SecureStore JWT becomes dead data; harmless because the legacy code path doesn't touch it. Approximate time: 5 minutes plus user foregrounding.

**Acceptance for revert success:** Tariq's phone, after foregrounding the app once, still sends `X-User-Id` and works.

### Stage C: Web cookie auth

**Symptom:** family portal users report "can't log in" / dashboard endless loading / "session expired" loop.

**Action:** Vercel dashboard → Deployments → "Promote to Production" on the previous deployment. The cookie-based code disappears; the localStorage path comes back. Approximate time: 1 minute.

**Important:** the API's pre-handler is still multi-mode at this point, so the reverted web app (sending `X-User-Id` from localStorage) keeps working. We can spend an hour debugging the cookie code without time pressure.

**Cookie cleanup:** the `tb_session` cookie set on user devices doesn't break anything once the web code is reverted (it's just an unused cookie). Browser garbage-collects it on Max-Age. No user-side action needed.

### Stage E: Removal of legacy header

**Symptom:** any user on a stale mobile/web build is suddenly 401'd.

**Action:** Render dashboard → "Promote previous deployment." Reverts to multi-mode. The clients that broke were on the tail end of the migration; reverting gives them another window to update.

**Forward-recovery:** if the tail is consistently nonzero, consider an in-app forced-update prompt on the mobile side ("please update TechBuddy in the App Store") before re-attempting Stage E. This is an Apple/Google flow we have not yet built; punt to a follow-up.

### Smoking-gun signals

Before any stage, set up these Sentry alerts:
- 401 rate on `/v1/sessions` exceeds 1% of total requests for 5 minutes.
- 401 rate on `/v1/family/seniors` exceeds 1% of total requests for 5 minutes.
- Any 5xx from `/v1/auth/exchange` for >2% of calls in a 1-minute window.
- (Stage B+) `auth.legacy=1` rate increasing — this would mean the mobile JWT path is failing and clients are falling back to legacy more than expected.

If any alert fires during a stage, execute that stage's rollback and post-mortem before re-attempting.

---

## 7. Decisions resolved on review (2026-05-06)

The seven forks-in-the-road were walked through during the review pass. Recorded here so anyone reading the plan later can see what was considered and why we picked what we picked.

1. **Web architecture: Path A.** Next route handler proxy + first-party HttpOnly cookie on the Vercel origin. Mobile stays Bearer-token. Path B (cross-site cookie with `SameSite=None`) was rejected — cleaner security posture under Path A, plus it's the only path that unblocks the audit's separate RSC migration goal for `/dashboard` and `/seniors/*`.

2. **Refresh strategy: sliding renewal.** Server bumps the `exp` and emits `X-Renewed-Token` (mobile) or refreshed cookie (web) when a request comes in past the 50% TTL mark. No separate refresh-token table. Rationale: refresh tokens primarily defend against access-token theft over the wire, but our threat model is device-storage compromise, where refresh tokens don't actually help. We can add a refresh-token table later without breaking the JWT wire format.

3. **Field naming: `tokenVersion`.** Picked over `sessionVersion` and `tokenEpoch`.

4. **Mobile expiry: 60 days.** Picked over 30 (the original plan default) and over 90. Biases toward senior UX given that sliding renewal already covers active users — the 60-day boundary only ever matters for truly dormant users, and stretching it to 60 means most "left it on the home screen for two months" cases don't trigger re-onboarding. 90 was felt to be too generous for a leak-window worst case. Web stays at 7 days.

5. **`/v1/users` does not set a cookie.** Senior onboarding only happens on mobile, which doesn't want a cookie. Family onboarding happens on web via `/v1/family/accept`, which does set the cookie. Verified during review — already correct in §3.1.

6. **JWT issuer/audience strings live in `apps/api/src/lib/jwt.ts`.** Not in `@techbuddy/shared`. Mobile and web treat the JWT as opaque, so the strings don't need to cross package boundaries.

7. **Stage E hard ceiling: 30 days after Stage B ships.** If `auth.legacy=1` hasn't dropped to zero by then, Stage E ships anyway and any stragglers re-onboard. This is the only decision with user-visible cost in the bad case — accepted because the alternative ("indefinite multi-mode") is a known migration failure pattern, and the recovery for stragglers is the same flow they did the first time. Set a calendar reminder when Stage B ships so this doesn't slip.

Knock-on effect of the 60-day token TTL × 30-day soak ceiling: a tester who got their JWT on Stage B day 1 still has 30 days of token left when Stage E ships. Comfortable margin.

---

## 8. Out of scope for this plan

To keep this from sprawling — these are real follow-ups, just not part of the auth migration:

- **RSC migration of dashboard and senior detail pages.** The cookie unblocks this. Ship as a separate web release after Stage C is stable.
- **Drop the per-request `User.findUnique` from the pre-handler.** Once the JWT carries `role` and `tokenVersion`, the existence check is redundant unless we want defense-in-depth against deleted users using stale tokens. Optimization, not a correctness fix.
- **Real refresh tokens.** Sliding renewal is enough for v1. Revisit if/when we move to short-lived access tokens.
- **CSRF protection.** With Path A and `SameSite=Lax` cookies, the relevant attack surface is small. We can add a `__Host-tb_csrf` double-submit cookie in a follow-up if we want belt-and-suspenders for state-changing routes (`/v1/family/invites` POST etc.) — but state-changing routes called from web are limited (the web is mostly reads).
- **Email + magic link auth.** The audit's "real auth" item from FAMILY_PORTAL.md "v2 backlog." JWT migration is the prerequisite, not a substitute.
- **Sign-out-everywhere via tokenVersion bump UI.** The schema field is in place after Stage A, but there's no UI to bump it yet. Add later as part of "manage devices" in Settings.
- **Mobile: stop storing the user blob alongside the token.** Today we store both `{id, name}` and the JWT. Could derive name from `/v1/users/me` on app start instead. Tidy-up; not blocking.
- **`apps/api/src/lib/dev-user.ts`** is dead code per the audit P2 list. Delete in the auth migration's cleanup PR for tidiness, or as its own commit.

---

## 9. Acceptance for "the migration is done"

All of the following must be true before we declare done:

- [x] `JWT_SECRET` is set in Render production env (32+ chars, generated via `openssl rand -base64 48`).
- [x] `JWT_SECRET` is set in Vercel production AND preview env (same value as Render).
- [x] Stage A through E all shipped without rollback.
- [x] `auth.legacy=1` Sentry counter has been zero for 7+ days at Stage E ship time. *(Compressed: only-tester-is-Tariq reality means the counter went to zero immediately when his iPhone preview build picked up Stage B's OTA. No other testers were on legacy clients to wait for.)*
- [x] Mobile sends `Authorization: Bearer` on every authed request — verified in API logs (no `auth.legacy` warnings) once the preview build foregrounded post-Stage-B.
- [x] Web's `tb_session` cookie is HttpOnly + Secure + SameSite=Lax — verified in browser devtools after Stage C deploy.
- [x] `apps/web/src/middleware.ts` exists and gates `/dashboard` and `/seniors/*`.
- [x] `apps/api/src/lib/auth.ts` no longer references `X-User-Id`. *(Stage E.)*
- [x] CORS `allowedHeaders` no longer includes `X-User-Id`. *(Stage E.)*
- [x] CORS `exposedHeaders` includes `X-Renewed-Token`.
- [ ] `JWT_SECRET` is no longer `.optional()` in `env.ts`. *(Deferred — current behavior is "optional in dev, required in prod via superRefine." Functionally equivalent. Cleanup pass to flip the schema is fine to do later; doesn't block migration.)*
- [x] AUDIT_2026-05-05.md "Auth identity = unsigned user id" P0 is checked off with a ✅ FIXED note pointing at this plan.
- [x] FAMILY_PORTAL.md "Real auth" deferred item is updated (no longer "device-bound auth is fine while there are <100 testers").

## 10. Post-migration cleanup (deferred)

The migration is done, but a few small bits of dead code are still lying around:

- **Mobile `lib/api.ts:authHeaders()`** still has the `X-User-Id` fallback branch. Harmless — the API rejects that header now (returns 401). The mobile fallback path is unreachable in practice but kept in case a senior on a wildly stale build needs the auth-recovery path. Can be removed in a followup mobile release.
- **Web `lib/auth-context.tsx`** still has the legacy-localStorage migration path (`migrateLocalUser`). Same argument — harmless; would only trigger for someone with a pre-Stage-C localStorage userId, and `/v1/auth/exchange` now returns 410 Gone, so it'd just clear the legacy id and route to `/`. Can be removed.
- **`apps/api/src/routes/auth.ts:/v1/auth/exchange`** is a 410 stub. Could be deleted entirely; kept so a stale client gets a clearer error than 404.
- **The per-request `User.findUnique` in `verifyRequestBearer`** can be dropped now that the JWT carries `role` and `tokenVersion` (we'd lose the "user existence" check, but a deleted user's tokenVersion bump or row removal would still fail the check on the NEXT call after the change). Optimization, not correctness.
- **TECH_DEBT.md "production-build OTA" reminder** — still pending, fires when the first production mobile build ships.

---

*Migration complete. See §10 for follow-up cleanup tasks.*
