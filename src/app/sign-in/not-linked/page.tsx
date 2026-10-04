import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { signOut } from "@/lib/auth/actions";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Not linked yet" };

export default async function NotLinkedPage() {
  const user = await requireUser();
  return (
    <AuthShell title="Nearly there" intro="You're signed in, but this email isn't linked to a player at the club yet.">
      <p className="text-[15px] leading-[22px]">
        Ask the club to add <span className="font-bold">{user.email}</span> to your child&apos;s record, then open the app again.
      </p>
      <form action={signOut}>
        <button type="submit" className="btn-chunky btn-paper w-full">
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
