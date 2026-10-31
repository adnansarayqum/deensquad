import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Section } from "@/components/admin/bits";
import { Pill } from "@/components/ui";
import { UUID } from "@/lib/auth/tokens";
import { coachLimit, requireStaff } from "@/lib/auth/session";
import { asUser } from "@/lib/db";
import { clock, shortDay } from "@/lib/dates";
import { iso } from "@/lib/db/types";
import { overlaps } from "@/lib/admin/scope";
import { loadSessionTotals, loadUnpaidAtGate, TOTAL_GROUPS } from "@/lib/admin/session-totals";
import { groupPlural } from "@/lib/domain";

export const metadata: Metadata = { title: "Session totals" };

const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 ? 2 : 0)}`;

/**
 * One session's night in numbers (the owner's request): who came in each group and in all, and the gate takings to
 * check against the card machine, with anyone who came and pays per session but has no payment recorded.
 * Staff whose groups the session includes (admins any); 404 otherwise.
 */
export default async function SessionTotalsPage({ params }: PageProps<"/admin/sessions/[id]/totals">) {
  const user = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const mine = coachLimit(user.staff);
  const view = await asUser(user.id, async (tx) => {
    const [session] = await tx.query<{ id: string; title: string; starts_at: Date; ends_at: Date; venue: string; age_groups: string[] }>(
      `select id, title, starts_at, ends_at, venue, age_groups::text[] as age_groups from sessions where id = $1`,
      [id],
    );
    if (!session || (mine && !overlaps(session.age_groups, mine))) return null;
    const [totals] = await loadSessionTotals(tx, { ids: [id] });
    return { session, totals: totals ?? null, unpaid: await loadUnpaidAtGate(tx, id) };
  });
  if (!view) notFound();
  const { session, totals, unpaid } = view;
  const day = `${shortDay(iso(session.starts_at))} · ${clock(iso(session.starts_at))}–${clock(iso(session.ends_at))} · ${session.age_groups.join(", ")}`;
  const shouldPay = totals ? totals.payAsYouGo + totals.noPlanYet + totals.trialsCame : 0;
  const takenPence = totals ? totals.cardPence + totals.cashPence : 0;

  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <PageHeader back={{ href: "/admin/sessions", label: "Sessions" }} title={`${session.title}: totals`} subtitle={day} />

      {!totals ? (
        <Section title="Nobody checked in yet">
          <p className="text-[15px] text-ink-muted">The totals fill in as children are checked in at the gate.</p>
        </Section>
      ) : (
        <>
          <Section title={`${totals.total} ${totals.total === 1 ? "child" : "children"} came`} aside={totals.trialsCame ? <Pill tone="neutral">{`+ ${totals.trialsCame} on trial`}</Pill> : null}>
            <table className="w-full text-[15px]">
              <caption className="sr-only">Children who came, by group</caption>
              <tbody>
                {TOTAL_GROUPS.filter((g) => totals.byGroup[g] > 0 || session.age_groups.includes(g)).map((g) => (
                  <tr key={g} className="border-t border-line first:border-t-0">
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {groupPlural(g)}
                    </th>
                    <td className="py-2.5 text-right font-bold tabular-nums">{totals.byGroup[g]}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink">
                  <th scope="row" className="py-2.5 text-left font-bold">
                    Total
                  </th>
                  <td className="py-2.5 text-right text-[18px] font-bold tabular-nums">{totals.total}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section title="At the gate">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[15px] sm:grid-cols-3">
              <Figure label="Pay as you go who came" value={String(totals.payAsYouGo)} />
              <Figure label="No payment plan yet who came" value={String(totals.noPlanYet)} />
              <Figure label="Trials who came" value={String(totals.trialsCame)} />
              <Figure label="Should pay at the gate" value={String(shouldPay)} strong />
              <Figure label="Payments recorded" value={String(totals.paidCount)} strong />
              <Figure label="Taken by card" value={pounds(totals.cardPence)} />
              <Figure label="Taken in cash" value={pounds(totals.cashPence)} />
              <Figure label="Taken at the gate" value={pounds(takenPence)} strong />
            </dl>
            <p className="text-[14px] text-ink-muted">
              &ldquo;Taken by card&rdquo; should match the card machine for this session. Monthly-plan families aren&apos;t counted here.
            </p>
          </Section>

          {unpaid.length ? (
            <Section title={`Came, but no payment recorded (${unpaid.length})`}>
              <ul className="flex flex-col divide-y divide-line">
                {unpaid.map((c) => (
                  <li key={c.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-1.5">
                    <Link href={`/admin/families/${c.id}`} className="font-bold underline underline-offset-4">
                      {c.name}
                    </Link>
                    <span className="flex items-center gap-2 text-[14px] text-ink-muted">
                      {c.group}
                      <Pill tone="neutral">{c.plan === "pay_as_you_go" ? "Pay as you go" : "No plan yet"}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? "text-[22px] font-bold" : "text-[18px] font-bold"}`}>{value}</dd>
    </div>
  );
}
