import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page in this app is per-user and per-organization (auth cookies +
  // RLS), so we render dynamically instead of opting into Cache Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  devIndicators: false,
  logging: {
    // Server Function arguments can contain credentials (login) — never log them.
    serverFunctions: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb", // brand asset uploads
    },
  },
};

export default nextConfig;
