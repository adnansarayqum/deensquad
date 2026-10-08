import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackHeader } from "@/components/BackHeader";
import { MyDetailsForm } from "@/components/ProfileForms";
import { Card } from "@/components/ui";
import { clubEmail } from "@/lib/config";
import { asUser } from "@/lib/db";
import { getFamily } from "@/lib/parent/load";
import { loadMyDetails } from "@/lib/parent/profile";

export const metadata: Metadata = { title: "Your details" };

/** Player → Your details: the parent's own name and mobile. Their email is their sign-in, so the club changes that. */
export default async function MyDetailsPage() {
  const { user } = await getFamily();
  const details = await asUser(user.id, loadMyDetails);
  if (!details) notFound();
  const email = clubEmail();

  return (
    <>
      <BackHeader back="/player" backLabel="Back" title="Your details">
        What the club has for you. Keep it up to date so the coaches can reach you.
      </BackHeader>
      <main className="flex flex-col gap-4 px-4 pt-4 pb-4">
        <Card className="p-4">
          <MyDetailsForm details={details} />
        </Card>
        <Card className="flex flex-col gap-1 p-4">
          <h2 className="text-base font-extrabold">Email address</h2>
          <p className="text-[15px] leading-[22px] [overflow-wrap:anywhere]">{details.email ?? user.email}</p>
          <p className="text-sm leading-5 text-ink-muted">
            It&apos;s how you sign in, so it can&apos;t be changed here. To change your email, ask the club
            {email ? (
              <>
                {" "}
                at{" "}
                <a href={`mailto:${email}`} className="font-bold text-grass-text underline">
                  {email}
                </a>
              </>
            ) : null}
            .
          </p>
        </Card>
      </main>
    </>
  );
}
