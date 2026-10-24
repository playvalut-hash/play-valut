import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Security headers (v2 Phase 2, audit M7). Deliberately the SAFE
  // baseline only: nosniff, DENY framing, a strict referrer policy, and
  // no camera/mic/geolocation (the app uses none of them).
  // NOT here on purpose: Strict-Transport-Security — Vercel already
  // sends it (max-age=63072000; includeSubDomains; preload) and a
  // second copy would duplicate the header. NOT here yet: a full
  // Content-Security-Policy — that needs per-route tuning (Next.js
  // inline scripts, font/blob URLs) and a wrong CSP breaks pages, so
  // the audit defers it; these four cannot break anything.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Screenshots upload THROUGH server actions (chat + deposit page).
      // The 1MB default silently killed real phone screenshots (Build 50).
      bodySizeLimit: "9mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
