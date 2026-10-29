import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { findMedia } from "@/lib/media/data";
import { createReadStream, fileSize, mediaStore } from "@/lib/media/store";

// A picture or video on news, a session or a message (`?poster=1`: a video's still). Row level security decides who
// may open it: staff, or a parent who can read what it's attached to. With the club's bucket the answer is a redirect
// to a short-lived link straight to the bucket (whose traffic is free, and which handles a video's range requests);
// the link stays the same for an hour (store.ts), so pictures come from the browser's cache. On disk (dev, tests, the
// demo) the app serves the file itself, with range requests so videos play on an iPhone.
export async function GET(request: Request, { params }: RouteContext<"/api/media/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to open this.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const media = await asUser(user.id, (tx) => findMedia(tx, id));
  const store = mediaStore();
  if (!media || !store) return new Response("Not found", { status: 404 });
  const poster = new URL(request.url).searchParams.get("poster") === "1";
  const key = poster ? media.posterKey : media.objectKey;
  const mime = poster ? "image/jpeg" : media.mime;
  if (!key) return new Response("Not found", { status: 404 });

  const signed = await store.signedUrl(key, mime);
  if (signed) {
    return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, max-age=600" } });
  }
  const path = store.path(key);
  const size = path ? await fileSize(path) : null;
  if (!path || size === null) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    start = Math.max(0, start);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream;
    return new Response(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const body = Readable.toWeb(createReadStream(path)) as unknown as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}

