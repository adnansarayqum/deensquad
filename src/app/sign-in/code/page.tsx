import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { CodeForm } from "@/components/auth/CodeForm";
import { readPending } from "@/lib/auth/pending";

export const metadata: Metadata = { title: "Enter your code" };

export default async function CodePage() {
  const pending = await readPending();
  if (!pending) redirect("/sign-in");

  return (
    <AuthShell
      title="Check your email"
      intro={
        pending.signUp ? (
          <>
            We&apos;ve emailed a 6-digit code to <span className="font-bold text-on-pitch">{pending.to}</span>. Enter it to finish joining.
            Your family isn&apos;t added until you do. It works for 15 minutes.
          </>
        ) : (
          // Deliberately the same for any address, so this screen never tells anyone who is a member.
          <>
            We&apos;ve sent a code to <span className="font-bold text-on-pitch">{pending.to}</span> if it&apos;s on the club&apos;s list. It
            works for 15 minutes. Already got a code? Enter the latest one.
          </>
        )
      }
    >
      <CodeForm />
      <p className="text-sm leading-5 text-ink-muted">
        Nothing after a couple of minutes? Check your spam folder, then{" "}
        <Link href="/sign-in" className="font-bold text-grass-text underline">
          try again
        </Link>{" "}
        or ask the club which email address they have for you.
      </p>
    </AuthShell>
  );
}
