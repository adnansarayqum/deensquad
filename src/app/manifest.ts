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
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android): straight to the attendance QR codes, which also open with no signal.
    shortcuts: [{ name: "Attendance QR codes", short_name: "QR codes", url: "/pass", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] }],
  };
}
