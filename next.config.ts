import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// On the college server the Supabase API is on the college's own domain
// (deploy/RUNBOOK.md), so that origin is allowed as well as Supabase cloud.
// NEXT_PUBLIC_SUPABASE_URL is fixed at build time, like the rest of the CSP.
const selfHostedApi = (() => {
  try {
    const { origin } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return origin.endsWith(".supabase.co") ? "" : origin;
  } catch {
    return "";
  }
})();
const api = selfHostedApi ? ` ${selfHostedApi}` : "";
const apiWs = selfHostedApi ? ` ${selfHostedApi.replace(/^http/, "ws")}` : "";

const csp = [
  "default-src 'self'",
  // Next.js inlines its bootstrap scripts; dev mode also needs eval for fast refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://licet.ac.in https://*.supabase.co${api}`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${api}${apiWs}`,
  `frame-src 'self' https://*.supabase.co${api} https://www.youtube-nocookie.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Self-contained server bundle for the on-premise Docker image (deploy/Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
