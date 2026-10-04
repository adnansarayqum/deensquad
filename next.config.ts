import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load at runtime from node_modules rather than being bundled.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  // Session plans and practice sheets can carry an 8 MB PDF or photo.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
};

export default nextConfig;
