import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { getCurrentUser } from "@/lib/auth/session";
import { receiveMedia } from "@/lib/media/upload";

// Staff's photo and video uploads from the picker (MediaPicker): the raw file as the request body, one per request,
// streamed to a temporary file rather than held in memory. A route, not a Server Action (those stop at 9 MB), and
// left out of the sign-in proxy (src/proxy.ts), which would otherwise buffer the body and cut it off at 10 MB; the
// session is checked here instead. Cross-site requests can't carry the sign-in cookie (SameSite=Lax).
export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Your sign-in has run out. Sign in again." }, { status: 401 });
  if (!user.staff) return Response.json({ error: "Only the club's staff can add photos and videos." }, { status: 403 });
  if (!request.body) return Response.json({ error: "Choose a photo or video." }, { status: 400 });
  const length = Number(request.headers.get("content-length"));
  const result = await receiveMedia(Readable.fromWeb(request.body as NodeReadableStream), user.staff.id, Number.isFinite(length) && length > 0 ? length : null);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
  return Response.json(result.media, { headers: { "Cache-Control": "no-store" } });
}
