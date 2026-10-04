import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-start justify-center gap-4 bg-pitch-deep px-6 text-on-pitch">
      <p className="text-label text-crest-gold uppercase">Offside</p>
      <h1 className="font-display text-[56px] leading-[0.9] text-floodlight">That page isn&apos;t on the pitch</h1>
      <Link href="/news" className="btn-chunky btn-grass">
        Back to club news
      </Link>
    </main>
  );
}
