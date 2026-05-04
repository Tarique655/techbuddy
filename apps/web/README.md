# @techbuddy/web

The family portal — used by adult children, not the senior. Different design rules from the mobile app: normal density is fine, the audience is tech-comfortable buyers.

**Stack:** Next.js 15 (App Router) + Tailwind + TypeScript.

## To scaffold (after env setup is verified)

From this folder:

```powershell
pnpm create next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*"
```

## Responsibilities

- Marketing site (top of funnel): pricing, testimonials, "give your parent peace of mind"
- Auth (the senior is auto-enrolled by the family member; family creates the account)
- Session history per linked senior, with resolution status
- Subscription / billing (Stripe)
- "Tech profile" notes for technicians
- Notification preferences
