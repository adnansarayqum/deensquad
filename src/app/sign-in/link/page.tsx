import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { submitLink } from "@/lib/auth/actions";
import { peekLink } from "@/lib/auth/service";
import { maskEmail } from "@/lib/auth/tokens";
import { asSystem } from "@/lib/db";

export const metadata: Metadata = { title: "Sign in" };

// Opening the link only shows a button. Signing in takes a tap, so email scanners that
// open links automatically can't use them up before the parent does.
export default async function LinkPage({ searchParams }: PageProps<"/sign-in/link">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length >= 20 ? await asSystem((tx) => peekLink(tx, token, new Date())) : null;

  if (!valid) {
    return (
      <AuthShell title="Link expired" intro="This sign-in link has expired or has already been used.">
        <Link href="/sign-in" className="btn-chunky btn-grass">
          Get a new code
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={valid.purpose === "invite" ? "Welcome" : "Sign in"}
      intro={
        <>
          Signing in as <span className="font-bold text-on-pitch">{maskEmail(valid.email)}</span>.
        </>
      }
    >
      <form action={submitLink}>
        <input type="hidden" name="token" value={token as string} />
        <button type="submit" className="btn-chunky btn-grass w-full">
          Continue
        </button>
      </form>
    </AuthShell>
  );
}
