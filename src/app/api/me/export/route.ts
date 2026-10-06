import { getCurrentUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { buildFamilyExport } from "@/lib/parent/export";
import { allowExport } from "@/lib/parent/export-limit";

// "Download my data" (Player → Your data): the signed-in parent's own family, as a JSON file. Read as the parent,
// limited to their own guardian row and children (src/lib/parent/export.ts), so a parent who is also staff still
// gets only their family.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to download your data.", { status: 401 });
  if (!user.guardian) return new Response("Only parents can download their family's data here.", { status: 403 });
  if (!allowExport(user.id)) {
    return new Response("That's a lot of downloads in one hour. Try again later.", { status: 429, headers: { "Retry-After": "3600" } });
  }
  const now = new Date();
  const data = await asUser(user.id, (tx) => buildFamilyExport(tx, now));
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="deen-squad-my-data-${now.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
