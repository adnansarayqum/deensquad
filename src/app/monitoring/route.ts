import { clientIpFrom } from "@/lib/auth/ip";
import { SENTRY_CLIENT_ON } from "@/lib/observability/config";
import { forwardEnvelope } from "@/lib/observability/tunnel";
import { allowTunnel } from "@/lib/observability/tunnel-limit";

// The browser's error reports (Sentry's `tunnel`, src/lib/observability/sentry-client.ts), passed on to the
// app's own Sentry project without the visitor's IP address, cookies or headers (src/lib/observability/tunnel.ts).
// Public in src/proxy.ts only when the app was built with Sentry; otherwise this answers 404.
// At most 60 reports a minute per address (src/lib/observability/tunnel-limit.ts), so the quota can't be flooded.
export async function POST(request: Request) {
  if (SENTRY_CLIENT_ON && !allowTunnel(clientIpFrom(request.headers))) {
    return new Response(null, { status: 429, headers: { "retry-after": "60" } });
  }
  return forwardEnvelope(request, SENTRY_CLIENT_ON ? process.env.NEXT_PUBLIC_SENTRY_DSN : null);
}
