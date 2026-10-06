// The browser's error reports reach Sentry through the app's own address, POST /monitoring
// (src/app/monitoring/route.ts), so ad blockers don't drop them. The route sends each report on to the one
// Sentry project the app was built for, and nothing about the visitor goes with it: no IP address
// (x-forwarded-for, x-real-ip), no cookies, no other headers. Sentry's own rewrite tunnel forwarded all of
// those, which is why the app has its own.

/** Biggest report passed on. A real one is a few kilobytes; anything near this is not an error report. */
export const MAX_ENVELOPE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 10_000;

type Destination = { host: string; projectId: string; url: string };

/** Where reports for this DSN go: `https://<host>/<path>/api/<project>/envelope/`. Null if it isn't a DSN. */
export function destination(dsn: string | null | undefined): Destination | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const projectId = parts.pop();
    if (!projectId || !/^\d+$/.test(projectId) || !url.username) return null;
    const prefix = parts.length ? `/${parts.join("/")}` : "";
    return { host: url.host, projectId, url: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/` };
  } catch {
    return null;
  }
}

function reply(status: number): Response {
  return new Response(null, { status });
}

/** Reads the body, giving up (null) once it passes the limit. */
async function readCapped(request: Request): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ENVELOPE_BYTES) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ENVELOPE_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/**
 * Passes one report from the browser on to Sentry, for the project in `dsn` only. 404 when Sentry is off,
 * 413 when it's too big, 400 when it isn't a report, 403 when it's for another Sentry project; otherwise
 * Sentry's own answer (502 if Sentry can't be reached).
 */
export async function forwardEnvelope(request: Request, dsn: string | null | undefined, send: typeof fetch = fetch): Promise<Response> {
  const target = destination(dsn);
  if (!target) return reply(404);
  const body = await readCapped(request);
  if (!body) return reply(413);

  // The first line is the envelope header, which names the DSN the report is for.
  const newline = body.indexOf(10);
  let header: { dsn?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(newline === -1 ? body : body.subarray(0, newline)));
  } catch {
    return reply(400);
  }
  if (!header || typeof header !== "object" || typeof header.dsn !== "string") return reply(400);
  const claimed = destination(header.dsn);
  if (!claimed) return reply(400);
  if (claimed.host !== target.host || claimed.projectId !== target.projectId) return reply(403);

  try {
    const upstream = await send(target.url, {
      method: "POST",
      // Only the content type: no IP address, cookies, user agent or anything else of the visitor's.
      headers: { "content-type": request.headers.get("content-type") || "application/x-sentry-envelope" },
      body: body as BodyInit,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    // Sentry's rate limits tell the SDK to hold back; pass them on.
    const headers = new Headers();
    for (const name of ["x-sentry-rate-limits", "retry-after"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    await upstream.body?.cancel().catch(() => {});
    return new Response(null, { status: upstream.status, headers });
  } catch {
    return reply(502);
  }
}
