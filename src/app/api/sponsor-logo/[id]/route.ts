import { UUID } from "@/lib/auth/tokens";
import { asSystem } from "@/lib/db";

/**
 * A sponsor's logo or icon for the public sign-up page, where nobody is signed in. It serves only a file that is the
 * logo or icon of a sponsor on show (never any other club file), which the club has chosen to show publicly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const [file] = await asSystem((tx) =>
    tx.query<{ mime: string; data: Uint8Array }>(
      `select f.mime, f.data from club_files f
       where f.id = $1 and exists (select 1 from sponsors s where s.active and f.id in (s.logo_file_id, s.icon_file_id))`,
      [id],
    ),
  );
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
