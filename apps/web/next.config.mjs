/** @type {import('next').NextConfig} */

// API origin the family portal calls. Set per-environment in Vercel —
// here we read the same env var the client uses so the CSP `connect-src`
// list stays in sync with where fetches actually go.
const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ?? "https://techbuddy-api.onrender.com";

/**
 * Build a Content-Security-Policy header string. Strict by default —
 * scripts from self only (Next inlines its own bootstrap with
 * 'unsafe-inline' and we have no choice on App Router), connect to
 * self + the API + Sentry, no plugins, no framing.
 *
 * If we add Sentry on the web side later, its ingest origin needs to
 * land in connect-src. If we add a CDN for fonts or images, those
 * origins land in font-src / img-src.
 */
function buildCsp() {
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", API_ORIGIN, "https://*.ingest.sentry.io"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
    "upgrade-insecure-requests": [],
  };
  return Object.entries(directives)
    .map(([key, values]) => (values.length ? `${key} ${values.join(" ")}` : key))
    .join("; ");
}

const securityHeaders = [
  // Defense-in-depth against XSS: Browser blocks unwhitelisted scripts,
  // styles, and connections. CSP is the single most impactful security
  // header for a public-facing web app.
  { key: "Content-Security-Policy", value: buildCsp() },

  // Block being framed by anyone — protects against clickjacking. CSP's
  // frame-ancestors above does the modern equivalent; X-Frame-Options is
  // the legacy belt-and-braces version older browsers still honor.
  { key: "X-Frame-Options", value: "DENY" },

  // Tell browsers not to MIME-sniff. Stops a JS file labeled as HTML
  // from being executed as script when served from another origin.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Send only origin (no path/query) on cross-origin navigations. Keeps
  // session ids out of Referer headers when the senior follows a link
  // out of the portal.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Force HTTPS for a year; include subdomains; allow preload-list
  // submission. Vercel terminates TLS at the edge so HSTS is safe.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },

  // Disable Flash, Java, etc. — none of which we use, none of which
  // any modern browser supports anyway, but the explicit denial is the
  // hygienic move.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,

  experimental: {
    typedRoutes: false,
  },

  async headers() {
    return [
      {
        // Apply to every route the portal serves.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
