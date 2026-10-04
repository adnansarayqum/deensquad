import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell, FormError } from "@/components/auth/AuthShell";
import { EmailForm } from "@/components/auth/EmailForm";
import { safeNext } from "@/lib/auth/cookies";
import { getCurrentUser } from "@/lib/auth/session";
import { privacyUrl } from "@/lib/config";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/");
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  const privacy = privacyUrl();

  return (
    <AuthShell title="Sign in" intro="Club news, Friday sessions and your child's progress, all in one place.">
      {params.link === "expired" ? (
        <FormError id="link-error">That sign-in link has expired or has already been used. Ask for a new code below.</FormError>
      ) : null}
      <EmailForm next={next} />
      <p className="text-sm leading-5 text-ink-muted">
        Not getting emails? Check your spam folder, or ask the club which email address they have for you.
      </p>
      {privacy ? (
        <a href={privacy} className="text-sm font-bold text-grass-text underline" target="_blank" rel="noopener noreferrer">
          How the club uses your information
        </a>
      ) : null}
    </AuthShell>
  );
}
