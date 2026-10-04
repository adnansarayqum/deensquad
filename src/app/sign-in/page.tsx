import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, FormError } from "@/components/auth/AuthShell";
import { EmailForm } from "@/components/auth/EmailForm";
import { safeNext } from "@/lib/auth/cookies";
import { getCurrentUser } from "@/lib/auth/session";
import { privacyUrl } from "@/lib/config";
import { demoSignIn } from "@/lib/auth/demo";
import { isDemo } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getCurrentUser()) redirect("/");
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  const privacy = privacyUrl();

  if (isDemo()) {
    const roles = [
      { role: "parent", label: "Parent", detail: "Adnan: two children, Yusuf (U10s) and Musa (U7s)" },
      { role: "admin", label: "Club admin", detail: "Families, news with read receipts, sessions, staff" },
      { role: "coach", label: "Coach", detail: "The gate register on Friday" },
    ];
    return (
      <AuthShell title="Try the app" intro="This is a demo with a made-up club. Tap a role to look around. Nothing you do here sends any messages.">
        {roles.map((r) => (
          <form key={r.role} action={demoSignIn}>
            <input type="hidden" name="role" value={r.role} />
            <button type="submit" className="flex w-full flex-col items-start gap-0.5 rounded-app border-2 border-line bg-paper p-4 text-left shadow-lip-neutral transition-transform active:translate-y-1 active:shadow-none">
              <span className="text-[17px] font-extrabold">{r.label}</span>
              <span className="text-sm text-ink-muted">{r.detail}</span>
            </button>
          </form>
        ))}
        <p className="text-sm leading-5 text-ink-muted">To switch role, sign out from the player tab or the admin menu.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in" intro="Club news, Friday sessions and your child's progress, all in one place.">
      {params.link === "expired" ? (
        <FormError id="link-error">That sign-in link has expired or has already been used. Ask for a new code below.</FormError>
      ) : null}
      <EmailForm next={next} />
      <p className="text-sm leading-5 text-ink-muted">
        Not getting emails? Check your spam folder, or ask the club which email address they have for you.
      </p>
      <p className="text-[15px]">
        New to the club?{" "}
        <Link href="/sign-up" className="font-bold text-grass-text underline">
          Sign up
        </Link>
      </p>
      <a href={privacy} className="text-sm font-bold text-grass-text underline" target="_blank" rel="noopener noreferrer">
        How the club uses your information
      </a>
    </AuthShell>
  );
}
