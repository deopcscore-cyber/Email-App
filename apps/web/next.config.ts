import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker runtime image (Railway).
  output: "standalone",
  // The API is proxied through the web origin so the httpOnly session cookie
  // is first-party and OAuth callbacks share the origin.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
