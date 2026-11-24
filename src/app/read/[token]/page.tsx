import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { asSystem } from "@/lib/db";
import { confirmRead } from "@/lib/news/read-actions";
import { peekReadLink } from "@/lib/news/read-link";

export const metadata: Metadata = { title: "I've read this", robots: { index: false } };

// The reminder email's "I've read this" button lands here. Opening the page records nothing (email scanners open
// links by themselves): the parent's tap does. No sign-in is needed; the link is signed for them and that post.
export default async function ReadPage({ params, searchParams }: PageProps<"/read/[token]">) {
  const { token } = await params;
  const { busy } = await searchParams;
  const link = await asSystem((tx) => peekReadLink(tx, token));

  if (!link) {
    return (
      <AuthShell title="This link has stopped working" intro="The message may be an old one. Open the app to see the club's latest news.">
        <Link href="/news" className="btn-chunky btn-grass">
          Open the app
        </Link>
      </AuthShell>
    );
  }

  if (link.read) {
    return (
      <AuthShell title="Thank you" intro={<>The club knows you&apos;ve read <span className="font-bold text-ink">{link.title}</span>. You won&apos;t be reminded about it again.</>}>
        <Link href="/news" className="btn-chunky btn-paper">
          Open the app
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Let the club know"
      intro={
        <>
          Assalamu alaikum {link.firstName}. Tap below to tell the club you&apos;ve read <span className="font-bold text-ink">{link.title}</span>.
        </>
      }
    >
      {busy ? <p className="mb-3 text-[15px] text-kit-orange">That didn&apos;t save. Try again in a few minutes.</p> : null}
      <form action={confirmRead}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="btn-chunky btn-grass w-full">
          I&apos;ve read this
        </button>
      </form>
    </AuthShell>
  );
}
