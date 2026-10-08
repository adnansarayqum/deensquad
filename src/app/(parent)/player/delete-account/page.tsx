import type { Metadata } from "next";
import Link from "next/link";
import { BackHeader } from "@/components/BackHeader";
import { Card } from "@/components/ui";
import { loadMyDeletionRequest } from "@/lib/data-requests";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";
import { askToDeleteAccount } from "@/lib/parent/actions";

export const metadata: Metadata = { title: "Delete my account" };

const longDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }).format(new Date(iso));

/** The confirm step for "Ask the club to delete my account" (Player → Your data). Nothing is deleted from here. */
export default async function DeleteAccountPage() {
  const { user, family } = await getFamily();
  const asked = await asUser(user.id, loadMyDeletionRequest);
  const names = family.children.map((c) => c.firstName);
  const children = names.length === 0 ? "your children" : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

  return (
    <>
      <BackHeader back="/player" backLabel="Back" title="Delete my account">
        Ask the club to remove you from the app.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        {asked ? (
          <Card tone="grass" className="flex flex-col gap-2 p-4">
            <h2 className="text-[17px] font-extrabold text-grass-text">Request sent</h2>
            <p role="status" className="text-[15px] leading-[22px]">
              You asked the club to delete your account on {longDay(asked)}. An admin will be in touch before anything is deleted. You can keep using the
              app until then.
            </p>
            <Link href="/player" className="btn-chunky btn-paper mt-1 self-start">
              Back to {names.length === 1 ? names[0] : "Players"}
            </Link>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 p-4">
            <h2 className="text-[17px] font-extrabold">Before you ask</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-[22px]">
              <li>This sends a request to the club&apos;s admins. Nothing is deleted straight away.</li>
              <li>An admin will contact you about {children}&apos;s place at the club and their records, such as attendance and payments.</li>
              <li>Once your account is deleted you can&apos;t sign in to the app.</li>
            </ul>
            <p className="text-[15px] leading-[22px]">
              Want a copy first?{" "}
              <a href="/api/me/export" download className="font-bold text-grass-text underline">
                Download my data
              </a>
              .
            </p>
            <form action={askToDeleteAccount} className="flex flex-col gap-2">
              <button type="submit" className="btn-chunky btn-grass">
                Send the request to the club
              </button>
              <Link href="/player" className="inline-flex min-h-12 items-center justify-center text-[15px] font-bold text-ink-muted underline">
                Keep my account
              </Link>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
