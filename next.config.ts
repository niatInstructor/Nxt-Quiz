import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BUG-02: Forward ENVIRONMENT to client bundle as NEXT_PUBLIC_
  env: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.ENVIRONMENT,
  },

  // STD-01: Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  // STD-08: Root redirect via config instead of render-time redirect()
  async redirects() {
    return [
      { source: "/", destination: "/login", permanent: false },
    ];
  },
};

export default nextConfig;
