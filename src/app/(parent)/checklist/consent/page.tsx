import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { savePhotoConsent } from "@/lib/parent/actions";
import { getChild } from "@/lib/parent/load";

export const metadata: Metadata = { title: "Photo consent" };

export default async function ConsentPage({ searchParams }: PageProps<"/checklist/consent">) {
  const { child, family } = await getChild((await searchParams).child);
  if (!child) redirect("/checklist");
  const name = child.firstName;
  const current = child.photoConsent === null ? null : child.photoConsent ? "yes" : "no";
  // Brothers and sisters can take the same answer in one go. Those without an answer yet are ticked; one whose
  // answer is already saved (perhaps by the other parent) is left unticked and shows it, so it's never changed unseen.
  const siblings = family.children.filter((c) => c.id !== child.id);
  const option =
    "flex cursor-pointer items-start gap-3 rounded-app border-2 border-line bg-paper p-4 shadow-lip-neutral has-[:checked]:border-grass has-[:checked]:bg-grass-tint";

  return (
    <>
      <BackHeader back="/checklist" backLabel="Checklist" title="Photo consent">
        We share match and training photos with parents and on the club&apos;s social media. You can change this at any time.
      </BackHeader>

      <main className="px-4 pt-4 pb-4">
        <form action={savePhotoConsent} className="flex flex-col gap-3">
          <input type="hidden" name="child" value={child.id} />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-extrabold">Can {name} appear in club photos?</legend>
            <label className={option}>
              <input type="radio" name="consent" value="yes" defaultChecked={current === "yes"} required className="mt-1 h-5 w-5 accent-[var(--grass)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold">Yes, photos are fine</span>
                <span className="text-sm text-ink-muted">
                  {name} can appear in photos the club shares with parents, in the app and on the club&apos;s social media.
                </span>
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="consent" value="no" defaultChecked={current === "no"} className="mt-1 h-5 w-5 accent-[var(--grass)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold">No photos, please</span>
                <span className="text-sm text-ink-muted">{name}&apos;s face is blurred before any photo is shared.</span>
              </span>
            </label>
          </fieldset>
          {siblings.length > 0 ? (
            <fieldset className="mt-2 flex flex-col gap-2">
              <legend className="field-label">Same for all my children</legend>
              {siblings.map((s) => (
                <label key={s.id} className="flex min-h-12 items-center gap-3 rounded-app border-2 border-line bg-paper px-3.5 py-2">
                  <input type="checkbox" name="child" value={s.id} defaultChecked={s.photoConsent === null} className="h-5 w-5 accent-[var(--grass)]" />
                  <span className="flex flex-col">
                    <span className="text-base font-bold">{s.firstName}</span>
                    {s.photoConsent !== null ? (
                      <span className="text-sm text-ink-muted">Now: {s.photoConsent ? "photos are fine" : "no photos"}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}
          <button type="submit" className="btn-chunky btn-grass mt-2">
            Save answer
          </button>
        </form>
      </main>
    </>
  );
}
