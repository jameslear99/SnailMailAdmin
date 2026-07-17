import type { NextConfig } from "next";
import path from "path";

// Pin the app root so Next.js does not treat the apphosting-adapters monorepo
// (root package-lock.json) as the workspace when building standalone output.
const appRoot = path.resolve(".");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: appRoot,
  serverExternalPackages: ["sharp"],
  turbopack: {
    root: appRoot,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
