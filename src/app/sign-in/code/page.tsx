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
        <>
          If <span className="font-bold text-on-pitch">{pending.to}</span> is the address the club has for you, a code is on its way. It
          works for 15 minutes.
        </>
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
