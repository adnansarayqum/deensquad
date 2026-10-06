// Settings shared by the server and browser Sentry set-ups (sentry-server.ts, sentry-client.ts).

import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/nextjs";
import { beforeSend, scrubBreadcrumb, scrubSpan } from "./scrub";

/** 5% of page loads and requests get a performance trace: enough to spot slow screens, well inside the free plan. */
export const TRACES_SAMPLE_RATE = 0.05;

export function sharedOptions({ dsn, environment, release }: { dsn: string; environment: string; release?: string }) {
  return {
    dsn,
    environment,
    ...(release ? { release } : {}),
    // No IP addresses, cookies or request bodies from the SDK itself; scrub.ts removes anything else.
    sendDefaultPii: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    maxBreadcrumbs: 30,
    beforeSend: (event: ErrorEvent, hint: EventHint) => beforeSend(event, hint),
    // Performance data is streamed span by span (the SDK's default; beforeSendTransaction no longer runs), so each span is scrubbed here.
    beforeSendSpan: <S extends { name: string; attributes: object }>(span: S) => scrubSpan(span),
    beforeBreadcrumb: (crumb: Breadcrumb) => scrubBreadcrumb(crumb),
  };
}
