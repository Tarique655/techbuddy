import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BugReportScreen } from "@prisma/client";
import * as Sentry from "@sentry/node";

import { db } from "../lib/db.js";

/**
 * In-app "Report a bug" submissions.
 *
 * Volume is expected to be tiny (a few per tester per week), so we accept
 * the screenshot inline as base64 and persist it on the row. If we ever
 * grow into real volume we'll move screenshots to object storage and
 * keep just a URL here — schema-wise that's a column rename.
 *
 * Each report is also forwarded to Sentry as a `captureMessage` so the
 * dev (Tariq) sees it in the same dashboard as crashes/errors. The DB
 * row is the source of truth; Sentry is a notification channel.
 */
const ImageInputSchema = z.object({
  /** Base64-encoded image data, no data URL prefix. */
  base64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

const ScreenSchema = z.enum(["home", "chat", "other"]);

const BugReportRequestSchema = z.object({
  /** Free-form description from the senior. Capped to keep requests sane. */
  description: z.string().trim().min(1).max(4000),
  /** Optional screenshot. Same shape we use on /v1/chat. */
  image: ImageInputSchema.optional(),
  /** Where in the app the senior tapped "Report a bug". */
  screen: ScreenSchema,
  /** Soft pointer to the chat session if reported from /chat. */
  sessionId: z.string().min(1).optional(),
  /** Free-form client-provided context. All optional. */
  platform: z.string().max(40).optional(),
  appVersion: z.string().max(40).optional(),
  locale: z.string().max(10).optional(),
});

function screenToEnum(s: z.infer<typeof ScreenSchema>): BugReportScreen {
  return s.toUpperCase() as BugReportScreen;
}

export async function bugReportRoutes(fastify: FastifyInstance) {
  fastify.post("/v1/bug-reports", async (request, reply) => {
    const parse = BugReportRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({
        error: "invalid_request",
        details: parse.error.issues,
      });
    }

    const {
      description,
      image,
      screen,
      sessionId,
      platform,
      appVersion,
      locale,
    } = parse.data;
    const userId = request.userId;

    const created = await db.bugReport.create({
      data: {
        userId,
        sessionId: sessionId ?? null,
        screen: screenToEnum(screen),
        description,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
        platform: platform ?? null,
        appVersion: appVersion ?? null,
        locale: locale ?? null,
      },
      select: { id: true },
    });

    request.log.info(
      {
        bugReportId: created.id,
        userId,
        screen,
        hasImage: !!image,
        sessionId,
      },
      "bug report submitted"
    );

    // Forward to Sentry as a low-severity event so it lands in the same
    // dashboard as crashes. Image is omitted — Sentry's payload limits
    // would clip large base64 anyway, and the DB has the full record.
    Sentry.captureMessage("bug report submitted", {
      level: "info",
      tags: { route: "bug-reports", screen },
      extra: {
        bugReportId: created.id,
        userId,
        sessionId,
        platform,
        appVersion,
        locale,
        hasImage: !!image,
        descriptionPreview: description.slice(0, 200),
      },
    });

    return reply.code(201).send({ id: created.id });
  });
}
