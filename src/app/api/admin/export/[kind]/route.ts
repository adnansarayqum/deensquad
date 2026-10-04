import { getCurrentUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { toCsv } from "@/lib/exports/csv";
import { buildExport, isExportKind } from "@/lib/exports/reports";

// Spreadsheet downloads for admins (they hold parents' contact details, so coaches can't).
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/export/[kind]">) {
  const { kind } = await params;
  const user = await getCurrentUser();
  if (!user?.staff || user.staff.role !== "admin") return new Response("Only club admins can download this.", { status: 403 });
  if (!isExportKind(kind)) return new Response("Not found", { status: 404 });
  const now = new Date();
  const { header, rows } = await asUser(user.id, (tx) => buildExport(tx, kind, now));
  const date = now.toISOString().slice(0, 10);
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deen-squad-${kind}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
