// Design tokens — single source of truth for colors, font sizes, spacing.
// The mobile app, desktop app, and web all consume these.
//
// Senior-facing surfaces (mobile, desktop) MUST follow the minimums:
//   - 18pt minimum body font
//   - 48px minimum tap target
// The family portal (web) can use normal density.

export const fontSize = {
  // Senior-facing (use these on mobile + desktop)
  seniorBody: 20,
  seniorLead: 24,
  seniorHeading: 32,
  seniorHero: 40,

  // Family portal / technician portal — normal density
  body: 14,
  lead: 16,
  heading: 20,
  hero: 32,
} as const;

export const tapTarget = {
  /** Absolute minimum on senior-facing surfaces. */
  seniorMin: 48,
  /** Comfortable default for primary actions. */
  seniorDefault: 64,
  /** "Get Help Now" hero button. */
  seniorHero: 96,
} as const;

export const color = {
  // Calm, high-contrast palette. Avoid red except for "End Session" / errors.
  background: "#FFFFFF",
  surface: "#F6F7FB",
  text: "#1A1F2C",
  textMuted: "#5A6173",
  primary: "#2A6CF6", // friendly blue — primary actions
  primaryText: "#FFFFFF",
  success: "#1F8A4C",
  warning: "#C77A00",
  danger: "#C8312D", // reserved for End Session and scam alerts
  scamAlert: "#FFE9E9",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 9999,
} as const;
