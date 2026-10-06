import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { GROUP_LABELS, MAX_CHILDREN } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { clubInfoText, privacyUrl } from "@/lib/config";
import { isDemo } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  // The demo has no real email, so there is no way to receive the code.
  if (isDemo() || (await getCurrentUser())) redirect("/");
  const privacy = privacyUrl();
  const info = clubInfoText();
  return (
    <AuthShell title="Join the club" intro="Sign up to get club news, tell the coach who's coming on Friday and follow your child's progress.">
      {info ? (
        <section aria-labelledby="about-club" className="flex flex-col gap-1 rounded-app border-2 border-line bg-paper p-4">
          <h2 id="about-club" className="text-base font-extrabold">
            About the club
          </h2>
          <p className="text-[15px] leading-[22px] whitespace-pre-line">{info}</p>
        </section>
      ) : null}
      <SignUpForm groups={AGE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))} maxChildren={MAX_CHILDREN} />
      <p className="text-[15px]">
        Already signed up?{" "}
        <Link href="/sign-in" className="font-bold text-grass-text underline">
          Sign in
        </Link>
      </p>
      <a href={privacy} className="text-sm font-bold text-grass-text underline" target="_blank" rel="noopener noreferrer">
        How the club uses your information
      </a>
    </AuthShell>
  );
}
