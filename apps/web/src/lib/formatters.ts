import type { DeviceKey, SessionStatus, Urgency, RecommendedRoute } from "./api";

/**
 * Render a relative time like "12 minutes ago" or "yesterday". Falls back
 * to a short absolute date once the gap is older than a week.
 */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const DEVICE_LABEL: Record<DeviceKey, string> = {
  computer: "Computer",
  phone: "Phone",
  tablet: "Tablet",
  tv: "Smart TV",
  printer: "Printer",
  wifi: "Wi-Fi",
  other: "Other",
};

export function deviceLabel(d: DeviceKey | null): string {
  if (!d) return "Other";
  return DEVICE_LABEL[d];
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  active: "In progress",
  resolved_ai: "Resolved with Buddy",
  escalated: "With a person",
  abandoned: "Left unresolved",
};

export function statusLabel(s: SessionStatus): string {
  return STATUS_LABEL[s];
}

const STATUS_TONE: Record<SessionStatus, string> = {
  // Tailwind utility chunks for the badge background/text combos.
  active: "bg-blue-100 text-blue-800",
  resolved_ai: "bg-emerald-100 text-emerald-800",
  escalated: "bg-amber-100 text-amber-800",
  abandoned: "bg-zinc-100 text-zinc-700",
};

export function statusTone(s: SessionStatus): string {
  return STATUS_TONE[s];
}

const URGENCY_LABEL: Record<Urgency, string> = {
  low: "Low urgency",
  medium: "Medium urgency",
  high: "High urgency",
};

export function urgencyLabel(u: Urgency): string {
  return URGENCY_LABEL[u];
}

const URGENCY_TONE: Record<Urgency, string> = {
  low: "bg-zinc-100 text-zinc-700",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

export function urgencyTone(u: Urgency): string {
  return URGENCY_TONE[u];
}

const ROUTE_LABEL: Record<RecommendedRoute, string> = {
  ai: "Buddy can handle it",
  ai_with_human_fallback: "Buddy first, person if needed",
  human: "Needs a person",
};

export function routeLabel(r: RecommendedRoute): string {
  return ROUTE_LABEL[r];
}
