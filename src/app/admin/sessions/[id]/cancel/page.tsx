import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionHeader } from "@/components/admin/SessionHeader";
import { setSessionCancelled } from "@/lib/admin/actions";
import { loadAdminSession } from "@/lib/admin/data";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

export const metadata: Metadata = { title: "Cancel session" };

// Cancel a session (with a reason parents see) or put a cancelled one back on, and tell the families it reaches.
// Admins any session; a group coach only sessions whose groups are all theirs (404 otherwise). A plain form.
export default async function CancelSessionPage({ params }: PageProps<"/admin/sessions/[id]/cancel">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await asUser(user.id, (tx) => loadAdminSession(tx, id, coachLimit(user.staff)));
  if (!session) notFound();
  const restore = session.cancelled;
  const who = session.picked ? `the parents of the ${session.picked} children in the squad` : `${session.ageGroups.join(", ")} families`;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <SessionHeader session={session} heading={restore ? `Put ${session.title} back on?` : `Cancel ${session.title}?`} />
      {restore && session.cancelReason ? <p className="text-[15px]">Cancelled because: {session.cancelReason}</p> : null}
      <form action={setSessionCancelled} className="flex flex-col gap-4 rounded-app border-2 border-line bg-paper p-4">
        <input type="hidden" name="id" value={session.id} />
        <input type="hidden" name="cancel" value={restore ? "no" : "yes"} />
        {restore ? null : (
          <div>
            <label htmlFor="reason" className="field-label">
              Reason <span className="font-normal text-ink-muted">(optional, parents see it)</span>
            </label>
            <input id="reason" name="reason" maxLength={120} placeholder="Pitch waterlogged" className="field" />
          </div>
        )}
        <label className="flex min-h-12 items-center gap-3 text-[15px]">
          <input type="checkbox" name="notify" defaultChecked className="h-5 w-5 accent-[var(--grass)]" />
          <span>
            <b>Tell the families now.</b> Posts it in club news for {who}, with an app notification and an email straight away (after 8am if
            it&apos;s late at night).
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-chunky btn-grass">
            {restore ? "Put it back on" : "Cancel session"}
          </button>
          <Link href="/admin/sessions" className="btn-chunky btn-paper">
            {restore ? "Leave it cancelled" : "Keep it on"}
          </Link>
        </div>
      </form>
    </div>
  );
}
