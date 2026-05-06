// Shared TypeScript wire types — every app imports from here.
//
// Source of truth: the API's serializers (apps/api/src/routes/*.ts and
// apps/api/src/lib/summarize.ts). Mobile and web both consume these,
// so any drift here will surface as a typecheck failure in CI before
// it reaches a deploy.
//
// What lives here:
//   - Enum-like string unions for stable categorical fields (DeviceKey,
//     SessionStatus, Urgency, RecommendedRoute, MessageRole)
//   - Wire DTOs used across both clients (ImageInput, IssueSummary)
//
// What does NOT live here:
//   - Per-app screen-state types (Bubble, FormState, etc.)
//   - DB-shaped types (those live in @prisma/client on the api side)
//   - UI tokens (those are in tokens.ts)

// =============================================================================
// Categorical wire enums
// =============================================================================

/**
 * Device the senior chose at intake. Stable wire format mirrored by the
 * Prisma `Device` enum on the API side (uppercase) and by the labels
 * the mobile UI shows (translated via i18n).
 */
export type DeviceKey =
  | "computer"
  | "phone"
  | "tablet"
  | "tv"
  | "printer"
  | "wifi"
  | "other";

/**
 * Lifecycle state of a help session. Mirrors Prisma's `SessionStatus`
 * enum (uppercase). Wire format is lowercase — the API does the case
 * conversion in its serializers.
 */
export type SessionStatus =
  | "active"
  | "resolved_ai"
  | "escalated"
  | "abandoned";

/** Buddy ↔ Senior message authorship in chat transcripts. */
export type MessageRole = "user" | "assistant";

/** Triage urgency rating — see `lib/summarize.ts` on the API. */
export type Urgency = "low" | "medium" | "high";

/**
 * Where the triage layer thinks this session should be routed.
 * Three values to allow a hybrid "Buddy first, person if needed" path
 * — we use it on the family portal to color-code session cards.
 */
export type RecommendedRoute =
  | "ai"
  | "ai_with_human_fallback"
  | "human";

// =============================================================================
// Wire DTOs
// =============================================================================

/**
 * Base64-encoded image input shared between the chat (vision) endpoint
 * and the bug-report endpoint. The wire format deliberately omits a
 * `data:` URL prefix — the receiving client wraps it before display
 * if needed. Size is capped server-side at 7 MB of base64.
 */
export type ImageInput = {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

/**
 * AI-generated triage summary returned by the API alongside session
 * data. Shape exactly mirrors `apps/api/src/lib/summarize.ts`'s
 * `SummaryWire` so the family portal can render it without remapping.
 */
export type IssueSummary = {
  id: string;
  sessionId: string;
  problem: string;
  goal: string;
  tags: string[];
  /** 0–100. 0–40 simple AI fix; 40–70 moderate; 70–100 human territory. */
  complexity: number;
  urgency: Urgency;
  recommendRoute: RecommendedRoute;
  imageAttached: boolean;
  messageCount: number;
  /** ISO timestamp the summary was first generated. */
  generatedAt: string;
  /** ISO timestamp of the most recent regeneration. */
  updatedAt: string;
};

/**
 * Vision-analysis structured output for the (planned) scam-popup
 * detection feature. Shape is finalized; the endpoint that fills it
 * doesn't exist yet.
 */
export type VisionAnalysis = {
  /** All visible text Claude could read in the image. */
  visibleText: string;
  /** "Windows 11, Microsoft Edge, certificate error" style. */
  context: string;
  severity: "info" | "warning" | "blocking" | "scam";
  /** Plain-English advice safe to show the senior immediately. */
  seniorMessage: string;
  isLikelyScam: boolean;
};
