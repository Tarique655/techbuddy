import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Device, MessageRole, Prisma } from "@prisma/client";
import * as Sentry from "@sentry/node";

import { anthropic, BUDDY_MODEL_CONFIG, deviceContextLine } from "../lib/buddy.js";
import { db } from "../lib/db.js";
import { checkChatRateLimit } from "../lib/rate-limit.js";
import { summarizeAndSave } from "../lib/summarize.js";

/**
 * Schema for the chat endpoint. The mobile app sends the full message
 * history every turn — Anthropic's API is stateless. We persist each
 * incoming user message + outgoing assistant message to the DB so that
 * sessions show up in history, but the source-of-truth conversation
 * state is still what the client passes in (no DB read on the hot path).
 */
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const DeviceKeySchema = z.enum([
  "computer",
  "phone",
  "tablet",
  "tv",
  "printer",
  "wifi",
  "other",
]);

const ImageInputSchema = z.object({
  /** Base64-encoded image data, no data URL prefix. */
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  /** Optional senior name so Buddy can use it. */
  seniorName: z.string().max(80).optional(),
  /** Device the senior picked on the device-picker screen. */
  device: DeviceKeySchema.optional(),
  /** Existing session to append to. If absent, we start a new session. */
  sessionId: z.string().min(1).optional(),
  /**
   * If present, attached to the LAST user message as a Claude Vision input.
   * Not persisted to the DB in v1 — only Buddy's text analysis survives the
   * conversation, which is enough context for follow-up turns.
   */
  image: ImageInputSchema.optional(),
  /** Language Buddy should reply in. Defaults to English. */
  language: z.enum(["en", "fr", "es"]).optional(),
});

type DeviceKey = z.infer<typeof DeviceKeySchema>;

/** wire format ("computer") → Prisma enum (COMPUTER) */
function deviceKeyToEnum(d: DeviceKey): Device {
  return d.toUpperCase() as Device;
}

export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/v1/chat", async (request, reply) => {
    const parse = ChatRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }

    const { messages, seniorName, device, sessionId, image, language } =
      parse.data;
    const userId = request.userId;

    // -------------------------------------------------------------------------
    // Rate limit check.
    //
    // Cheap in-memory check — no DB, no Anthropic call cost. Catches tight
    // loops and adversarial usage before they can rack up a bill. Friendly
    // 429 with a Retry-After header so the client can back off gracefully.
    // -------------------------------------------------------------------------
    const rl = checkChatRateLimit(userId);
    if (!rl.allowed) {
      request.log.warn(
        { userId, reason: rl.reason, retryAfterSec: rl.retryAfterSec },
        "rate limit exceeded"
      );
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.code(429).send({
        error: "rate_limit_exceeded",
        message:
          "You're sending messages too quickly. Please wait a moment before trying again.",
        retryAfterSec: rl.retryAfterSec,
      });
    }

    // -------------------------------------------------------------------------
    // Resolve or create the session.
    //
    // For existing sessions, the device on the row is the source of truth —
    // we ignore the client-provided `device` to keep context consistent
    // across resumes. For new sessions, we trust the client (they just
    // picked it on the device picker screen).
    // -------------------------------------------------------------------------
    let session;
    let effectiveDevice: DeviceKey | undefined;

    if (sessionId) {
      session = await db.session.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) {
        return reply.code(404).send({
          error: "session_not_found",
          message: "That session doesn't exist or doesn't belong to you.",
        });
      }
      effectiveDevice = session.device
        ? (session.device.toLowerCase() as DeviceKey)
        : undefined;
    } else {
      session = await db.session.create({
        data: {
          userId,
          device: device ? deviceKeyToEnum(device) : null,
        },
      });
      effectiveDevice = device;
      request.log.info(
        { sessionId: session.id, device },
        "started new session"
      );
    }

    // -------------------------------------------------------------------------
    // Persist the new user message (the last item in `messages`).
    // -------------------------------------------------------------------------
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === "user") {
      await db.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.USER,
          content: lastMsg.content,
        },
      });
    }

    // -------------------------------------------------------------------------
    // Build system prompt and call Claude.
    //
    // We layer four kinds of context on top of the persona:
    //   1. The senior's name (if known).
    //   2. The device they're asking about right now.
    //   3. Long-lived "About me" facts they've recorded — devices they own,
    //      accounts they use. Buddy uses these so it doesn't have to ask
    //      "what kind of computer do you have?" every conversation.
    //   4. Language override for non-English replies.
    // -------------------------------------------------------------------------
    const userFacts = await db.userContext.findMany({
      where: { userId },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    const factsBlock =
      userFacts.length > 0
        ? `Things ${seniorName ?? "the senior"} has told us about themselves and their setup (use these naturally; don't re-ask):\n${userFacts
            .map((f) => `- ${f.kind.toLowerCase()}: ${f.label} — ${f.details}`)
            .join("\n")}`
        : null;

    const contextLines = [
      seniorName ? `The senior's name is ${seniorName}.` : null,
      effectiveDevice ? deviceContextLine(effectiveDevice) : null,
      factsBlock,
      language === "fr"
        ? "IMPORTANT: Always respond in French. Use the formal \"vous\" form when addressing the senior — it's the respectful, age-appropriate register. Keep all icon markers (e.g. [icon:refresh]) in their English form; only the surrounding prose is translated."
        : null,
      language === "es"
        ? "IMPORTANT: Always respond in Spanish (Spain — castellano). Use the formal \"usted\" form when addressing the senior — it's the respectful, age-appropriate register. Use Spain Spanish vocabulary (e.g. \"ordenador\" not \"computadora\", \"móvil\" or \"teléfono\" not \"celular\"). Keep all icon markers (e.g. [icon:refresh]) in their English form; only the surrounding prose is translated."
        : null,
    ].filter(Boolean);

    const system =
      contextLines.length > 0
        ? `${BUDDY_MODEL_CONFIG.system}\n\n${contextLines.join("\n\n")}`
        : BUDDY_MODEL_CONFIG.system;

    // -------------------------------------------------------------------------
    // Build the messages we send to Claude. If an image is attached, we
    // upgrade the LAST user message to a multimodal block (image + text).
    // The persisted DB record stays text-only — Buddy's analysis carries
    // the photo's content forward into future turns.
    // -------------------------------------------------------------------------
    const claudeMessages = messages.map((m, i) => {
      const isLast = i === messages.length - 1;
      if (isLast && m.role === "user" && image) {
        return {
          role: "user" as const,
          content: [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: image.mediaType,
                data: image.base64,
              },
            },
            { type: "text" as const, text: m.content },
          ],
        };
      }
      return m;
    });

    try {
      const response = await anthropic.messages.create({
        model: BUDDY_MODEL_CONFIG.model,
        max_tokens: BUDDY_MODEL_CONFIG.max_tokens,
        system,
        messages: claudeMessages,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const text =
        textBlock && textBlock.type === "text" ? textBlock.text : "";

      // Persist Buddy's reply.
      await db.message.create({
        data: {
          sessionId: session.id,
          role: MessageRole.ASSISTANT,
          content: text,
        },
      });

      // -----------------------------------------------------------------------
      // Fire-and-forget triage summary.
      //
      // Trigger when:
      //   - Session has 6+ messages (3+ exchanges) AND no summary exists, OR
      //   - Session has 4+ new messages since the last summary.
      //
      // Detached from the response so the senior's chat stays snappy. Errors
      // are logged but never bubble up — failure to summarize must not break
      // the chat.
      // -----------------------------------------------------------------------
      void (async () => {
        try {
          const [totalMessages, existing] = await Promise.all([
            db.message.count({ where: { sessionId: session.id } }),
            db.issueSummary.findUnique({
              where: { sessionId: session.id },
              select: { messageCount: true },
            }),
          ]);

          const shouldGenerate = !existing && totalMessages >= 6;
          const shouldRefresh =
            existing !== null && totalMessages >= existing.messageCount + 4;

          if (shouldGenerate || shouldRefresh) {
            await summarizeAndSave(session.id);
            request.log.info(
              { sessionId: session.id, totalMessages, refresh: !!existing },
              "issue summary generated"
            );
          }
        } catch (err) {
          request.log.error(
            { err, sessionId: session.id },
            "background summary failed"
          );
          Sentry.captureException(err, {
            tags: { route: "chat", job: "background_summary" },
            extra: { sessionId: session.id, userId },
          });
        }
      })();

      return reply.send({
        sessionId: session.id,
        message: { role: "assistant" as const, content: text },
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      });
    } catch (err) {
      // We've already persisted the user message above. Don't roll it back —
      // it really happened from the senior's perspective. The client will
      // retry, and the next attempt will append a new assistant turn.
      request.log.error({ err, sessionId: session.id }, "anthropic call failed");
      Sentry.captureException(err, {
        tags: { route: "chat", upstream: "anthropic" },
        extra: { sessionId: session.id, userId },
      });
      return reply.code(502).send({
        error: "upstream_error",
        message: "Buddy is having trouble right now. Please try again.",
        sessionId: session.id,
      });
    }
  });
}

// keep linter happy when Prisma namespace is unused
void Prisma;
