import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { GROUP_LABELS, MAX_CHILDREN } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { privacyUrl } from "@/lib/config";
import { isDemo } from "@/lib/db";
import { AGE_GROUPS } from "@/lib/domain";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage() {
  // The demo has no real email, so there is no way to receive the code.
  if (isDemo() || (await getCurrentUser())) redirect("/");
  const privacy = privacyUrl();
  return (
    <AuthShell title="Join the club" intro="Sign up to get club news, tell the coach who's coming on Friday and follow your child's progress.">
      <SignUpForm groups={AGE_GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g] }))} maxChildren={MAX_CHILDREN} />
      <p className="text-[15px]">
        Already signed up?{" "}
        <Link href="/sign-in" className="font-bold text-grass-text underline">
          Sign in
        </Link>
      </p>
      {privacy ? (
        <a href={privacy} className="text-sm font-bold text-grass-text underline" target="_blank" rel="noopener noreferrer">
          How the club uses your information
        </a>
      ) : null}
    </AuthShell>
  );
}
