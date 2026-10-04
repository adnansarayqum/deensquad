import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load at runtime from node_modules rather than being bundled.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
};

export default nextConfig;
