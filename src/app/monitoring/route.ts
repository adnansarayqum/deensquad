import { SENTRY_CLIENT_ON } from "@/lib/observability/config";
import { forwardEnvelope } from "@/lib/observability/tunnel";

// The browser's error reports (Sentry's `tunnel`, src/lib/observability/sentry-client.ts), passed on to the
// app's own Sentry project without the visitor's IP address, cookies or headers (src/lib/observability/tunnel.ts).
// Public in src/proxy.ts only when the app was built with Sentry; otherwise this answers 404.
export async function POST(request: Request) {
  return forwardEnvelope(request, SENTRY_CLIENT_ON ? process.env.NEXT_PUBLIC_SENTRY_DSN : null);
}
