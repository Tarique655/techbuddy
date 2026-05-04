// Shared types — keep these stable; every surface depends on them.

export type Device =
  | "computer"
  | "phone"
  | "tablet"
  | "smart-tv"
  | "printer"
  | "other";

export type Urgency = "low" | "medium" | "high";

export type ResolutionRoute = "ai" | "human" | "callback";

/**
 * The structured summary Buddy generates after 3–5 chat turns and hands off
 * to the routing layer (and to a human technician if escalated).
 *
 * Mirrors the JSON shape in the project doc — keep in sync if that changes.
 */
export interface IssueSummary {
  problem: string;
  goal: string;
  device: Device;
  tags: string[];
  /** 0–100. 0–40 → AI, 40–70 → AI with human fallback, 70–100 → human. */
  complexity: number;
  urgency: Urgency;
  recommendRoute: "ai" | "human";
  imageAttached: boolean;
}

export interface VisionAnalysis {
  /** All visible text Claude could read in the image. */
  visibleText: string;
  /** "Windows 11, Microsoft Edge, certificate error" style. */
  context: string;
  severity: "info" | "warning" | "blocking" | "scam";
  /** Plain-English advice safe to show the senior immediately. */
  seniorMessage: string;
  isLikelyScam: boolean;
}
