import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionHeader } from "@/components/admin/SessionHeader";
import { deleteSession } from "@/lib/admin/actions";
import { loadAdminSession } from "@/lib/admin/data";
import { lossesSentence, sessionLosses } from "@/lib/admin/sessions";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Delete session" };

// Says what deleting a session takes with it before it goes. Admins any session; a group coach only sessions whose
// groups are all theirs (404 otherwise). A session anyone has been checked in to can't be deleted (cancel it instead).
export default async function DeleteSessionPage({ params }: PageProps<"/admin/sessions/[id]/delete">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const found = await asUser(user.id, async (tx) => {
    const session = await loadAdminSession(tx, id, coachLimit(user.staff));
    return session ? { session, losses: await sessionLosses(tx, id) } : null;
  });
  if (!found) notFound();
  const { session, losses } = found;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <SessionHeader session={session} heading={`Delete ${session.title}?`} />
      {losses.attended > 0 ? (
        <p className="rounded-app bg-orange-tint px-3.5 py-3 text-[15px]">
          Children have been checked in to this session, so it can&apos;t be deleted. Cancel it instead.
        </p>
      ) : (
        <form action={deleteSession} className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
          <input type="hidden" name="id" value={session.id} />
          <input type="hidden" name="confirm" value="yes" />
          <p className="text-[15px] font-bold">{lossesSentence(losses)}</p>
          <p className="text-[15px] text-ink-muted">To keep it on the calendar but tell parents it&apos;s off, cancel it instead.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-chunky btn-paper border-kit-orange">
              Delete session
            </button>
            <Link href="/admin/sessions" className="btn-chunky btn-grass">
              Keep it
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
