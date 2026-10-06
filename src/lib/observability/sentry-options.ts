// Settings shared by the server and browser Sentry set-ups (sentry-server.ts, sentry-client.ts).

import type { Breadcrumb, ErrorEvent, EventHint, init } from "@sentry/nextjs";
import { beforeSend, scrubBreadcrumb, scrubSpan } from "./scrub";

/** 5% of page loads and requests get a performance trace: enough to spot slow screens, well inside the free plan. */
export const TRACES_SAMPLE_RATE = 0.05;

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>["dataCollection"]>;

/**
 * What the SDK itself may collect: nothing about the person or the request. SDK 11 ignores `sendDefaultPii` and
 * collects all of these by default; `userInfo: false` also makes every envelope say `infer_ip: "never"`, so Sentry
 * doesn't take the IP address from the connection. scrub.ts removes anything that slips through anyway.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies Required<Omit<DataCollection, "frameContextLines">>;

export function sharedOptions({ dsn, environment, release }: { dsn: string; environment: string; release?: string }) {
  return {
    dsn,
    environment,
    ...(release ? { release } : {}),
    dataCollection: DATA_COLLECTION,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    maxBreadcrumbs: 30,
    // Leave "Failed to fetch" and the like as the browser said them (the SDK would otherwise add the host to the app's own errors).
    enhanceFetchErrorMessages: false as const,
    beforeSend: (event: ErrorEvent, hint: EventHint) => beforeSend(event, hint),
    // Performance data is streamed span by span (the SDK's default; beforeSendTransaction no longer runs), so each span is scrubbed here.
    beforeSendSpan: <S extends { name: string; attributes: object }>(span: S) => scrubSpan(span),
    beforeBreadcrumb: (crumb: Breadcrumb) => scrubBreadcrumb(crumb),
  };
}
