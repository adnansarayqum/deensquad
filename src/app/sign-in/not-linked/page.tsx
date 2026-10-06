import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { requireUser } from "@/lib/auth/session";
import { SignOutForm } from "@/components/SignOutForm";

export const metadata: Metadata = { title: "Not linked yet" };

export default async function NotLinkedPage() {
  const user = await requireUser();
  return (
    <AuthShell title="Nearly there" intro="You're signed in, but this email isn't linked to a player at the club yet.">
      <p className="text-[15px] leading-[22px]">
        Ask the club to add <span className="font-bold">{user.email}</span> to your child&apos;s record, then open the app again.
      </p>
      <SignOutForm>
        <button type="submit" className="btn-chunky btn-paper w-full">
          Sign out
        </button>
      </SignOutForm>
    </AuthShell>
  );
}
