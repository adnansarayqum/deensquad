import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AppHeader } from "@/components/ui";
import { savePhotoConsent } from "@/lib/actions";
import { getParentView } from "@/lib/data";

export const metadata: Metadata = { title: "Photo consent" };

export default async function ConsentPage() {
  const view = await getParentView();
  const child = view.player.firstName;
  const current = view.photoConsent;
  const option =
    "flex cursor-pointer items-start gap-3 rounded-app border-2 border-line bg-paper p-4 shadow-lip-neutral has-[:checked]:border-grass has-[:checked]:bg-grass-tint";

  return (
    <>
      <AppHeader>
        <Link href="/checklist" className="inline-flex items-center gap-1 self-start text-sm font-bold text-on-pitch-muted">
          <ChevronLeft aria-hidden size={18} />
          Checklist
        </Link>
        <h1 className="font-display text-[40px] leading-[0.95] tracking-[0.02em]">Photo consent</h1>
        <p className="text-sm text-on-pitch-muted">
          We share match and training photos with parents and on the club&apos;s social media. You can change this at any time.
        </p>
      </AppHeader>

      <main className="px-4 pt-4 pb-4">
        <form action={savePhotoConsent} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-base font-extrabold">Can {child} appear in club photos?</legend>
            <label className={option}>
              <input type="radio" name="consent" value="yes" defaultChecked={current === "yes"} required className="mt-1 h-5 w-5 accent-[var(--grass)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold">Yes, photos are fine</span>
                <span className="text-sm text-ink-muted">{child} can appear in photos the club shares.</span>
              </span>
            </label>
            <label className={option}>
              <input type="radio" name="consent" value="no" defaultChecked={current === "no"} className="mt-1 h-5 w-5 accent-[var(--grass)]" />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-bold">No photos, please</span>
                <span className="text-sm text-ink-muted">{child}&apos;s face is blurred before any photo is shared.</span>
              </span>
            </label>
          </fieldset>
          <button type="submit" className="btn-chunky btn-grass mt-2">
            Save answer
          </button>
        </form>
      </main>
    </>
  );
}
