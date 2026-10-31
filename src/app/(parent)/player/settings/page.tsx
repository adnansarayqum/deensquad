import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { AppearanceChoice } from "@/components/AppearanceChoice";
import { BackHeader } from "@/components/BackHeader";
import { DownloadMyData } from "@/components/DownloadMyData";
import { NotificationsCard } from "@/components/NotificationsCard";
import { SignOutForm } from "@/components/SignOutForm";
import { loadMyDeletionRequest } from "@/lib/data-requests";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";
import { loadFamilyParents } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Settings" };

const row = "flex min-h-[52px] items-center justify-between gap-3 border-b-2 border-line px-3 text-[16px] font-bold last:border-b-0";

/**
 * Family → Settings (redesign brief, Oct 2026): the account things that used to sit at the foot of Family, so Family
 * starts with the children. Your details, parents and carers, adding a child, notifications, appearance, your data,
 * privacy and sign out.
 */
export default async function SettingsPage() {
  const { user, family } = await getFamily();
  const [deletionAsked, parents] = await asUser(user.id, (tx) => Promise.all([loadMyDeletionRequest(tx), loadFamilyParents(tx)]));
  const others = parents.filter((p) => !p.you);

  return (
    <>
      <BackHeader back="/player" backLabel="Family" title="Settings" />
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <section aria-labelledby="account" className="flex flex-col rounded-app border-2 border-line bg-paper p-1">
          <h2 id="account" className="px-3 pt-3 pb-1 text-[17px] font-extrabold">
            You and your family
          </h2>
          <Link href="/player/me" className={row}>
            <span>
              Your details
              <span className="font-normal text-ink-muted"> · {parents.find((p) => p.you)?.firstName ?? "you"}</span>
            </span>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
          {others.map((p) => (
            <p key={p.id} className={`${row} font-bold`}>
              <span>
                {p.firstName} {p.lastName}
                <span className="font-normal text-ink-muted"> · {p.signedIn ? "using the app" : p.invited ? "invited" : "not invited yet"}</span>
              </span>
            </p>
          ))}
          {family.children.length > 0 ? (
            <Link href="/player/add-parent" className={row}>
              {others.length ? "Add another parent or carer" : "Add a parent or carer"}
              <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
            </Link>
          ) : null}
          <Link href="/player/add-child" className={row}>
            Add a child
            <ChevronRight aria-hidden size={20} className="shrink-0 text-ink-muted" />
          </Link>
        </section>

        <section aria-labelledby="notifications" className="flex flex-col gap-2">
          <h2 id="notifications" className="text-[17px] font-extrabold">
            Notifications
          </h2>
          <NotificationsCard publicKey={process.env.VAPID_PUBLIC_KEY ?? null} />
          <p className="text-[15px] leading-[22px] text-ink-muted">
            Club news that asks to be read is emailed too if you haven&apos;t read it after a day.
          </p>
        </section>

        <section aria-labelledby="appearance" className="flex flex-col gap-2">
          <h2 id="appearance" className="text-[17px] font-extrabold">
            Appearance
          </h2>
          <AppearanceChoice />
        </section>

        <section aria-labelledby="your-data" className="flex flex-col gap-2 rounded-app border-2 border-line bg-paper p-4">
          <h2 id="your-data" className="text-[17px] font-extrabold">
            Your data
          </h2>
          <p className="text-[15px] leading-[22px]">See everything the app holds about you and your children, or ask the club to delete your account.</p>
          <DownloadMyData />
          {deletionAsked ? (
            <p role="status" className="text-[15px] leading-[22px]">
              You asked the club to delete your account on{" "}
              {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(new Date(deletionAsked))}. An admin will be in
              touch.
            </p>
          ) : (
            <Link href="/player/delete-account" className="inline-flex min-h-12 items-center self-start text-[15px] font-bold text-ink-muted underline">
              Ask the club to delete my account
            </Link>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[15px]">
          <span className="min-w-0 text-ink-muted [overflow-wrap:anywhere]">Signed in as {user.email}</span>
          <a href="/privacy?from=/player/settings" className="inline-flex min-h-12 items-center font-bold text-ink-muted underline">
            Privacy
          </a>
          <SignOutForm>
            <button type="submit" className="inline-flex min-h-12 items-center gap-1.5 font-bold text-ink-muted">
              <LogOut aria-hidden size={18} />
              Sign out
            </button>
          </SignOutForm>
        </div>
      </main>
    </>
  );
}
