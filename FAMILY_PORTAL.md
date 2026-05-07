# Family Portal — v1

The web app at `apps/web` that adult children of TechBuddy seniors log into to see how the senior is doing. Different audience from the senior app: tech-comfortable buyers, normal density UI, no senior-friendly tap-target rules.

This was built end-to-end overnight as the v1 MVP. Read this before touching it so you know what's intentional and what's deferred.

---

## What v1 does

1. **Senior generates an invite code** in their mobile app under **Settings → Invite a family member**. The code is 6 digits, expires after 7 days, single-use.
2. **Senior shares the code** with the family member via the OS share sheet (WhatsApp / SMS / email — whatever they prefer).
3. **Family member visits the portal** (`https://techbuddy-family.vercel.app` once deployed), enters the code + their name + an optional label for the senior ("Mom", "Grandpa Joe").
4. **Family lands on a dashboard** showing the seniors they're linked to, with each senior's most recent help session at a glance.
5. **Family can drill into a senior** to see a chronological list of their recent help sessions, each with the AI-generated summary (problem, goal, urgency, recommended route, tags).

That's the whole loop. Deliberately scoped down — see "What's deferred" below for what's NOT in v1.

---

## Architecture

```
Senior phone (Expo)            Family browser (Next.js)
        │                              │
        │  POST /v1/family/invites     │  POST /v1/family/accept
        │  → returns { code }          │  → creates User(role=FAMILY)
        │                              │     + FamilyLink, returns { user }
        │                              │
        └──────────────┐    ┌──────────┘
                       ▼    ▼
                 Fastify API on Render
                       │
                       ▼
                  Neon Postgres
                  (User, FamilyLink,
                   FamilyInvite,
                   Session, IssueSummary)
```

**Auth is device-bound on both sides.** The senior gets a User row at onboarding (`POST /v1/users`); the family member gets one at invite-acceptance (`POST /v1/family/accept`). Each side stores its user id in the local store (AsyncStorage on mobile, localStorage on web) and forwards it as the `X-User-Id` header on every subsequent call. The Fastify pre-handler in `apps/api/src/lib/auth.ts` validates that the header maps to a real user.

**Family routes additionally require role=FAMILY.** Senior accounts can't accidentally hit family endpoints, and family accounts can't hit senior-side mutation endpoints. See `apps/api/src/routes/family.ts` for the role checks (look for `me.role !== UserRole.FAMILY`).

**No transcripts in v1.** Family sees session metadata and AI summaries — never the raw chat between Buddy and the senior. This is a privacy default; revisit only with an explicit senior-side opt-in toggle.

---

## File tour

### Database (`apps/api/prisma/schema.prisma`)

- `BugReportScreen` and `BugReport` — already there from the bug-report feature; mentioned only because they're sitting next to the new family models.
- `FamilyLink` — the join table. `(familyUserId, seniorUserId)` is the unique key so a given pair only links once. Cascades on either side.
- `FamilyInvite` — single-use code with a 7-day expiry. Tracks `acceptedAt` + `acceptedByUserId` for audit.

`User` got back-relations: `familyLinksAsSenior`, `familyLinksAsFamily`, `invitesCreated`, `invitesAccepted`. The `UserRole` enum (`SENIOR`, `FAMILY`, `TECHNICIAN`) was already there from earlier.

### API (`apps/api/src/routes/family.ts`)

Four endpoints:

| Method | Path                                  | Auth                  | Purpose                                              |
| ------ | ------------------------------------- | --------------------- | ---------------------------------------------------- |
| POST   | `/v1/family/invites`                  | senior only           | Generate a fresh 6-digit code for the senior.        |
| POST   | `/v1/family/accept`                   | allowlisted (no auth) | Family enters code, creates User + FamilyLink.       |
| GET    | `/v1/family/seniors`                  | family only           | List seniors this family member is linked to.        |
| GET    | `/v1/family/seniors/:id/sessions`     | family only           | Sessions for a linked senior, with AI summaries.     |

`/v1/family/accept` is added to the auth allowlist in `apps/api/src/lib/auth.ts` (next to `POST /v1/users`).

### Mobile (`apps/mobile`)

- `lib/api.ts` — added `createFamilyInvite()` typed wrapper.
- `lib/i18n.tsx` — 10 new keys (`invite_family_*`) in en/fr/es. Type-checked across all three.
- `components/invite-family-modal.tsx` — modal that opens, calls the API, shows the code in massive 48pt type, and offers a `Share` button using React Native's built-in `Share` API (no clipboard dep needed). Handles loading/ready/error states.
- `app/settings.tsx` — new "Family" section with the **Invite a family member** row that opens the modal.

The portal URL is currently hardcoded in `invite-family-modal.tsx` as `FAMILY_PORTAL_URL = "https://techbuddy-family.vercel.app"`. Move to an `EXPO_PUBLIC_FAMILY_URL` env var once you know the real Vercel URL.

### Web (`apps/web` — was a placeholder; now a real Next.js app)

```
apps/web/
├── package.json          (Next 14 + Tailwind + TypeScript)
├── next.config.mjs
├── tsconfig.json
├── tailwind.config.ts    (extended with brand palette: ink/muted/brand/etc.)
├── postcss.config.mjs
├── .env.example          (NEXT_PUBLIC_API_URL)
├── .gitignore
└── src/
    ├── app/
    │   ├── layout.tsx           (root, wraps in <AuthProvider>)
    │   ├── globals.css          (Tailwind base + light theme)
    │   ├── page.tsx             (landing — invite code entry)
    │   ├── dashboard/page.tsx   (linked seniors list)
    │   └── seniors/[id]/page.tsx (sessions + AI summaries)
    ├── components/
    │   └── portal-header.tsx    (shared header w/ sign out)
    └── lib/
        ├── api.ts               (typed family-API client)
        ├── auth-context.tsx     (React context + localStorage)
        └── formatters.ts        (timeAgo, statusLabel/Tone, etc.)
```

All pages are `"use client"` — no server components. Auth is localStorage-based; SSR doesn't help here and adds complexity.

---

## Running locally

You need three terminals, same as before:

```powershell
# 1. Backend
cd "C:\Users\Tariq\Documents\Claude\Projects\Senior IT Help\techbuddy"
pnpm dev:api

# 2. Web portal
pnpm dev:web    # → http://localhost:3000

# 3. Mobile (your existing terminal)
pnpm dev:mobile
```

**Before the first run** you'll need to install the new web deps and apply the Prisma migration:

```powershell
cd "C:\Users\Tariq\Documents\Claude\Projects\Senior IT Help\techbuddy"
pnpm install            # picks up Next.js + Tailwind + Postcss for apps/web
cd apps/api
pnpm exec prisma migrate dev --name add_family_portal
```

The migration adds the `family_links` and `family_invites` tables.

### End-to-end smoke test

1. On the phone (or in the simulator if you've set one up): open Settings → tap **Invite a family member**. You should see a 6-digit code.
2. On the desktop browser: visit `http://localhost:3000`, type the code + your name, click Continue.
3. You should land on the dashboard with one linked senior. Click their card.
4. You should see your senior's recent sessions; if any have hit the 6-message threshold for AI summarization, you'll see the summary block (problem / urgency / recommended route / tags).

If the dashboard is empty after Continue, you submitted the wrong code or it's expired — generate a fresh one from the phone.

---

## Production deployment

### Backend

No new steps. Render auto-deploys from `main`. The new migration runs on boot via the existing `pnpm --filter @techbuddy/api start` script (which is `prisma migrate deploy && node dist/server.js`).

**Don't forget to add the family portal URL to CORS_ORIGINS** in Render env vars once Vercel gives you the URL:

```
CORS_ORIGINS=https://techbuddy-family.vercel.app,http://localhost:3000,http://localhost:8081,...
```

### Family portal (Vercel)

The simplest path:

1. Push to GitHub (you already do this).
2. On Vercel: New Project → import your `Tarique655/techbuddy` repo → set the **Root Directory** to `apps/web`.
3. Vercel auto-detects Next.js. Override the install command if needed:
   - **Install:** `cd ../.. && pnpm install --frozen-lockfile`
   - **Build:** `pnpm --filter @techbuddy/web build`
   - **Output:** `apps/web/.next` (default, auto-detected)
4. Add the env var `NEXT_PUBLIC_API_URL=https://techbuddy-api.onrender.com` (Production scope).
5. Deploy. Vercel will give you a URL like `techbuddy-family.vercel.app` (or your custom domain).
6. Update `FAMILY_PORTAL_URL` in `apps/mobile/components/invite-family-modal.tsx` if Vercel hands you a different URL than the placeholder.

### After Vercel goes live

7. Add the Vercel URL to CORS on Render (see above).
8. OTA-push the mobile change so seniors see the right URL in the share message.

---

## What's deferred (a.k.a. v2 backlog)

These are intentionally NOT in v1. Add them when there's a real user demanding them, not before.

- **Full chat transcripts.** Family sees summaries, not the back-and-forth. Adding this needs a senior-side toggle ("let my family read my messages") and an explicit consent flow. Privacy default-on.
- **Bug reports view.** Family doesn't see the senior's bug-report submissions. Probably worth adding to the per-senior page later — useful so family can help diagnose.
- **Real auth.** ✅ **DONE 2026-05-06** — full JWT migration shipped (see JWT_MIGRATION_PLAN.md). Family portal now uses HttpOnly `tb_session` cookies set by Next route handlers on the Vercel origin; the JWT never enters client JS; Edge middleware gates `/dashboard` and `/seniors/*`. Email + magic link is still future work (would let a family member sign in from a second device without a fresh invite code), but the underlying auth model is no longer "device id as bearer."
- **Family-side i18n.** Portal is English-only. The senior app is en/fr/es — the portal isn't yet. The strings are mostly inline JSX; would need a small i18n setup like `next-intl`.
- **Multi-senior families with role nuances.** A family member can have multiple linked seniors (the model supports it), but there's no way for a family member to *invite a second family* on behalf of a senior, no notion of "primary" vs "view-only" family, no per-senior privacy tweaks.
- **Notifications.** No push, no email digests, no "your senior had a high-urgency session" alerts. Big future feature.
- **Sign-in from another device.** Family auth is localStorage on one browser. To log in from a phone after using the laptop, they'd need a fresh invite code from the senior. Magic link fixes this; defer until then.
- **Pagination on the sessions list.** Hard cap at 50 most recent. With a chatty senior this could fall short; not yet.
- **Senior-side: see who's linked.** Senior has no way to see which family members have accepted their invites or revoke a link. Worth adding before any real privacy concerns surface.
- **Vercel Analytics + error monitoring.** No Sentry on the web side yet. Add `@sentry/nextjs` once you start sending the URL to real testers.
- **The "TECHBUDDY logo" wordmark in the portal.** Currently just text — drop in the SVG / image when you have it.

---

## Things to test in the morning

A short list to verify before you ship:

- [ ] `pnpm install` from the repo root succeeds (new web deps install cleanly).
- [ ] `pnpm exec prisma migrate dev --name add_family_portal` from `apps/api` succeeds and creates the migration file.
- [ ] `pnpm dev:web` starts Next on port 3000.
- [ ] `pnpm dev:api` still works (no regressions from the new route).
- [ ] `pnpm typecheck` from the repo root passes for all packages.
- [ ] On the phone: Settings → Invite a family member → modal opens, shows a code.
- [ ] In the browser: enter the code at `http://localhost:3000` → land on dashboard → click into senior → see sessions.
- [ ] Submit a chat message that triggers an IssueSummary (6+ messages in a session) and verify the summary block renders correctly on the senior detail page.
- [ ] Refresh the dashboard with no internet — should show the error state, not a blank page.

If everything checks out, commit, push, deploy.
