/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The portal only ever calls our backend at runtime — no SSR data fetches
  // that need server-side env vars. Keep the surface minimal for Vercel.
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
