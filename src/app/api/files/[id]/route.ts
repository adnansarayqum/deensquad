import { getCurrentUser } from "@/lib/auth/session";
import { UUID } from "@/lib/auth/tokens";
import { asUser } from "@/lib/db";
import { contentDisposition } from "@/lib/viewer";

// Serves an attached plan or practice sheet. Row level security decides who can open it:
// staff, or a family whose group the plan or sheet is for. The in-app viewer (/files/[id]) reads it from here;
// `?download=1` asks the browser to save it instead of showing it.
export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to open this file.", { status: 401 });
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const [file] = await asUser(user.id, (tx) =>
    tx.query<{ name: string; mime: string; data: Uint8Array }>(`select name, mime, data from club_files where id = $1`, [id]),
  );
  if (!file) return new Response("Not found", { status: 404 });
  // No extra copy: an 8 MB plan opened by many parents at once is already several copies in memory per request.
  const body = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data as ArrayBuffer);
  return new Response(body as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": contentDisposition(file.name, new URL(request.url).searchParams.get("download") === "1"),
      // A file id is a UUID and its content never changes, so the browser can keep it for good (private: one person's cache).
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
