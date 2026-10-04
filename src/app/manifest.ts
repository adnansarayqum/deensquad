import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deen Squad Football Academy",
    short_name: "Deen Squad",
    description: "Club news, Friday availability, your child's checklist and progress.",
    start_url: "/news",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff4e3",
    theme_color: "#1f3d27",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
