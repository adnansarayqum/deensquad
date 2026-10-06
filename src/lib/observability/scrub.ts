// What Sentry may receive about a failure. This is a children's club, so the rules are strict:
// - no query strings anywhere (`?child=`, `?from=`, `?need=`, sign-in tokens), and ids in paths become `:id`;
// - no cookies, no request headers except the user agent, no request bodies or form data;
// - nothing shaped like an email address, in messages or breadcrumbs;
// - the user is only an opaque id and whether they're a parent, coach or admin.
// Pure functions (no Sentry import at runtime), used by beforeSend/beforeSendTransaction/beforeBreadcrumb on
// the server and in the browser, and unit tested in scrub.test.ts.

import type { Breadcrumb, Event, EventHint } from "@sentry/nextjs";
import { isClientDisconnect } from "../client-disconnect";
import { normalisePath, normaliseUrl } from "./urls";

export type Segment = "parent" | "coach" | "admin";
export type MonitoringUser = { id: string; segment: Segment };

const SEGMENTS = new Set<string>(["parent", "coach", "admin"]);
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;
const ABSOLUTE_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>`]+/gi;
const PATH_WITH_QUERY = /(^|[\s"'(=:])(\/[^\s"'<>`?#]*)[?#][^\s"'<>`)]*/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Removes emails, query strings and ids from free text (error messages, transaction names, log lines). */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(ABSOLUTE_URL, (url) => {
      // A sentence's full stop or a closing bracket isn't part of the address.
      const tail = url.match(/[.,;:)\]]+$/)?.[0] ?? "";
      return normaliseUrl(url.slice(0, url.length - tail.length)) + tail;
    })
    .replace(PATH_WITH_QUERY, (_m, before: string, path: string) => before + normalisePath(path))
    .replace(UUID, ":id");
}

/** Every string inside (a few levels deep) through scrubText. Anything deeper is dropped. */
function deepScrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return undefined;
  if (Array.isArray(value)) return value.map((v) => deepScrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) out[key] = deepScrub(v, depth + 1);
  return out;
}

/** Only `{ id, segment }`, and only when both look right. */
export function scrubUser(user: unknown): MonitoringUser | undefined {
  if (!user || typeof user !== "object") return undefined;
  const { id, segment } = user as { id?: unknown; segment?: unknown };
  if (typeof id !== "string" || !id || typeof segment !== "string" || !SEGMENTS.has(segment)) return undefined;
  return { id, segment: segment as Segment };
}

/**
 * A clicked or typed-in element as Sentry describes it (`div.card > button.btn-chunky[aria-label="Mark Yusuf here"]`),
 * cut down to tags and classes: attribute selectors (aria-label, title, alt, name, placeholder, value, ...), ids and
 * anything quoted can hold a child's name.
 */
export function scrubUiSelector(selector: string): string {
  return selector
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "")
    .replace(/\[[^\]]*\]?/g, "")
    .replace(/#[^\s.>[]*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...crumb };
  // Clicks and typing: the element's tags and classes only, and no extra data.
  if (typeof out.category === "string" && out.category.startsWith("ui.")) {
    if (typeof out.message === "string") out.message = scrubUiSelector(out.message);
    delete out.data;
    return out;
  }
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.data) out.data = deepScrub(out.data) as Breadcrumb["data"];
  return out;
}

/** The event as it may be sent: see the rules at the top of this file. Never throws. */
export function scrubEvent<E extends Event>(event: E): E {
  const out: E = { ...event };
  if (typeof out.message === "string") out.message = scrubText(out.message);
  if (out.logentry) out.logentry = { ...out.logentry, message: out.logentry.message ? scrubText(out.logentry.message) : out.logentry.message, params: undefined };
  if (typeof out.transaction === "string") out.transaction = scrubText(out.transaction);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({ ...v, value: typeof v.value === "string" ? scrubText(v.value) : v.value })),
    };
  }
  if (out.request) {
    const agent = Object.entries(out.request.headers ?? {}).find(([key]) => key.toLowerCase() === "user-agent")?.[1];
    out.request = {
      ...(out.request.url ? { url: normaliseUrl(out.request.url) } : {}),
      ...(out.request.method ? { method: out.request.method } : {}),
      ...(agent ? { headers: { "user-agent": agent } } : {}),
    };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);
  if (out.contexts) out.contexts = deepScrub(out.contexts) as E["contexts"];
  if (out.tags) out.tags = deepScrub(out.tags) as E["tags"];
  if (out.extra) out.extra = deepScrub(out.extra) as E["extra"];
  if (out.spans) out.spans = out.spans.map((s) => ({ ...s, description: s.description ? scrubText(s.description) : s.description, data: deepScrub(s.data) as typeof s.data }));
  const user = scrubUser(out.user);
  if (user) out.user = user;
  else delete out.user;
  return out;
}

/** Span attributes that may carry a query string, headers, cookies, an IP address or who someone is. */
function droppedAttribute(key: string): boolean {
  const k = key.toLowerCase();
  if (k === "user.id" || k === "http.request.header.user_agent" || k === "user_agent.original") return false;
  return (
    /query|cookie|body|form/.test(k) ||
    /^http\.(request|response)\.header\./.test(k) ||
    /^user\./.test(k) ||
    /^(client|net\.peer|net\.sock\.peer|network\.peer|source)\.(address|ip|port)$/.test(k) ||
    k === "http.client_ip"
  );
}

/**
 * A performance span (Sentry streams them one by one; beforeSendSpan) as it may be sent: name and attribute
 * values through scrubText, and nothing that can hold a query string, headers, cookies, an IP or a person's details.
 */
export function scrubSpan<S extends { name: string; attributes: object }>(span: S): S {
  // Sentry sends the span unchanged if this throws, so anything unexpected leaves an empty span instead.
  try {
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(span.attributes ?? {})) {
      // The opaque user id is allowed as it is (as on error reports); everything else is scrubbed.
      if (!droppedAttribute(key)) attributes[key] = key === "user.id" ? value : deepScrub(value);
    }
    return { ...span, name: typeof span.name === "string" ? scrubText(span.name) : "span", attributes };
  } catch {
    return { ...span, name: "span", attributes: {} };
  }
}

const NOISE = [
  /ResizeObserver loop/i,
  // Lost signal mid-request: Safari says "Load failed", Firefox "NetworkError when attempting to fetch resource", Chrome "Failed to fetch"
  // (Sentry can add the host in brackets: "Failed to fetch (app.example)").
  /^(TypeError: )?Load failed( \(.*\))?$/i,
  /NetworkError when attempting to fetch resource/i,
  /^(TypeError: )?Failed to fetch( \(.*\))?$/i,
];
const EXTENSION = /^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//i;

/** Not a failure worth a report: Next's redirect/"not found" signals, a visitor leaving early, browser noise, browser extensions. */
export function isIgnored(event: Event, hint?: EventHint): boolean {
  const original = hint?.originalException as { digest?: unknown; message?: unknown } | undefined;
  const digest = original && typeof original === "object" && typeof original.digest === "string" ? original.digest : "";
  if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")) return true;
  const messages = [
    typeof original?.message === "string" ? original.message : null,
    ...(event.exception?.values ?? []).map((v) => v.value ?? null),
    typeof event.message === "string" ? event.message : null,
  ].filter((m): m is string => typeof m === "string");
  if (messages.some((m) => m === "NEXT_REDIRECT" || m.startsWith("NEXT_HTTP_ERROR_FALLBACK"))) return true;
  if (messages.some(isClientDisconnect)) return true;
  if (messages.some((m) => NOISE.some((re) => re.test(m)))) return true;
  const frames = (event.exception?.values ?? []).flatMap((v) => v.stacktrace?.frames ?? []);
  return frames.some((f) => EXTENSION.test(f.filename ?? "") || EXTENSION.test(f.abs_path ?? ""));
}

/** beforeSend: drop what isIgnored, scrub the rest. */
export function beforeSend<E extends Event>(event: E, hint?: EventHint): E | null {
  if (isIgnored(event, hint)) return null;
  return scrubEvent(event);
}
