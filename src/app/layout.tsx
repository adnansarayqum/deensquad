import type { Metadata, Viewport } from "next";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Deen Squad", template: "%s · Deen Squad" },
  description: "The Deen Squad Football Academy parent app: club news, Friday availability, your child's checklist and progress.",
  applicationName: "Deen Squad",
  appleWebApp: { capable: true, title: "Deen Squad", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f3d27" },
    { media: "(prefers-color-scheme: dark)", color: "#0b150e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full bg-cream text-ink">{children}</body>
    </html>
  );
}
