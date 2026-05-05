# TechBuddy

AI-powered tech support for seniors. Monorepo.

```
techbuddy/
├── apps/
│   ├── mobile/      React Native + Expo — the senior's iOS/Android app
│   ├── desktop/     Electron — the Windows/Mac companion for remote desktop
│   ├── web/         Next.js — the family portal
│   └── api/         Fastify + Postgres — the backend (Claude calls live here)
├── packages/
│   └── shared/      Shared TypeScript types, design tokens, validation schemas
├── .env.example     Template for environment variables (copy → apps/api/.env)
├── package.json     Root workspace config
└── pnpm-workspace.yaml
```

## Quick start

After completing `../SETUP.md`:

```powershell
cd techbuddy
pnpm install
cp .env.example apps/api/.env   # then fill in real values
pnpm dev:api                    # starts backend on :4000
pnpm dev:web                    # starts family portal on :3000
pnpm dev:mobile                 # starts Expo dev server
pnpm dev:desktop                # starts Electron in dev (placeholder)
```

## Surface-specific docs

- `FAMILY_PORTAL.md` — architecture + dev + deploy guide for the web app
- `TECH_DEBT.md` — known shortcuts and follow-ups
- `apps/api/README.md` — backend specifics
- `apps/mobile/README.md` — mobile specifics

## Design principles (from the project doc)

- One thing per screen
- No jargon — ever
- 18pt minimum font, 48px minimum tap targets
- Always a visible exit
- Reassurance over efficiency

These apply to the senior-facing surfaces (mobile, desktop). The family portal (web) and the technician portal can use normal app density.

## Where things live

| Concern | Lives in |
|---|---|
| Claude API calls | `apps/api` only — never in client code |
| API keys / secrets | `apps/api/.env` — never committed |
| Shared types (e.g. `IssueSummary`) | `packages/shared/src/types.ts` |
| Design tokens (colors, font sizes) | `packages/shared/src/tokens.ts` |
| Database schema | `apps/api/prisma/schema.prisma` |

## Stack

- **TypeScript** end-to-end
- **Mobile:** React Native + Expo SDK 51, EAS Build for iOS
- **Desktop:** Electron + electron-vite
- **Web:** Next.js 15 (App Router) + Tailwind
- **API:** Fastify + Zod + Prisma
- **DB:** PostgreSQL (Neon in dev)
- **Package manager:** pnpm 9 with workspaces
