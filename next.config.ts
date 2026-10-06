import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Database drivers load at runtime from node_modules rather than being bundled.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  // Session plans and practice sheets can carry an 8 MB PDF or photo.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
  poweredByHeader: false,
  // No other site may show the app in a frame (so it can't be dressed up to trick a parent into tapping),
  // browsers must not guess file types, links out carry no address, and browsers keep to HTTPS.
  // No script-src: the PDF viewer's worker and Next's own scripts would need careful allow-listing.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },
};

export default nextConfig;
