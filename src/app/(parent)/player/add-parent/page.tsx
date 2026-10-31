import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { AddParentForm } from "@/components/ProfileForms";
import { Card } from "@/components/ui";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";
import { loadFamilyParents, type FamilyParent } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Add a parent or carer" };

const names = (list: string[]) => (list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`);

function status(p: FamilyParent): string {
  if (p.you) return "You";
  if (p.signedIn) return "Using the app";
  return p.invited ? "Invited, not signed in yet" : "Not invited yet";
}

/** Player → Your family → Add the other parent: who's on the children's account now, and the form to add another. */
export default async function AddParentPage() {
  const { user, family } = await getFamily();
  if (family.children.length === 0) notFound();
  const parents = await asUser(user.id, loadFamilyParents);
  const several = family.children.length > 1;

  return (
    <>
      <BackHeader back="/player/settings" backLabel="Settings" title="Add a parent or carer">
        Add your child&apos;s other parent or carer. They get their own sign-in and see the same as you: news, Friday answers, messages and
        progress.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <section aria-labelledby="parents-now" className="flex flex-col rounded-app bg-paper shadow-card p-1">
          <h2 id="parents-now" className="px-3 pt-3 pb-1 text-base font-bold">
            Parents in the app now
          </h2>
          <ul>
            {parents.map((p, i) => (
              <li key={p.id} className={`flex flex-col px-3 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
                <span className="text-[15px] font-bold">
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {status(p)}
                  {several ? ` · ${names(p.children)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <Card className="p-4">
          <AddParentForm childList={family.children.map((c) => ({ id: c.id, firstName: c.firstName }))} />
        </Card>
        <p className="px-1 text-[15px] leading-5 text-ink-muted">
          The club is told who you add. To take a parent off, or change their email, ask the club.
        </p>
      </main>
    </>
  );
}
