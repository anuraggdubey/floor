import type { NextConfig } from "next";

const WORKER = process.env.WORKER_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // In dev the app is often reached over a LAN/WSL address rather than localhost; without this Next blocks
  // those origins and the HMR client reload-loops, which stops the page hydrating.
  allowedDevOrigins: ["127.0.0.1", "localhost", "172.*.*.*", "192.168.*.*", "10.*.*.*"],
  // The repo sits on the Windows filesystem; inotify does not fire across it from WSL, so the dev server
  // has to poll or it will never notice an edit.
  watchOptions: { pollIntervalMs: 600 },
  // The browser talks to /api/* on this origin; Next proxies to the worker so there is no CORS
  // and no worker URL baked into the client bundle.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${WORKER}/api/:path*` }];
  },
};

export default nextConfig;
