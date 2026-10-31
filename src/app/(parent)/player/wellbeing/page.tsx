import type { Metadata } from "next";
import { BackHeader } from "@/components/BackHeader";
import { StatefulForm } from "@/components/admin/StatefulForm";
import { Pill } from "@/components/ui";
import { asUser } from "@/lib/db";
import { shortDay } from "@/lib/dates";
import { getFamily } from "@/lib/parent/load";
import { backTarget } from "@/lib/parent/tabs";
import { giveCheckinAction } from "@/lib/wellbeing/actions";
import { loadFamilyCheckins, MOODS, WELLBEING_NOTE_MAX, type Mood } from "@/lib/wellbeing/data";

export const metadata: Metadata = { title: "Wellbeing check-in" };

const FACES: Record<Mood, string> = { good: "Good", ok: "OK", low: "Not great" };

/** A private check-in about how a child is finding football: seen by the child's parents and the club's admins only. */
export default async function WellbeingPage({ searchParams }: PageProps<"/player/wellbeing">) {
  const flags = await searchParams;
  const { user, family } = await getFamily();
  const child = family.children.find((c) => c.id === flags.child) ?? family.children[0];
  const back = backTarget(flags.from, { href: child ? `/player?child=${child.id}` : "/player", label: "Family" });
  const history = child ? await asUser(user.id, (tx) => loadFamilyCheckins(tx, [child.id])) : [];

  return (
    <>
      <BackHeader back={back.href} backLabel={back.label} title={child ? `How's ${child.firstName} doing?` : "Wellbeing check-in"} />
      <main className="flex flex-col gap-4 px-4 pt-5 pb-4">
        {!child ? (
          <p className="rounded-app bg-paper shadow-card p-4 text-[15px]">No players are linked to your email yet.</p>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-app bg-paper shadow-card p-4" aria-labelledby="checkin">
              <h2 id="checkin" className="text-[18px] font-bold">
                How is {child.firstName} finding football at the moment?
              </h2>
              <StatefulForm action={giveCheckinAction} submitLabel="Send to the club" pendingLabel="Sending…">
                <input type="hidden" name="child" value={child.id} />
                <fieldset className="grid grid-cols-3 gap-2">
                  <legend className="sr-only">How is {child.firstName} finding football?</legend>
                  {(Object.keys(MOODS) as Mood[]).map((m) => (
                    <label
                      key={m}
                      className="flex min-h-14 cursor-pointer items-center justify-center rounded-app bg-fill px-2 text-center text-[15px] font-bold has-[:checked]:border-ink has-[:checked]:bg-paper has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]"
                    >
                      <input type="radio" name="mood" value={m} required className="sr-only" />
                      {FACES[m]}
                    </label>
                  ))}
                </fieldset>
                <div>
                  <label htmlFor="note" className="field-label">
                    Anything you&apos;d like the club to know? <span className="font-normal text-ink-muted">(optional)</span>
                  </label>
                  <textarea id="note" name="note" rows={3} maxLength={WELLBEING_NOTE_MAX} className="field" />
                </div>
                <label className="flex items-start gap-3 text-[15px]">
                  <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--grass)]" />
                  <span>
                    I&apos;m happy for the club&apos;s admins to see this. Coaches and other parents don&apos;t see it, and nothing you write is put in an email.
                  </span>
                </label>
              </StatefulForm>
              <p className="text-[13px] text-ink-muted">If you&apos;re worried about {child.firstName}&apos;s safety, speak to the club straight away rather than waiting for a reply here.</p>
            </section>

            {history.length > 0 ? (
              <section className="rounded-app bg-paper shadow-card p-4" aria-labelledby="earlier">
                <h2 id="earlier" className="text-[18px] font-bold">
                  Earlier check-ins
                </h2>
                <ul className="mt-2 flex flex-col">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-col gap-0.5 border-t border-line py-2.5 first:border-t-0">
                      <span className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
                        {shortDay(h.createdAt)}
                        <Pill tone="neutral">{MOODS[h.mood]}</Pill>
                        {h.followedUpAt ? <Pill tone="done">Followed up</Pill> : null}
                      </span>
                      {h.note ? <span className="text-[15px] whitespace-pre-line">{h.note}</span> : null}
                      {h.givenBy ? <span className="text-[13px] text-ink-muted">From {h.givenBy}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
