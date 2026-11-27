import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { ClubFacts } from "@/components/auth/ClubFacts";
import { loadClubFacts } from "@/lib/club-facts";
import { SponsorCard } from "@/components/SponsorLogo";
import { loadSponsors } from "@/lib/sponsors/data";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { GROUP_LABELS, MAX_CHILDREN } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { clubInfoText, privacyUrl } from "@/lib/config";
import { asSystem, isDemo } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  // The demo has no real email, so there is no way to receive the code.
  if (isDemo() || (await getCurrentUser())) redirect("/");
  const privacy = privacyUrl();
  const info = clubInfoText();
  // Real facts only (staff checks, the club list, the sessions): asSystem, as nobody is signed in here.
  const [facts, sponsors] = await asSystem(async (tx) => [await loadClubFacts(tx, new Date()), await loadSponsors(tx)] as const);
  return (
    <AuthShell title="Join the club" intro="Sign up to get club news, tell the coach who's coming on Friday and follow your child's progress.">
      {info ? (
        <section aria-labelledby="about-club" className="flex flex-col gap-1 rounded-app bg-paper p-4 shadow-card">
          <h2 id="about-club" className="text-subhead font-bold">
            About the club
          </h2>
          <p className="text-small leading-[22px] whitespace-pre-line">{info}</p>
        </section>
      ) : null}
      <ClubFacts facts={facts} />
      <SignUpForm groups={AGE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))} maxChildren={MAX_CHILDREN} />
      {sponsors.length ? (
        <section aria-labelledby="supported-by" className="flex flex-col gap-3">
          <h2 id="supported-by" className="text-center text-small text-ink-muted">
            Proudly supported by
          </h2>
          <ul className="grid grid-cols-2 gap-2.5">
            {sponsors.map((s) => (
              <li key={s.id} className="last:odd:col-span-2 last:odd:mx-auto last:odd:w-[calc(50%-5px)]">
                <SponsorCard name={s.name} fileId={s.logoFileId} bg={s.logoBg} open />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-small">
        Already signed up?{" "}
        <Link href="/sign-in" className="font-bold text-grass-text underline">
          Sign in
        </Link>
      </p>
      <a href={privacy} className="text-small font-bold text-grass-text underline" target="_blank" rel="noopener noreferrer">
        How the club uses your information
      </a>
    </AuthShell>
  );
}
