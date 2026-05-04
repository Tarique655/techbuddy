# @techbuddy/api

The backend. **Every Claude API call lives here, never in a client.**

**Stack:** Fastify + Zod + Prisma + Anthropic SDK + PostgreSQL.

## First-time scaffold (after env setup is verified)

From this folder:

```powershell
pnpm init
pnpm add fastify @fastify/cors @fastify/sensible zod @anthropic-ai/sdk
pnpm add prisma @prisma/client
pnpm add -D typescript tsx @types/node
npx tsc --init
npx prisma init --datasource-provider postgresql
```

Then copy `../../.env.example` to `./.env` and fill in `ANTHROPIC_API_KEY`, `DATABASE_URL`, `JWT_SECRET`.

## Endpoints (planned)

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/sessions` | Create a new support session for a senior |
| POST | `/v1/sessions/:id/messages` | Senior message → Buddy reply (streamed) |
| POST | `/v1/sessions/:id/summarize` | Auto-generate `IssueSummary` after 3–5 turns |
| POST | `/v1/sessions/:id/route` | Route to AI-fix / human / callback based on summary |
| POST | `/v1/sessions/:id/images` | Upload + analyze an intake photo via Claude Vision |
| POST | `/v1/sessions/:id/escalate` | Page a human technician with the pre-filled summary |
| GET | `/v1/family/:familyId/sessions` | Family portal — list sessions for linked seniors |

## Data model (planned, in `prisma/schema.prisma`)

`User` (senior or family member), `FamilyLink`, `Session`, `Message`, `IssueSummary`, `Image`, `TechnicianAssignment`, `Subscription`.

## Why Fastify (not Express)

- Native Zod-style schema validation
- Faster, lower overhead, better TypeScript ergonomics
- Built-in plugin model for auth, logging, rate limiting
