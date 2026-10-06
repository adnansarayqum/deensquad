import type { Metadata, Viewport } from "next";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/800.css";
import "./globals.css";
import { MonitoringUser } from "@/components/observability/MonitoringUser";
import { getCurrentUser } from "@/lib/auth/session";
import { SENTRY_CLIENT_ON } from "@/lib/observability/config";
import { monitoringUser } from "@/lib/observability/user";

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

const INSTALL_PROMPT_SCRIPT =
  'addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__dsInstallPrompt=e;dispatchEvent(new Event("ds-installprompt"))});addEventListener("appinstalled",function(){window.__dsInstallPrompt=null})';

/** Tells the browser's error reports who is signed in (opaque id and parent/coach/admin only). */
async function SignedInMonitoringUser() {
  return <MonitoringUser user={monitoringUser(await getCurrentUser())} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Browser error reports (Sentry) are off unless the app was built with them: see src/lib/observability/config.ts.
  return (
    <html lang="en-GB" className="h-full antialiased">
      <head>
        {/* Android browsers can offer their install prompt before React has loaded: keep it for the parent
            screens' "add to home screen" step (src/components/InstallGate.tsx), which hears when one arrives.
            A plain inline script runs while the page is parsed; next/script's beforeInteractive only runs once
            Next's own bundle has loaded, which can be too late. */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-cream text-ink">
        {children}
        {SENTRY_CLIENT_ON ? <SignedInMonitoringUser /> : null}
      </body>
    </html>
  );
}
