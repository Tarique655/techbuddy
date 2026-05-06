// NOTE: Sentry initializes via Node's --import flag in package.json's
// dev/start scripts (`node --import ./dist/instrument.js dist/server.js`).
// Doing it that way guarantees Sentry.init runs *before* the ESM module
// graph resolves, which is required for Sentry's auto-instrumentation
// of Fastify/HTTP to actually monkey-patch them.
//
// Importing instrument.js here at the top of server.ts is NOT enough:
// ESM hoists imports, so by the time the side-effect ran, Fastify had
// already loaded — and Sentry's patches missed their window. Hence the
// `[Sentry] fastify is not instrumented` warning we used to get.
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import * as Sentry from "@sentry/node";

import { env } from "./lib/env.js";
import { registerAuth } from "./lib/auth.js";
import { authRoutes } from "./routes/auth.js";
import { bugReportRoutes } from "./routes/bug-reports.js";
import { chatRoutes } from "./routes/chat.js";
import { debugRoutes } from "./routes/debug.js";
import { familyRoutes } from "./routes/family.js";
import { sessionsRoutes } from "./routes/sessions.js";
import { userContextRoutes } from "./routes/user-context.js";
import { userRoutes } from "./routes/users.js";

const fastify = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
        : undefined,
  },
  // Raise to 10 MB so base64-encoded photos from the camera fit. A 1080p
  // JPEG at quality 0.6 typically encodes to ~300–600 KB; 10 MB is generous.
  bodyLimit: 10 * 1024 * 1024,
  // We sit behind Render's proxy in production. trustProxy: true tells
  // Fastify to read the client IP out of `X-Forwarded-For` so per-IP
  // rate limits target real callers, not the Render proxy. Locally with
  // no proxy in front, this is a no-op (no X-F-F header to trust).
  trustProxy: true,
});

// Cookie plugin must register before routes so reply.setCookie /
// request.cookies are available everywhere. The `tb_session` cookie
// (set by /v1/family/accept and the renewal hook) is HttpOnly + Secure
// in prod, so we don't strictly need a `secret` for signing here — the
// cookie's *contents* are an HS256-signed JWT, so an unsigned cookie
// envelope is fine.
await fastify.register(cookie);

await fastify.register(cors, {
  // In dev, allow Expo Go and the family web portal. In prod we'll lock this down.
  origin: (origin, cb) => {
    // Mobile apps (Expo Go on a physical device) often send no Origin header.
    if (!origin) return cb(null, true);
    if (env.CORS_ORIGINS.includes(origin)) return cb(null, true);
    if (env.NODE_ENV === "development") return cb(null, true);
    cb(new Error("Not allowed by CORS"), false);
  },
  // X-User-Id is the legacy header (Stage A multi-mode). Authorization
  // is the JWT path. Both kept until Stage E removes the legacy column.
  allowedHeaders: ["Content-Type", "X-User-Id", "Authorization"],
  // exposedHeaders: the mobile fetch wrapper reads X-Renewed-Token to
  // catch sliding renewals. Browsers won't expose it to JS unless we
  // list it explicitly.
  exposedHeaders: ["X-Renewed-Token"],
  // Allow cookies to flow on cross-origin requests. Today the web side
  // goes through Next route handlers (Path A), so the API doesn't see
  // cross-origin cookied requests in practice — but flipping this on
  // is harmless and future-proofs any direct client → API calls.
  credentials: true,
});

// Sentry's Fastify integration. Captures unhandled errors in route
// handlers and bubbles them to the Sentry dashboard. No-ops if
// SENTRY_DSN wasn't set — instrument.ts didn't init then.
Sentry.setupFastifyErrorHandler(fastify);

// Auth hook MUST register before the route registrations below, so its
// pre-handler covers them. Allowlisted paths (/healthz, POST /v1/users,
// POST /v1/family/accept, POST /v1/auth/exchange) are handled inside
// lib/auth.ts.
await registerAuth(fastify);

fastify.get("/healthz", async () => ({
  status: "ok",
  service: "techbuddy-api",
  env: env.NODE_ENV,
}));

await fastify.register(authRoutes);
await fastify.register(userRoutes);
await fastify.register(chatRoutes);
await fastify.register(sessionsRoutes);
await fastify.register(userContextRoutes);
await fastify.register(bugReportRoutes);
await fastify.register(familyRoutes);
await fastify.register(debugRoutes);

try {
  // Bind to 0.0.0.0 so the senior's phone (on the same Wi-Fi as the dev
  // machine) can reach us at http://<lan-ip>:4000.
  await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
